"""Deterministic explainable alert and maintenance recommendation engine.

ADVISORY DISCLAIMER:
This module is an engineering diagnostic advisory demonstrator for SIH26054.
It does NOT issue autonomous flight-control commands or maintenance-release authorizations.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from backend.app.telemetry.schema import (
    AlertSeverity,
    CalculatedValues,
    ExpectedValues,
    ExplainableAlert,
    PredictedValues,
    ValidatedTelemetryFrame,
)

ALERT_RULE_VERSION = "DrishtiAlertRules-v1.0"

# THRESHOLD PROVENANCE DISCLAIMER:
# All residual-trigger thresholds (CHT >= 10°C, EGT >= 25°C, oil_pressure >= 0.35 bar, etc.)
# and severity-boundary thresholds (CHT >= 232°C → CRITICAL, oil_pressure <= 1.60 bar → CRITICAL, etc.)
# are DEMONSTRATOR DEFAULTS chosen to produce reasonable alert behavior on synthetic data.
# They are NOT derived from Rotax operator manuals, FAA/EASA airworthiness requirements,
# MIL-STD maintenance limits, or real engine failure-rate statistics.
# Operational deployment requires calibration against manufacturer limits and validated
# maintenance data. See docs/PPT_VS_IMPLEMENTATION_GAP.md GAP-08.

MAINTENANCE_RECOMMENDATIONS: Dict[str, str] = {
    "Cylinder Overheating": (
        "ADVISORY: Inspect cylinder head cooling fins, inter-cylinder air baffles, and cowl flap actuator "
        "alignment. Verify coolant/air ducting integrity and perform borescope check of cylinder head "
        "combustion chamber for thermal scoring prior to next sortie."
    ),
    "Oil Pressure Drop": (
        "ADVISORY: Inspect lubrication circuit for external hose leaks, oil pressure regulator relief-valve "
        "spring seating, suction screen blockage, and oil pump gear end-play. Verify oil sump level and viscosity grade."
    ),
    "Crankshaft Bearing Wear": (
        "ADVISORY: Perform magnetic chip-detector inspection and spectrographic oil analysis (SOAP) for bearing "
        "babbitt/copper particulates. Check oil filter pleats and measure main/connecting-rod journal clearances."
    ),
    "Cylinder Misfire": (
        "ADVISORY: Inspect dual-ignition spark plugs for electrode fouling or gap erosion, test ignition coil "
        "secondary resistance and high-tension leads, and perform differential cylinder compression test."
    ),
    "Sensor Fault": (
        "ADVISORY: Isolate and inspect the flagged sensor channel wiring harness, connector pin tension, and "
        "reference ground. Perform bench calibration check against a reference standard before replacing engine hardware."
    ),
    "Piston Ring Wear": (
        "ADVISORY: Perform differential cylinder leak-down test and crankcase breather blow-by flow measurement. "
        "Inspect cylinder walls with borescope for honing cross-hatch wear or ring land carbon sticking."
    ),
    "Valve Clearance Issue": (
        "ADVISORY: Inspect intake and exhaust valve rocker clearances, hydraulic lifters/pushrods, and valve "
        "seat sealing. Check exhaust manifold port temperature balance across cylinders."
    ),
    "Fuel Injector Clogging": (
        "ADVISORY: Perform fuel injector spray-pattern and flow-balance bench test. Inspect fine-mesh fuel "
        "rail filter, fuel pressure regulator, and verify ECU pulse-width compensation trim logs."
    ),
    "Uncertain / Ambiguous Anomaly": (
        "ADVISORY: Cross-channel telemetry evidence is ambiguous between sensor drift and early mechanical "
        "deviation. Verify instrumentation integrity first and monitor residual trends over a controlled ground run."
    ),
}


class ExplainableAlertEngine:
    """Evaluates Four-Value Digital Twin states and produces auditable engineering alerts."""

    def __init__(self) -> None:
        self.rule_version = ALERT_RULE_VERSION
        self._alert_seq: int = 0

    def evaluate(
        self,
        actual: ValidatedTelemetryFrame,
        expected: ExpectedValues,
        calculated: CalculatedValues,
        predicted: PredictedValues,
    ) -> Optional[ExplainableAlert]:
        fault_cls = predicted.predicted_fault_class
        is_anom = predicted.is_anomaly
        s_diag = predicted.sensor_diagnosis

        # Determine if an alert is warranted
        has_envelope_violation = len(calculated.envelope_violations) > 0
        if (
            fault_cls == "Normal"
            and not is_anom
            and not s_diag.is_sensor_fault_detected
            and not s_diag.is_ambiguous
            and not has_envelope_violation
        ):
            return None

        self._alert_seq += 1
        alert_id = f"ALT-{actual.engine_id}-{actual.mission_id}-{actual.sequence_number:04d}"

        # Build actual-vs-expected deviation dictionary
        deviations: Dict[str, float] = {
            "cht_residual_c": calculated.cht_residual_c,
            "egt_residual_c": calculated.egt_residual_c,
            "oil_pressure_residual_bar": calculated.oil_pressure_residual_bar,
            "oil_temp_residual_c": calculated.oil_temp_residual_c,
            "fuel_flow_residual_lph": calculated.fuel_flow_residual_lph,
            "vibration_residual_mms": calculated.vibration_residual_mms,
            "injection_pulse_residual_ms": calculated.injection_pulse_residual_ms,
        }

        evidence: List[str] = []
        if abs(calculated.cht_residual_c) >= 10.0:
            evidence.append(
                f"CHT actual={actual.cht_c:.1f} degC vs physics-expected={expected.cht_c:.1f} degC (residual={calculated.cht_residual_c:+.1f} degC, slope={calculated.cht_rolling_slope_c_per_s:+.2f} degC/s)."
            )
        if abs(calculated.egt_residual_c) >= 25.0:
            evidence.append(
                f"EGT actual={actual.egt_c:.1f} degC vs physics-expected={expected.egt_c:.1f} degC (residual={calculated.egt_residual_c:+.1f} degC)."
            )
        if abs(calculated.oil_pressure_residual_bar) >= 0.35:
            evidence.append(
                f"Oil Pressure actual={actual.oil_pressure_bar:.2f} bar vs physics-expected={expected.oil_pressure_bar:.2f} bar (residual={calculated.oil_pressure_residual_bar:+.2f} bar)."
            )
        if abs(calculated.oil_temp_residual_c) >= 8.0:
            evidence.append(
                f"Oil Temp actual={actual.oil_temp_c:.1f} degC vs physics-expected={expected.oil_temp_c:.1f} degC (residual={calculated.oil_temp_residual_c:+.1f} degC)."
            )
        if abs(calculated.vibration_residual_mms) >= 0.70:
            evidence.append(
                f"Vibration RMS actual={actual.vibration_rms_mms:.2f} mm/s vs physics-expected={expected.vibration_rms_mms:.2f} mm/s (residual={calculated.vibration_residual_mms:+.2f} mm/s)."
            )
        if abs(calculated.fuel_flow_residual_lph) >= 1.8:
            evidence.append(
                f"Fuel Flow actual={actual.fuel_flow_lph:.2f} L/h vs physics-expected={expected.fuel_flow_lph:.2f} L/h (residual={calculated.fuel_flow_residual_lph:+.2f} L/h, pulse residual={calculated.injection_pulse_residual_ms:+.2f} ms)."
            )

        for v_note in calculated.envelope_violations:
            evidence.append(f"Envelope/Limit check: {v_note}")

        if s_diag.is_sensor_fault_detected or s_diag.is_ambiguous:
            for s_ev in s_diag.evidence:
                evidence.append(f"Sensor Isolator: {s_ev}")

        if not evidence:
            evidence.append(
                f"Multivariate IsolationForest score={predicted.anomaly_score:.3f} >= threshold={predicted.anomaly_threshold:.3f} with RF top class='{fault_cls}' (p={predicted.top_probability:.2f})."
            )

        # Determine display fault class and anomaly type
        if s_diag.is_sensor_fault_detected:
            effective_class = "Sensor Fault"
            anomaly_type = f"SENSOR_FAULT ({s_diag.fault_submode or 'isolated'})"
        elif predicted.diagnosis_certainty_status == "UNCERTAIN_INSUFFICIENT_EVIDENCE":
            effective_class = (
                fault_cls if fault_cls != "Normal" and predicted.top_probability >= 0.42 else "Uncertain / Ambiguous Anomaly"
            )
            anomaly_type = "AMBIGUOUS_RESIDUAL_DEVIATION"
        else:
            effective_class = fault_cls if fault_cls != "Normal" else "Uncertain / Ambiguous Anomaly"
            anomaly_type = "ENGINE_CONDITION_ANOMALY"

        # Documented severity rules
        if (
            actual.cht_c >= 232.0
            or actual.oil_pressure_bar <= 1.60
            or actual.vibration_rms_mms >= 7.0
            or predicted.health_index < 45.0
        ) and not s_diag.is_sensor_fault_detected:
            severity = AlertSeverity.CRITICAL
        elif (
            actual.cht_c >= 215.0
            or actual.oil_pressure_bar <= 2.10
            or actual.vibration_rms_mms >= 5.2
            or predicted.health_index < 65.0
            or (effective_class not in ("Normal", "Sensor Fault", "Uncertain / Ambiguous Anomaly") and predicted.top_probability >= 0.70)
        ):
            severity = AlertSeverity.WARNING
        elif s_diag.is_sensor_fault_detected or predicted.is_anomaly:
            severity = AlertSeverity.CAUTION
        else:
            severity = AlertSeverity.ADVISORY

        dq_limitations: List[str] = list(actual.quality.validation_notes)
        if expected.is_extrapolated:
            dq_limitations.extend(expected.extrapolation_reasons)
        if not dq_limitations:
            dq_limitations.append(
                f"Telemetry quality_score={actual.quality.quality_score:.2f}; all channels within physical sensor bounds."
            )

        rec_action = MAINTENANCE_RECOMMENDATIONS.get(
            effective_class,
            MAINTENANCE_RECOMMENDATIONS["Uncertain / Ambiguous Anomaly"],
        )

        source_stmt = (
            f"SIMULATED EVIDENCE (Source={actual.data_source.value}, synthetic=True): "
            "Generated by deterministic physics-informed digital-twin demonstrator. Advisory ground maintenance guidance only."
            if actual.is_synthetic
            else f"RECORDED TELEMETRY EVIDENCE (Source={actual.data_source.value}, synthetic=False): Advisory ground maintenance guidance only."
        )

        return ExplainableAlert(
            alert_id=alert_id,
            engine_id=actual.engine_id,
            mission_id=actual.mission_id,
            timestamp=actual.timestamp,
            sequence_number=actual.sequence_number,
            fault_class=effective_class,
            anomaly_type=anomaly_type,
            severity=severity,
            supporting_evidence=evidence,
            actual_vs_expected_deviations=deviations,
            model_probability=round(predicted.top_probability, 4),
            anomaly_score=round(predicted.anomaly_score, 4),
            score_label=(
                f"RF Class Probability={predicted.top_probability:.2f} | IsolationForest Anomaly Score={predicted.anomaly_score:.3f} (Threshold={predicted.anomaly_threshold:.3f})"
            ),
            data_quality_limitations=dq_limitations,
            model_version=predicted.model_version,
            rule_version=self.rule_version,
            recommended_action=rec_action,
            is_simulated_evidence=actual.is_synthetic,
            evidence_source_statement=source_stmt,
            acknowledged=False,
        )
