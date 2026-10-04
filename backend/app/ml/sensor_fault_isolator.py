"""Dedicated sensor-fault detector and cross-channel residual isolator."""

from __future__ import annotations

from collections import deque
from typing import Deque, Dict, List, Tuple
import numpy as np

from backend.app.telemetry.schema import (
    CalculatedValues,
    ExpectedValues,
    SensorDiagnosisResult,
    ValidatedTelemetryFrame,
)

SENSOR_ISOLATOR_VERSION = "SensorFaultIsolator-v1.0"


class SensorFaultIsolator:
    """Separates instrumentation/sensor faults from physical aero-engine faults."""

    def __init__(self, window_size: int = 8) -> None:
        self.version = SENSOR_ISOLATOR_VERSION
        self.window_size = max(4, window_size)
        self._raw_history: Dict[Tuple[str, str], Deque[ValidatedTelemetryFrame]] = {}

    def reset_stream(self, engine_id: str, mission_id: str) -> None:
        self._raw_history.pop((engine_id, mission_id), None)

    def diagnose(
        self,
        actual: ValidatedTelemetryFrame,
        expected: ExpectedValues,
        calculated: CalculatedValues,
    ) -> SensorDiagnosisResult:
        key = (actual.engine_id, actual.mission_id)
        hist = self._raw_history.setdefault(key, deque(maxlen=self.window_size))
        hist.append(actual)

        suspected: List[str] = []
        evidence: List[str] = []
        submode: str | None = None

        # 1. Explicit missing or out-of-bounds sensor channels flagged by TelemetryValidator
        if actual.quality.invalid_sensor_channels:
            for ch in actual.quality.invalid_sensor_channels:
                if ch not in suspected:
                    suspected.append(ch)
            submode = "implausible_values"
            evidence.append(
                f"Plausibility range violation on channel(s): {', '.join(actual.quality.invalid_sensor_channels)}."
            )

        if actual.quality.missing_fields:
            for ch in actual.quality.missing_fields:
                if ch not in suspected:
                    suspected.append(ch)
            if submode is None:
                submode = "missing_samples"
            evidence.append(
                f"Missing/dropout telemetry samples on channel(s): {', '.join(actual.quality.missing_fields)}."
            )

        # 2. Stuck-at (zero variance over >= 5 consecutive frames while throttle/RPM varies)
        if len(hist) >= 5:
            for ch in ["cht_c", "egt_c", "oil_pressure_bar", "vibration_rms_mms"]:
                vals = [getattr(f, ch) for f in hist]
                std_v = float(np.std(vals))
                if std_v < 1e-5:
                    if ch not in suspected:
                        suspected.append(ch)
                    if submode is None:
                        submode = "stuck_at"
                    evidence.append(
                        f"Channel '{ch}' exhibits stuck-at flatline (rolling std={std_v:.6f} over {len(hist)} frames)."
                    )

        # 3. High-frequency unphysical noise check
        if calculated.cht_rolling_std_c > 16.0:
            if "cht_c" not in suspected:
                suspected.append("cht_c")
            if submode is None:
                submode = "high_noise"
            evidence.append(
                f"Unphysical high-frequency CHT noise (rolling std={calculated.cht_rolling_std_c:.2f} degC > 16.0 degC)."
            )

        # 4. Cross-channel thermodynamic consistency check (Single-channel drift/offset isolation)
        # In real mechanical faults, CHT, EGT, Oil Temp, Oil Pressure, and Vibration exhibit coupled shifts.
        # If ONE primary channel has a massive residual while all other coupled channels remain tightly nominal:
        cht_anom = abs(calculated.cht_residual_c) > 22.0
        egt_anom = abs(calculated.egt_residual_c) > 55.0
        oil_p_anom = abs(calculated.oil_pressure_residual_bar) > 0.90
        oil_t_anom = abs(calculated.oil_temp_residual_c) > 7.5
        vib_anom = abs(calculated.vibration_residual_mms) > 0.75
        fuel_anom = abs(calculated.fuel_flow_residual_lph) > 2.0

        # Case A: Isolated CHT sensor drift (large CHT residual, but Oil Temp, EGT, and Vibration are completely normal)
        if (
            abs(calculated.cht_residual_c) > 28.0
            and abs(calculated.oil_temp_residual_c) < 5.0
            and abs(calculated.egt_residual_c) < 16.0
            and abs(calculated.vibration_residual_mms) < 0.55
        ):
            if "cht_c" not in suspected:
                suspected.append("cht_c")
            if submode is None:
                submode = "drift"
            evidence.append(
                f"Uncorroborated CHT residual ({calculated.cht_residual_c:+.1f} degC) while Oil Temp residual ({calculated.oil_temp_residual_c:+.1f} degC) and EGT residual ({calculated.egt_residual_c:+.1f} degC) remain nominal."
            )

        # Case B: Isolated EGT thermocouple drift (large EGT residual, but CHT, Vibration, Fuel Flow, RPM normal)
        if (
            abs(calculated.egt_residual_c) > 80.0
            and abs(calculated.cht_residual_c) < 5.5
            and abs(calculated.vibration_residual_mms) < 0.55
            and abs(calculated.fuel_flow_residual_lph) < 1.5
        ):
            if "egt_c" not in suspected:
                suspected.append("egt_c")
            if submode is None:
                submode = "drift"
            evidence.append(
                f"Uncorroborated EGT thermocouple residual ({calculated.egt_residual_c:+.1f} degC) with nominal CHT, Fuel Flow, and Vibration."
            )

        # Case C: Isolated Oil Pressure transducer drift (large Oil Pressure drop, but Oil Temp and Vibration remain completely nominal)
        if (
            abs(calculated.oil_pressure_residual_bar) > 1.25
            and abs(calculated.oil_temp_residual_c) < 5.0
            and abs(calculated.vibration_residual_mms) < 0.45
        ):
            if "oil_pressure_bar" not in suspected:
                suspected.append("oil_pressure_bar")
            if submode is None:
                submode = "drift"
            evidence.append(
                f"Uncorroborated Oil Pressure transducer residual ({calculated.oil_pressure_residual_bar:+.2f} bar) with no Oil Temp rise ({calculated.oil_temp_residual_c:+.1f} degC) or friction vibration ({calculated.vibration_residual_mms:+.2f} mm/s)."
            )

        # Case D: Isolated Accelerometer / Vibration sensor fault (severe vibration reading with zero oil/thermal/RPM corroboration)
        if (
            abs(calculated.vibration_residual_mms) > 3.2
            and abs(calculated.oil_pressure_residual_bar) < 0.25
            and abs(calculated.oil_temp_residual_c) < 4.5
            and abs(calculated.egt_residual_c) < 22.0
            and abs(calculated.cht_residual_c) < 6.0
        ):
            if "vibration_rms_mms" not in suspected:
                suspected.append("vibration_rms_mms")
            if submode is None:
                submode = "drift"
            evidence.append(
                f"Uncorroborated Vibration sensor residual ({calculated.vibration_residual_mms:+.2f} mm/s) with nominal Oil Pressure, Oil Temp, CHT, and EGT."
            )

        if suspected:
            # Check if simultaneous multi-channel mechanical symptoms make it ambiguous
            coupled_count = sum([cht_anom, egt_anom, oil_p_anom, oil_t_anom, vib_anom, fuel_anom])
            if (
                coupled_count >= 3
                and not actual.quality.invalid_sensor_channels
                and not actual.quality.missing_fields
                and submode != "stuck_at"
            ):
                return SensorDiagnosisResult(
                    isolator_version=self.version,
                    is_sensor_fault_detected=False,
                    is_ambiguous=True,
                    diagnosis_status="AMBIGUOUS_SENSOR_VS_ENGINE",
                    suspected_channels=suspected,
                    fault_submode=submode,
                    confidence=0.52,
                    evidence=evidence
                    + [
                        "Multi-channel residuals are simultaneously active; cannot rule out concurrent mechanical degradation."
                    ],
                )

            return SensorDiagnosisResult(
                isolator_version=self.version,
                is_sensor_fault_detected=True,
                is_ambiguous=False,
                diagnosis_status="SENSOR_FAULT_ISOLATED",
                suspected_channels=suspected,
                fault_submode=submode or "drift",
                confidence=0.92,
                evidence=evidence,
            )

        # Check borderline ambiguity when one channel is moderately off without corroboration
        if (
            15.0 < abs(calculated.cht_residual_c) <= 28.0
            and abs(calculated.oil_temp_residual_c) < 4.0
            and abs(calculated.egt_residual_c) < 12.0
        ):
            return SensorDiagnosisResult(
                isolator_version=self.version,
                is_sensor_fault_detected=False,
                is_ambiguous=True,
                diagnosis_status="AMBIGUOUS_SENSOR_VS_ENGINE",
                suspected_channels=["cht_c"],
                fault_submode="possible_offset",
                confidence=0.48,
                evidence=[
                    f"Borderline single-channel CHT deviation ({calculated.cht_residual_c:+.1f} degC) without thermal corroboration in Oil Temp or EGT."
                ],
            )

        return SensorDiagnosisResult(
            isolator_version=self.version,
            is_sensor_fault_detected=False,
            is_ambiguous=False,
            diagnosis_status="SENSORS_NOMINAL",
            suspected_channels=[],
            fault_submode=None,
            confidence=0.98,
            evidence=["All telemetry channels pass range, continuity, noise, and thermodynamic cross-checks."],
        )
