"""Physics-informed reference engine model and deterministic residual calculator.

Model Version: Rotax914-Simplified-Ref-v1.0
Application Context: 4-cylinder horizontally-opposed turbocharged aero piston engine
used in MALE UAV platforms.

DISCLOSURE:
This module uses explicit analytical lumped-parameter reference equations with
documented assumptions. It is NOT a flight-validated thermodynamic cycle simulation.
"""

from __future__ import annotations

from collections import deque
import math
from typing import Any, Deque, Dict, List, Tuple

import numpy as np

from backend.app.telemetry.schema import (
    CalculatedValues,
    ExpectedValues,
    TELEMETRY_UNITS,
    ValidatedTelemetryFrame,
)

PHYSICS_MODEL_VERSION = "Rotax914-Simplified-Ref-v1.0"
CALCULATOR_VERSION = "CalcEngine-v1.0"

SUPPORTED_OPERATING_ENVELOPE: Dict[str, Dict[str, float | str]] = {
    "rpm": {"min": 1400.0, "max": 6000.0, "nominal": 5000.0, "unit": "RPM"},
    "throttle_pct": {"min": 0.0, "max": 100.0, "nominal": 72.0, "unit": "%"},
    "engine_load_pct": {"min": 0.0, "max": 115.0, "nominal": 75.0, "unit": "%"},
    "altitude_m": {"min": -100.0, "max": 7000.0, "nominal": 3000.0, "unit": "m"},
    "ambient_temp_c": {"min": -35.0, "max": 50.0, "nominal": 15.0, "unit": "degC"},
}

OPERATIONAL_SAFETY_LIMITS: Dict[str, Dict[str, float]] = {
    "cht_max_c": {"caution": 205.0, "warning": 220.0, "critical": 235.0},
    "egt_max_c": {"caution": 885.0, "warning": 920.0, "critical": 950.0},
    "oil_pressure_min_bar": {"caution": 2.4, "warning": 1.9, "critical": 1.5},
    "oil_temp_max_c": {"caution": 122.0, "warning": 132.0, "critical": 140.0},
    "vibration_max_mms": {"caution": 4.2, "warning": 5.8, "critical": 7.5},
}


class AeroPistonReferenceModel:
    """Physics-informed reference estimator and causal residual/trend calculator."""

    def __init__(self, rolling_window_size: int = 12) -> None:
        self.model_version = PHYSICS_MODEL_VERSION
        self.calculator_version = CALCULATOR_VERSION
        self.rolling_window_size = max(3, rolling_window_size)
        # Keyed by (engine_id, mission_id) -> deque of (elapsed_sec, actual_frame, expected_values)
        self._history: Dict[
            Tuple[str, str],
            Deque[Tuple[float, ValidatedTelemetryFrame, ExpectedValues]],
        ] = {}

    def reset_engine_state(self, engine_id: str, mission_id: str) -> None:
        self._history.pop((engine_id, mission_id), None)

    def get_model_metadata(self) -> Dict[str, Any]:
        return {
            "model_version": self.model_version,
            "calculator_version": self.calculator_version,
            "engine_class": "4-Cylinder 4-Stroke Turbocharged Aero Piston (MALE UAV Class)",
            "displacement_liters": 1.211,
            "rated_power_hp": 115.0,
            "rated_rpm": 5800.0,
            "continuous_rpm": 5500.0,
            "supported_operating_envelope": SUPPORTED_OPERATING_ENVELOPE,
            "operational_safety_limits": OPERATIONAL_SAFETY_LIMITS,
            "assumptions": [
                "ISA troposphere air density ratio sigma = (1 - 2.2558e-5 * h)^4.2559.",
                "Cooling air heat rejection scales with sigma^0.35 and ambient temperature offset from 15 degC.",
                "Steady-state CHT and EGT scale nonlinearly with normalized engine load and RPM, with full-power fuel enrichment above 85% load moderating peak EGT.",
                "Oil pressure scales with gear-pump speed up to relief-valve regulation and decreases with oil temperature viscosity thinning (-0.018 bar/degC above 95 degC).",
                "Broadband vibration RMS reflects 1st/2nd-order reciprocating inertial forces (~ (RPM/5500)^1.4) and combustion torque load.",
            ],
            "limitations": [
                "Simplified analytical reference model; not a calibrated 1D gas-dynamic or finite-element thermal simulation.",
                "Extrapolation outside supported operating bounds (RPM [1400, 6000], Altitude [-100, 7000]m, Ambient [-35, +50]degC) is explicitly flagged.",
            ],
        }

    def check_operating_envelope(
        self,
        rpm: float,
        throttle_pct: float,
        engine_load_pct: float,
        altitude_m: float,
        ambient_temp_c: float,
    ) -> Tuple[bool, List[str]]:
        reasons: List[str] = []
        inputs = {
            "rpm": rpm,
            "throttle_pct": throttle_pct,
            "engine_load_pct": engine_load_pct,
            "altitude_m": altitude_m,
            "ambient_temp_c": ambient_temp_c,
        }
        for name, val in inputs.items():
            spec = SUPPORTED_OPERATING_ENVELOPE[name]
            min_v = float(spec["min"])
            max_v = float(spec["max"])
            unit = str(spec["unit"])
            if val < min_v or val > max_v:
                reasons.append(
                    f"{name}={val:.1f}{unit} outside supported physics envelope [{min_v}, {max_v}]{unit}"
                )
        return (len(reasons) > 0, reasons)

    def estimate_expected(self, frame: ValidatedTelemetryFrame) -> ExpectedValues:
        """Compute physics-informed EXPECTED telemetry conditional on operating state."""
        is_extrapolated, reasons = self.check_operating_envelope(
            rpm=frame.rpm,
            throttle_pct=frame.throttle_pct,
            engine_load_pct=frame.engine_load_pct,
            altitude_m=frame.altitude_m,
            ambient_temp_c=frame.ambient_temp_c,
        )

        # Clamped normalized operating coordinates for numerical stability even when extrapolated
        rpm_clamped = max(800.0, min(6800.0, frame.rpm))
        load_clamped = max(5.0, min(125.0, frame.engine_load_pct))
        alt_clamped = max(-300.0, min(9500.0, frame.altitude_m))
        amb_clamped = max(-50.0, min(60.0, frame.ambient_temp_c))

        u_rpm = rpm_clamped / 5500.0
        u_load = load_clamped / 100.0

        # Atmospheric density ratio (ISA troposphere)
        base_term = max(0.15, 1.0 - 2.2558e-5 * alt_clamped)
        sigma_alt = max(0.28, min(1.10, base_term ** 4.2559))
        cooling_eff = sigma_alt ** 0.35

        # 1. Expected CHT (degC)
        cht_ss = (
            105.0
            + 48.0 * (u_load ** 0.85)
            + 24.0 * u_rpm
            + 0.65 * (amb_clamped - 15.0)
            + 18.0 * (1.0 - cooling_eff)
        )

        # 2. Expected EGT (degC)
        enrichment_cooling = 22.0 * max(0.0, u_load - 0.85)
        egt_ss = (
            510.0
            + 255.0 * (u_load ** 0.75)
            + 75.0 * u_rpm
            + 0.45 * (amb_clamped - 15.0)
            + 28.0 * (1.0 - sigma_alt)
            - enrichment_cooling
        )

        # 3. Expected Oil Temperature (degC)
        oil_temp_ss = (
            68.0
            + 28.0 * u_load
            + 10.0 * u_rpm
            + 0.55 * (amb_clamped - 15.0)
            + 10.0 * (1.0 - cooling_eff)
        )

        # 4. Expected Oil Pressure (bar)
        oil_press_raw = (
            1.60
            + 3.40 * min(1.05, u_rpm)
            - 0.018 * (oil_temp_ss - 95.0)
        )
        oil_pressure_bar = max(1.5, min(5.8, oil_press_raw))

        # 5. Expected Fuel Flow (L/h) & Injection Pulse Width (ms)
        phi_enrich = 1.0 + 0.14 * max(0.0, u_load - 0.82)
        fuel_flow_lph = (3.2 + 23.5 * (u_load ** 1.08) * (u_rpm ** 0.65)) * phi_enrich
        injection_pulse_ms = 2.1 + 7.8 * u_load * phi_enrich

        # 6. Expected Broadband Vibration RMS (mm/s)
        vibration_rms_mms = 0.85 + 1.45 * (u_rpm ** 1.4) + 0.45 * u_load

        # 7. Expected Battery / Alternator Voltage (V) & Ignition Advance (degBTDC)
        rpm_excitation = min(1.0, max(0.0, (rpm_clamped - 1200.0) / 1500.0))
        battery_voltage_v = max(
            12.2,
            min(14.2, 12.6 + 1.4 * rpm_excitation - 0.002 * max(0.0, amb_clamped - 25.0)),
        )
        ignition_advance_deg = round(18.0 + 10.0 * min(1.0, u_rpm) - 2.0 * max(0.0, u_load - 0.90), 2)

        return ExpectedValues(
            model_version=self.model_version,
            timestamp=frame.timestamp,
            source="PHYSICS_REFERENCE_MODEL",
            units=dict(TELEMETRY_UNITS),
            is_valid=frame.quality.is_valid and not is_extrapolated,
            is_extrapolated=is_extrapolated,
            extrapolation_reasons=reasons,
            air_density_ratio=round(sigma_alt, 4),
            cooling_effectiveness=round(cooling_eff, 4),
            cht_c=round(cht_ss, 2),
            egt_c=round(egt_ss, 2),
            oil_pressure_bar=round(oil_pressure_bar, 3),
            oil_temp_c=round(oil_temp_ss, 2),
            fuel_flow_lph=round(fuel_flow_lph, 2),
            vibration_rms_mms=round(vibration_rms_mms, 3),
            battery_voltage_v=round(battery_voltage_v, 2),
            injection_pulse_ms=round(injection_pulse_ms, 2),
            ignition_advance_deg=ignition_advance_deg,
        )

    @staticmethod
    def _compute_linear_slope(times: List[float], values: List[float]) -> float:
        if len(times) < 2:
            return 0.0
        t_arr = np.asarray(times, dtype=float)
        v_arr = np.asarray(values, dtype=float)
        dt = t_arr[-1] - t_arr[0]
        if abs(dt) < 1e-6:
            return 0.0
        t_centered = t_arr - t_arr.mean()
        denom = float(np.dot(t_centered, t_centered))
        if denom < 1e-9:
            return 0.0
        slope = float(np.dot(t_centered, v_arr - v_arr.mean()) / denom)
        return round(slope, 5)

    def calculate_residuals_and_trends(
        self,
        frame: ValidatedTelemetryFrame,
        expected: ExpectedValues,
    ) -> CalculatedValues:
        """Compute deterministic residuals, rolling statistics, slopes, and safety margins."""
        key = (frame.engine_id, frame.mission_id)
        hist = self._history.setdefault(key, deque(maxlen=self.rolling_window_size))
        hist.append((frame.mission_elapsed_sec, frame, expected))

        cht_res = round(frame.cht_c - expected.cht_c, 2)
        egt_res = round(frame.egt_c - expected.egt_c, 2)
        oil_p_res = round(frame.oil_pressure_bar - expected.oil_pressure_bar, 3)
        oil_t_res = round(frame.oil_temp_c - expected.oil_temp_c, 2)
        fuel_res = round(frame.fuel_flow_lph - expected.fuel_flow_lph, 2)
        vib_res = round(frame.vibration_rms_mms - expected.vibration_rms_mms, 3)
        bat_res = round(frame.battery_voltage_v - expected.battery_voltage_v, 2)
        inj_res = round(frame.injection_pulse_ms - expected.injection_pulse_ms, 2)

        times = [item[0] for item in hist]
        cht_series = [item[1].cht_c for item in hist]
        egt_series = [item[1].egt_c for item in hist]
        oil_p_series = [item[1].oil_pressure_bar for item in hist]
        vib_series = [item[1].vibration_rms_mms for item in hist]

        cht_mean = round(float(np.mean(cht_series)), 2)
        cht_std = round(float(np.std(cht_series)), 3)
        cht_slope = self._compute_linear_slope(times, cht_series)

        egt_mean = round(float(np.mean(egt_series)), 2)
        oil_p_mean = round(float(np.mean(oil_p_series)), 3)
        oil_p_slope = self._compute_linear_slope(times, oil_p_series)

        vib_mean = round(float(np.mean(vib_series)), 3)
        vib_std = round(float(np.std(vib_series)), 3)
        vib_slope = self._compute_linear_slope(times, vib_series)

        # Safety margins (100% = nominal, 0% = at critical redline)
        cht_crit = OPERATIONAL_SAFETY_LIMITS["cht_max_c"]["critical"]
        thermal_margin = max(
            0.0,
            min(100.0, ((cht_crit - frame.cht_c) / (cht_crit - 160.0)) * 100.0),
        )

        oil_p_crit = OPERATIONAL_SAFETY_LIMITS["oil_pressure_min_bar"]["critical"]
        oil_p_margin = max(
            0.0,
            min(100.0, ((frame.oil_pressure_bar - oil_p_crit) / (4.2 - oil_p_crit)) * 100.0),
        )

        vib_crit = OPERATIONAL_SAFETY_LIMITS["vibration_max_mms"]["critical"]
        vib_margin = max(
            0.0,
            min(100.0, ((vib_crit - frame.vibration_rms_mms) / (vib_crit - 2.0)) * 100.0),
        )

        specific_fuel_index = round(
            frame.fuel_flow_lph / max(10.0, frame.engine_load_pct), 4
        )

        violations: List[str] = list(expected.extrapolation_reasons)
        if frame.cht_c >= OPERATIONAL_SAFETY_LIMITS["cht_max_c"]["warning"]:
            violations.append(f"CHT {frame.cht_c:.1f} degC exceeds warning limit (220 degC)")
        if frame.egt_c >= OPERATIONAL_SAFETY_LIMITS["egt_max_c"]["warning"]:
            violations.append(f"EGT {frame.egt_c:.1f} degC exceeds warning limit (920 degC)")
        if frame.oil_pressure_bar <= OPERATIONAL_SAFETY_LIMITS["oil_pressure_min_bar"]["warning"]:
            violations.append(
                f"Oil Pressure {frame.oil_pressure_bar:.2f} bar below warning limit (1.90 bar)"
            )
        if frame.vibration_rms_mms >= OPERATIONAL_SAFETY_LIMITS["vibration_max_mms"]["warning"]:
            violations.append(
                f"Vibration {frame.vibration_rms_mms:.2f} mm/s exceeds warning limit (5.80 mm/s)"
            )

        return CalculatedValues(
            calculator_version=self.calculator_version,
            timestamp=frame.timestamp,
            source="DETERMINISTIC_RESIDUAL_ENGINE",
            is_valid=frame.quality.is_valid,
            cht_residual_c=cht_res,
            egt_residual_c=egt_res,
            oil_pressure_residual_bar=oil_p_res,
            oil_temp_residual_c=oil_t_res,
            fuel_flow_residual_lph=fuel_res,
            vibration_residual_mms=vib_res,
            battery_voltage_residual_v=bat_res,
            injection_pulse_residual_ms=inj_res,
            cht_rolling_mean_c=cht_mean,
            cht_rolling_std_c=cht_std,
            cht_rolling_slope_c_per_s=cht_slope,
            egt_rolling_mean_c=egt_mean,
            oil_pressure_rolling_mean_bar=oil_p_mean,
            oil_pressure_rolling_slope_bar_per_s=oil_p_slope,
            vibration_rolling_mean_mms=vib_mean,
            vibration_rolling_std_mms=vib_std,
            vibration_rolling_slope_mms_per_s=vib_slope,
            thermal_margin_pct=round(thermal_margin, 1),
            oil_pressure_margin_pct=round(oil_p_margin, 1),
            vibration_margin_pct=round(vib_margin, 1),
            specific_fuel_index=specific_fuel_index,
            envelope_violations=violations,
        )
