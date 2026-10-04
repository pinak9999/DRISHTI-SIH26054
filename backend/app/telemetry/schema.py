"""Versioned telemetry and digital-twin data contracts for DRISHTI (SIH26054)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

TELEMETRY_SCHEMA_VERSION = "1.0.0"

NINE_FAULT_CLASSES: List[str] = [
    "Normal",
    "Cylinder Overheating",
    "Oil Pressure Drop",
    "Crankshaft Bearing Wear",
    "Cylinder Misfire",
    "Sensor Fault",
    "Piston Ring Wear",
    "Valve Clearance Issue",
    "Fuel Injector Clogging",
]


class DataSourceType(str, Enum):
    SIMULATOR = "SIMULATOR"
    CSV_REPLAY = "CSV_REPLAY"
    HISTORICAL_REPLAY = "HISTORICAL_REPLAY"
    CAN_SIMULATED_ADAPTER = "CAN_SIMULATED_ADAPTER"
    REAL_HARDWARE_CAN = "REAL_HARDWARE_CAN"


class AlertSeverity(str, Enum):
    ADVISORY = "ADVISORY"
    CAUTION = "CAUTION"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


TELEMETRY_UNITS: Dict[str, str] = {
    "rpm": "RPM",
    "cht_c": "degC",
    "egt_c": "degC",
    "oil_pressure_bar": "bar",
    "oil_temp_c": "degC",
    "fuel_flow_lph": "L/h",
    "vibration_rms_mms": "mm/s",
    "throttle_pct": "%",
    "engine_load_pct": "%",
    "altitude_m": "m",
    "ambient_temp_c": "degC",
    "battery_voltage_v": "V",
    "alternator_current_a": "A",
    "injection_pulse_ms": "ms",
    "ignition_advance_deg": "degBTDC",
}


class SensorPlausibleBounds(BaseModel):
    min_val: float
    max_val: float
    unit: str


SENSOR_PLAUSIBLE_BOUNDS: Dict[str, SensorPlausibleBounds] = {
    "rpm": SensorPlausibleBounds(min_val=0.0, max_val=7500.0, unit="RPM"),
    "cht_c": SensorPlausibleBounds(min_val=-40.0, max_val=350.0, unit="degC"),
    "egt_c": SensorPlausibleBounds(min_val=-40.0, max_val=1300.0, unit="degC"),
    "oil_pressure_bar": SensorPlausibleBounds(min_val=0.0, max_val=12.0, unit="bar"),
    "oil_temp_c": SensorPlausibleBounds(min_val=-40.0, max_val=220.0, unit="degC"),
    "fuel_flow_lph": SensorPlausibleBounds(min_val=0.0, max_val=80.0, unit="L/h"),
    "vibration_rms_mms": SensorPlausibleBounds(min_val=0.0, max_val=50.0, unit="mm/s"),
    "throttle_pct": SensorPlausibleBounds(min_val=0.0, max_val=105.0, unit="%"),
    "engine_load_pct": SensorPlausibleBounds(min_val=0.0, max_val=130.0, unit="%"),
    "altitude_m": SensorPlausibleBounds(min_val=-500.0, max_val=12000.0, unit="m"),
    "ambient_temp_c": SensorPlausibleBounds(min_val=-60.0, max_val=70.0, unit="degC"),
    "battery_voltage_v": SensorPlausibleBounds(min_val=0.0, max_val=28.0, unit="V"),
    "alternator_current_a": SensorPlausibleBounds(min_val=-50.0, max_val=120.0, unit="A"),
    "injection_pulse_ms": SensorPlausibleBounds(min_val=0.0, max_val=30.0, unit="ms"),
    "ignition_advance_deg": SensorPlausibleBounds(min_val=-10.0, max_val=50.0, unit="degBTDC"),
}


class DataQualityMetadata(BaseModel):
    is_valid: bool = True
    is_stale: bool = False
    is_duplicate: bool = False
    is_out_of_order: bool = False
    missing_fields: List[str] = Field(default_factory=list)
    imputed_fields: List[str] = Field(default_factory=list)
    invalid_sensor_channels: List[str] = Field(default_factory=list)
    channel_validity: Dict[str, bool] = Field(default_factory=dict)
    quality_score: float = Field(default=1.0, ge=0.0, le=1.0)
    validation_notes: List[str] = Field(default_factory=list)


class TelemetryInputFrame(BaseModel):
    schema_version: str = Field(default=TELEMETRY_SCHEMA_VERSION)
    engine_id: str = Field(..., min_length=1)
    mission_id: str = Field(..., min_length=1)
    timestamp: str = Field(..., description="ISO-8601 timestamp string")
    sequence_number: int = Field(..., ge=0)
    mission_elapsed_sec: float = Field(default=0.0, ge=0.0)

    rpm: Optional[float] = None
    cht_c: Optional[float] = None
    egt_c: Optional[float] = None
    oil_pressure_bar: Optional[float] = None
    oil_temp_c: Optional[float] = None
    fuel_flow_lph: Optional[float] = None
    vibration_rms_mms: Optional[float] = None
    throttle_pct: Optional[float] = None
    engine_load_pct: Optional[float] = None
    altitude_m: Optional[float] = None
    ambient_temp_c: Optional[float] = None
    battery_voltage_v: Optional[float] = 13.8
    alternator_current_a: Optional[float] = 18.5
    injection_pulse_ms: Optional[float] = 8.2
    ignition_advance_deg: Optional[float] = 26.0

    data_source: DataSourceType = DataSourceType.SIMULATOR
    is_synthetic: bool = True
    scenario_label: Optional[str] = "Normal"
    fault_severity: float = 0.0
    seed: Optional[int] = None


class ValidatedTelemetryFrame(BaseModel):
    schema_version: str = TELEMETRY_SCHEMA_VERSION
    engine_id: str
    mission_id: str
    timestamp: str
    sequence_number: int
    mission_elapsed_sec: float

    rpm: float
    cht_c: float
    egt_c: float
    oil_pressure_bar: float
    oil_temp_c: float
    fuel_flow_lph: float
    vibration_rms_mms: float
    throttle_pct: float
    engine_load_pct: float
    altitude_m: float
    ambient_temp_c: float
    battery_voltage_v: float
    alternator_current_a: float
    injection_pulse_ms: float
    ignition_advance_deg: float

    data_source: DataSourceType
    is_synthetic: bool = True
    units: Dict[str, str] = Field(default_factory=lambda: dict(TELEMETRY_UNITS))
    quality: DataQualityMetadata
    scenario_label: Optional[str] = "Normal"
    fault_severity: float = 0.0
    seed: Optional[int] = None


class ExpectedValues(BaseModel):
    model_version: str
    timestamp: str
    source: str = "PHYSICS_REFERENCE_MODEL"
    units: Dict[str, str] = Field(default_factory=lambda: dict(TELEMETRY_UNITS))
    is_valid: bool = True
    is_extrapolated: bool = False
    extrapolation_reasons: List[str] = Field(default_factory=list)
    air_density_ratio: float
    cooling_effectiveness: float
    cht_c: float
    egt_c: float
    oil_pressure_bar: float
    oil_temp_c: float
    fuel_flow_lph: float
    vibration_rms_mms: float
    battery_voltage_v: float
    injection_pulse_ms: float
    ignition_advance_deg: float


class CalculatedValues(BaseModel):
    calculator_version: str = "CalcEngine-v1.0"
    timestamp: str
    source: str = "DETERMINISTIC_RESIDUAL_ENGINE"
    is_valid: bool = True
    units: Dict[str, str] = Field(
        default_factory=lambda: {
            "cht_residual_c": "degC",
            "egt_residual_c": "degC",
            "oil_pressure_residual_bar": "bar",
            "oil_temp_residual_c": "degC",
            "fuel_flow_residual_lph": "L/h",
            "vibration_residual_mms": "mm/s",
            "battery_voltage_residual_v": "V",
            "injection_pulse_residual_ms": "ms",
            "cht_rolling_slope_c_per_s": "degC/s",
            "oil_pressure_rolling_slope_bar_per_s": "bar/s",
            "vibration_rolling_slope_mms_per_s": "mm/s/s",
            "thermal_margin_pct": "%",
            "oil_pressure_margin_pct": "%",
            "vibration_margin_pct": "%",
            "specific_fuel_index": "L/h/load%",
        }
    )
    cht_residual_c: float
    egt_residual_c: float
    oil_pressure_residual_bar: float
    oil_temp_residual_c: float
    fuel_flow_residual_lph: float
    vibration_residual_mms: float
    battery_voltage_residual_v: float
    injection_pulse_residual_ms: float

    cht_rolling_mean_c: float
    cht_rolling_std_c: float
    cht_rolling_slope_c_per_s: float
    egt_rolling_mean_c: float
    oil_pressure_rolling_mean_bar: float
    oil_pressure_rolling_slope_bar_per_s: float
    vibration_rolling_mean_mms: float
    vibration_rolling_std_mms: float
    vibration_rolling_slope_mms_per_s: float

    thermal_margin_pct: float
    oil_pressure_margin_pct: float
    vibration_margin_pct: float
    specific_fuel_index: float
    envelope_violations: List[str] = Field(default_factory=list)


class SensorDiagnosisResult(BaseModel):
    isolator_version: str = "SensorFaultIsolator-v1.0"
    is_sensor_fault_detected: bool = False
    is_ambiguous: bool = False
    diagnosis_status: Literal[
        "SENSORS_NOMINAL",
        "SENSOR_FAULT_ISOLATED",
        "AMBIGUOUS_SENSOR_VS_ENGINE",
        "INSUFFICIENT_EVIDENCE",
    ] = "SENSORS_NOMINAL"
    suspected_channels: List[str] = Field(default_factory=list)
    fault_submode: Optional[str] = None
    confidence: float = 0.0
    evidence: List[str] = Field(default_factory=list)


class PredictedValues(BaseModel):
    model_version: str
    timestamp: str
    source: str = "ML_INFERENCE_PIPELINE"
    is_valid: bool = True

    predicted_fault_class: str
    diagnosis_certainty_status: Literal[
        "CONFIDENT_DIAGNOSIS",
        "UNCERTAIN_INSUFFICIENT_EVIDENCE",
        "SENSOR_FAULT_OVERRIDE",
        "DEGRADED_INPUT_QUALITY",
    ] = "CONFIDENT_DIAGNOSIS"
    top_probability: float
    class_probabilities: Dict[str, float]

    is_anomaly: bool
    anomaly_score: float
    anomaly_threshold: float

    sensor_diagnosis: SensorDiagnosisResult

    rul_status: Literal["ESTIMATED", "NOT_ESTIMABLE"]
    rul_hours: Optional[float] = None
    rul_lower_10_hours: Optional[float] = None
    rul_upper_90_hours: Optional[float] = None
    rul_unit: str = "hours"
    rul_cycles: Optional[float] = None
    rul_lower_10_cycles: Optional[float] = None
    rul_upper_90_cycles: Optional[float] = None
    rul_cycle_unit: str = "cycles"
    rul_reason: str = ""

    health_index: float = Field(..., ge=0.0, le=100.0)
    health_breakdown: Dict[str, float] = Field(default_factory=dict)


class FourValueDigitalTwinState(BaseModel):
    schema_version: str = TELEMETRY_SCHEMA_VERSION
    engine_id: str
    mission_id: str
    timestamp: str
    sequence_number: int
    mission_elapsed_sec: float
    data_source: DataSourceType
    is_synthetic: bool = True

    actual: ValidatedTelemetryFrame
    expected: ExpectedValues
    calculated: CalculatedValues
    predicted: PredictedValues


class ExplainableAlert(BaseModel):
    alert_id: str
    engine_id: str
    mission_id: str
    timestamp: str
    sequence_number: int
    fault_class: str
    anomaly_type: str
    severity: AlertSeverity
    supporting_evidence: List[str]
    actual_vs_expected_deviations: Dict[str, float]
    model_probability: float
    anomaly_score: float
    score_label: str
    data_quality_limitations: List[str]
    model_version: str
    rule_version: str
    recommended_action: str
    is_simulated_evidence: bool = True
    evidence_source_statement: str
    acknowledged: bool = False
