"""Deterministic 9-class fault simulator and mission profile generator.

DISCLOSURE:
All fault transfer functions are synthetic analytical representations designed
for deterministic software verification and ML evaluation. They are NOT
experimentally validated physical fault signatures from an engine test cell.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import math
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
import numpy as np

from backend.app.physics.engine_model import AeroPistonReferenceModel
from backend.app.telemetry.schema import (
    DataSourceType,
    NINE_FAULT_CLASSES,
    TelemetryInputFrame,
    ValidatedTelemetryFrame,
)

SensorFaultSubmode = Literal[
    "drift",
    "stuck_at",
    "high_noise",
    "missing_samples",
    "implausible_values",
]

MissionProfileType = Literal[
    "normal_mission",
    "high_altitude",
    "hot_weather",
    "long_endurance",
    "rapid_throttle",
    "controlled_fault_injection",
    "historical_replay",
]


class FaultScenarioConfig(BaseModel):
    scenario_id: str = "SIM-DEFAULT"
    engine_id: str = "ENG-MALE-01"
    mission_id: str = "MSN-SIM-001"
    mission_profile: MissionProfileType = "normal_mission"
    fault_class: str = Field(default="Normal")
    sensor_fault_submode: SensorFaultSubmode = "drift"
    sensor_fault_channel: str = "cht_c"
    onset_time_sec: float = Field(default=30.0, ge=0.0)
    duration_sec: float = Field(default=120.0, ge=1.0)
    sample_interval_sec: float = Field(default=1.0, ge=0.05, le=10.0)
    severity: float = Field(default=0.70, ge=0.0, le=1.0)
    random_seed: int = Field(default=42)
    base_altitude_m: float = Field(default=2800.0, ge=-100.0, le=8500.0)
    base_ambient_temp_c: float = Field(default=14.0, ge=-45.0, le=55.0)
    base_throttle_pct: float = Field(default=74.0, ge=15.0, le=100.0)
    base_load_pct: float = Field(default=76.0, ge=15.0, le=115.0)
    start_timestamp_iso: str = "2026-10-03T06:00:00Z"
    is_synthetic: bool = True


FAULT_SIGNAL_TRANSFORMATIONS_DOC: Dict[str, Dict[str, Any]] = {
    "Normal": {
        "description": "Nominal 4-cylinder turbocharged operating state with bounded Gaussian sensor noise.",
        "affected_channels": [],
    },
    "Cylinder Overheating": {
        "description": "Cooling baffle obstruction or cylinder head fin fouling causing strong positive CHT residual (+22 to +60 degC), moderate EGT (+18 to +48 degC) and Oil Temp (+10 to +28 degC) rise.",
        "affected_channels": ["cht_c", "oil_temp_c", "egt_c", "rpm"],
    },
    "Oil Pressure Drop": {
        "description": "Oil pump wear, relief-valve leakage, or loss of lubricant pressure causing negative Oil Pressure residual (-1.1 to -2.7 bar), Oil Temp rise (+12 to +34 degC), and secondary friction vibration.",
        "affected_channels": ["oil_pressure_bar", "oil_temp_c", "vibration_rms_mms"],
    },
    "Crankshaft Bearing Wear": {
        "description": "Main/rod journal clearance degradation producing severe broadband vibration (+2.6 to +7.4 mm/s), moderate oil pressure bleed (-0.45 to -1.1 bar), and elevated oil temperature (+9 to +24 degC).",
        "affected_channels": ["vibration_rms_mms", "oil_pressure_bar", "oil_temp_c"],
    },
    "Cylinder Misfire": {
        "description": "Intermittent or sustained spark/ignition failure in one cylinder causing sharp EGT drop (-55 to -140 degC), RPM drop (-140 to -360 RPM), CHT drop (-14 to -36 degC), and torsional firing vibration (+2.2 to +5.8 mm/s).",
        "affected_channels": ["egt_c", "rpm", "vibration_rms_mms", "cht_c"],
    },
    "Sensor Fault": {
        "description": "Single-channel instrumentation corruption (drift, stuck-at flatline, high-frequency noise, missing samples, or implausible out-of-range spikes) while physical cross-channels remain nominal.",
        "affected_channels": ["cht_c | egt_c | oil_pressure_bar | vibration_rms_mms"],
    },
    "Piston Ring Wear": {
        "description": "Combustion gas blow-by into crankcase causing high Oil Temp (+15 to +39 degC), elevated CHT (+12 to +32 degC), increased Fuel Flow (+2.4 to +6.2 L/h) for target load, and moderate vibration (+1.1 to +2.9 mm/s).",
        "affected_channels": ["oil_temp_c", "cht_c", "fuel_flow_lph", "vibration_rms_mms", "oil_pressure_bar"],
    },
    "Valve Clearance Issue": {
        "description": "Exhaust/intake tappet maladjustment causing high EGT (+45 to +120 degC), valvetrain clatter vibration (+1.4 to +3.7 mm/s), slight CHT increase (+6 to +18 degC), and slight volumetric fuel flow drop (-1.2 to -3.0 L/h).",
        "affected_channels": ["egt_c", "vibration_rms_mms", "cht_c", "fuel_flow_lph"],
    },
    "Fuel Injector Clogging": {
        "description": "Partial nozzle restriction causing Fuel Flow drop (-3.2 to -8.4 L/h) despite ECU increasing Injection Pulse Width (+1.4 to +3.8 ms), accompanied by lean-mixture EGT rise (+38 to +106 degC) and roughness vibration (+0.9 to +2.4 mm/s).",
        "affected_channels": ["fuel_flow_lph", "injection_pulse_ms", "egt_c", "vibration_rms_mms"],
    },
}

SIH26054_EIGHT_FAULT_CATEGORY_MAPPING: List[Dict[str, Any]] = [
    {
        "category_id": 1,
        "sih_problem_statement_category": "Misfire conditions",
        "mapped_ml_fault_classes": ["Cylinder Misfire"],
        "detection_pathway": "Hybrid Physics-Residual + 9-Class RandomForestClassifier + IsolationForest",
        "primary_sensor_evidence": ["egt_c (-55 to -140 degC drop)", "rpm (-140 to -360 RPM drop)", "vibration_rms_mms (+2.2 to +5.8 mm/s torsional spike)", "cht_c (-14 to -36 degC cooling drop)"],
        "causal_rationale": "Loss of spark/combustion in one cylinder reduces exhaust enthalpy (negative EGT/CHT residual) while inducing crank torsional imbalance (positive vibration residual).",
        "limitation_disclosure": "Aggregate single-channel EGT/CHT detects misfire presence and severity but cannot isolate which cylinder (#1-#4) misfired without per-cylinder exhaust thermocouples.",
    },
    {
        "category_id": 2,
        "sih_problem_statement_category": "Injector abnormalities",
        "mapped_ml_fault_classes": ["Fuel Injector Clogging"],
        "detection_pathway": "Cross-Channel Fuel-to-Pulse Ratio + 9-Class RandomForestClassifier",
        "primary_sensor_evidence": ["fuel_flow_lph (-3.2 to -8.4 L/h negative residual)", "injection_pulse_ms (+1.4 to +3.8 ms positive ECU compensation)", "egt_c (+38 to +106 degC lean-burn rise)", "fuel_to_pulse_ratio drop"],
        "causal_rationale": "Partial nozzle restriction reduces actual volumetric fuel flow despite the ECU commanding wider injection pulse width, causing a lean air-fuel mixture that elevates EGT.",
        "limitation_disclosure": "Distinguishes restriction/clogging from nominal operation; leaky-injector rich-burn submodes require lambda/O2 exhaust sensor integration.",
    },
    {
        "category_id": 3,
        "sih_problem_statement_category": "Cooling degradation (Official PS text: 'Coding degradation')",
        "mapped_ml_fault_classes": ["Cylinder Overheating"],
        "detection_pathway": "Physics Cooling Effectiveness Baseline (eta_cool) + CHT/Oil-Temp Residual & Rolling Slope",
        "primary_sensor_evidence": ["cht_c (+22 to +60 degC positive residual)", "cht_rolling_slope_c_per_s (> +0.18 degC/s)", "oil_temp_c (+10 to +28 degC rise)", "thermal_margin_pct depletion"],
        "causal_rationale": "ENGINEERING INTERPRETATION NOTE: The official SIH26054 text contains the typographical phrase 'Coding degradation' alongside misfire, injector, lubrication, overheating, and vibration faults. In aero-piston propulsion domain engineering, this refers to 'Cooling degradation' (cooling baffle blockage, cowl flap stuck closed, or cylinder fin fouling reducing heat rejection).",
        "limitation_disclosure": "Simulated via cooling effectiveness loss and positive CHT/oil-temperature residuals; physical airflow pressure-drop across cooling baffles is not separately instrumented.",
    },
    {
        "category_id": 4,
        "sih_problem_statement_category": "Lubrication issues",
        "mapped_ml_fault_classes": ["Oil Pressure Drop", "Crankshaft Bearing Wear"],
        "detection_pathway": "Oil-Pressure-to-RPM Ratio + Physics Residual + 9-Class RandomForestClassifier",
        "primary_sensor_evidence": ["oil_pressure_bar (-1.1 to -2.7 bar negative residual)", "oil_temp_c (+12 to +34 degC positive residual)", "oil_press_to_rpm_ratio drop", "vibration_rms_mms secondary friction rise"],
        "causal_rationale": "Oil pump wear, pressure relief valve leakage, or thermal viscosity breakdown lowers gallery pressure relative to RPM while raising oil sump temperature and boundary-lubrication friction.",
        "limitation_disclosure": "Oil metallic debris (chip detector) and oil filter differential pressure are not separately instrumented in the 14-channel schema.",
    },
    {
        "category_id": 5,
        "sih_problem_statement_category": "Sensor drift or failure",
        "mapped_ml_fault_classes": ["Sensor Fault"],
        "detection_pathway": "Dedicated Rule-Plus-Residual SensorFaultIsolator + RandomForestClassifier + RUL NOT_ESTIMABLE Gate",
        "primary_sensor_evidence": ["Single-channel residual excursion (cht_c, egt_c, oil_pressure_bar, or vibration_rms_mms) with uncorroborated cross-channels", "Stuck-at zero variance", "Out-of-range / NaN / missing channel flags"],
        "causal_rationale": "Physical engine faults couple across multiple thermodynamic channels (e.g., overheating raises CHT, EGT, and Oil Temp together). An isolated single-channel spike, flatline, or drift without cross-channel corroboration isolates instrumentation failure and gates mechanical RUL as NOT_ESTIMABLE.",
        "limitation_disclosure": "Simultaneous dual-sensor failures on coupled channels can create ambiguous evidence (flagged as AMBIGUOUS_EVIDENCE).",
    },
    {
        "category_id": 6,
        "sih_problem_statement_category": "Combustion instability",
        "mapped_ml_fault_classes": ["Valve Clearance Issue", "Cylinder Misfire", "Piston Ring Wear"],
        "detection_pathway": "Thermal-to-EGT Ratio + EGT/Vibration Residual & Rolling Std + IsolationForest",
        "primary_sensor_evidence": ["egt_c (+45 to +120 degC tappet late-burn or -55 to -140 degC misfire)", "vibration_rms_mms (+1.4 to +5.8 mm/s combustion roughness)", "vibration_rolling_std_mms", "thermal_to_egt_ratio shift"],
        "causal_rationale": "Valvetrain clearance maladjustment, blow-by compression loss, or erratic ignition alters combustion phasing, producing strong EGT residuals and cycle-to-cycle torque roughness.",
        "limitation_disclosure": "In-cylinder peak combustion pressure (P_max piezoelectric transducer) is only available in the external LiU-ICE test-cell benchmark, not in standard UAV flight telemetry.",
    },
    {
        "category_id": 7,
        "sih_problem_statement_category": "Overheating trends",
        "mapped_ml_fault_classes": ["Cylinder Overheating", "Piston Ring Wear"],
        "detection_pathway": "Sliding-Window CHT Rolling Slope (W=20) + Thermal Safety Margin Tracking",
        "primary_sensor_evidence": ["cht_rolling_slope_c_per_s", "cht_residual_c (+12 to +60 degC)", "oil_temp_residual_c (+10 to +39 degC)", "fuel_flow_residual_lph (+2.4 to +6.2 L/h blow-by compensation)"],
        "causal_rationale": "Tracks both rapid thermal runaway (cooling baffle failure) and gradual blow-by thermal degradation (piston ring wear heating crankcase oil and cylinder walls).",
        "limitation_disclosure": "Ambient temperature sensor bias could shift expected CHT baseline if intake air temperature probe is uncalibrated.",
    },
    {
        "category_id": 8,
        "sih_problem_statement_category": "Abnormal vibration patterns",
        "mapped_ml_fault_classes": ["Crankshaft Bearing Wear", "Cylinder Misfire", "Valve Clearance Issue"],
        "detection_pathway": "Broadband RMS Vibration Residual + Rolling Slope & Std + Oil/Thermal Cross-Check",
        "primary_sensor_evidence": ["vibration_rms_mms (+1.4 to +7.4 mm/s residual)", "vibration_rolling_slope_mms_per_s", "vibration_rolling_std_mms", "oil_pressure_residual_bar (-0.45 to -1.1 bar in bearing wear)"],
        "causal_rationale": "Separates mechanical journal bearing wear (high vibration + oil pressure bleed + oil temp rise) from combustion misfire vibration (high vibration + EGT/RPM drop) and valvetrain clatter (high vibration + high EGT).",
        "limitation_disclosure": "Uses broadband RMS vibration velocity (mm/s) at 1-10 Hz telemetry rate rather than kHz-rate raw accelerometer FFT order spectra.",
    },
]

SIH26054_EIGHT_PARAMETER_GROUPS_SPEC: List[Dict[str, Any]] = [
    {
        "group_id": 1,
        "group_name": "Engine RPM",
        "channels": ["rpm"],
        "unit": "RPM",
        "nominal_range": [4400.0, 5500.0],
        "warning_limits": [1400.0, 5650.0],
        "critical_limits": [1100.0, 5800.0],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Combustion & Speed Governance (Indirect via Oil-P/RPM ratio & Misfire Anomaly)",
        "health_weight_share_pct": 10.0,
    },
    {
        "group_id": 2,
        "group_name": "Cylinder Head Temperature (CHT)",
        "channels": ["cht_c"],
        "unit": "°C",
        "nominal_range": [135.0, 205.0],
        "warning_limits": [90.0, 220.0],
        "critical_limits": [70.0, 245.0],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Thermal Health Subscore (α = 30% weight with EGT)",
        "health_weight_share_pct": 20.0,
    },
    {
        "group_id": 3,
        "group_name": "Exhaust Gas Temperature (EGT)",
        "channels": ["egt_c"],
        "unit": "°C",
        "nominal_range": [740.0, 860.0],
        "warning_limits": [650.0, 885.0],
        "critical_limits": [580.0, 920.0],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Thermal Health Subscore (α = 30% weight with CHT)",
        "health_weight_share_pct": 10.0,
    },
    {
        "group_id": 4,
        "group_name": "Oil Pressure & Oil Temperature",
        "channels": ["oil_pressure_bar", "oil_temp_c"],
        "unit": "bar / °C",
        "nominal_range": ["2.5–5.2 bar", "85–112 °C"],
        "warning_limits": ["< 2.2 bar", "> 122 °C"],
        "critical_limits": ["< 1.6 bar", "> 135 °C"],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Oil & Lubrication Subscore (β = 30% weight)",
        "health_weight_share_pct": 30.0,
    },
    {
        "group_id": 5,
        "group_name": "Fuel-Flow Rate",
        "channels": ["fuel_flow_lph"],
        "unit": "L/h",
        "nominal_range": [14.0, 29.5],
        "warning_limits": [8.0, 33.0],
        "critical_limits": [5.0, 38.0],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Anomaly & Stoichiometric Subscore (δ = 20% ML/Residual weight)",
        "health_weight_share_pct": 5.0,
    },
    {
        "group_id": 6,
        "group_name": "Vibration Signatures",
        "channels": ["vibration_rms_mms"],
        "unit": "mm/s RMS",
        "nominal_range": [1.2, 3.8],
        "warning_limits": [0.5, 5.5],
        "critical_limits": [0.2, 8.0],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "Vibration & Mechanical Subscore (γ = 20% weight)",
        "health_weight_share_pct": 20.0,
    },
    {
        "group_id": 7,
        "group_name": "Battery & Alternator Health",
        "channels": ["battery_voltage_v", "alternator_current_a"],
        "unit": "V / A",
        "nominal_range": ["13.2–14.4 V", "12.0–28.0 A"],
        "warning_limits": ["< 12.4 V or > 14.8 V", "< 5.0 A or > 35.0 A"],
        "critical_limits": ["< 11.8 V or > 15.5 V", "< 2.0 A or > 42.0 A"],
        "physics_baseline_supported": False,
        "health_contribution_subsystem": "Electrical Bus Quality & Avionics Integrity (Monitored via Validator & Range Limits)",
        "health_weight_share_pct": 2.5,
    },
    {
        "group_id": 8,
        "group_name": "Injection Timing Parameters",
        "channels": ["injection_pulse_ms", "ignition_advance_deg"],
        "unit": "ms / °BTDC",
        "nominal_range": ["5.5–11.5 ms", "18.0–28.0 °BTDC"],
        "warning_limits": ["< 3.5 ms or > 13.5 ms", "< 12.0° or > 32.0°"],
        "critical_limits": ["< 2.0 ms or > 16.0 ms", "< 8.0° or > 36.0°"],
        "physics_baseline_supported": True,
        "health_contribution_subsystem": "ECU Injection Compensation & Combustion Timing (Fuel-to-Pulse Ratio in ML Vector)",
        "health_weight_share_pct": 2.5,
    },
]


class DeterministicFaultSimulator:
    """Generates reproducible synthetic telemetry trajectories with ground-truth fault labels."""

    def __init__(self) -> None:
        self.ref_model = AeroPistonReferenceModel()

    @staticmethod
    def _compute_operating_point(
        profile: MissionProfileType,
        t_sec: float,
        duration_sec: float,
        cfg: FaultScenarioConfig,
        rng: np.random.Generator,
    ) -> Dict[str, float]:
        progress = min(1.0, max(0.0, t_sec / max(1.0, duration_sec)))
        wave = math.sin(2.0 * math.pi * t_sec / 45.0)
        fast_wave = math.sin(2.0 * math.pi * t_sec / 12.0)

        altitude_m = cfg.base_altitude_m + 180.0 * math.sin(math.pi * progress)
        ambient_temp_c = cfg.base_ambient_temp_c - 0.0065 * (altitude_m - cfg.base_altitude_m)
        throttle_pct = cfg.base_throttle_pct + 4.0 * wave
        engine_load_pct = cfg.base_load_pct + 4.5 * wave

        if profile == "high_altitude":
            altitude_m = 5600.0 + 750.0 * math.sin(math.pi * progress)
            ambient_temp_c = -18.0 - 4.0 * math.sin(math.pi * progress)
            throttle_pct = min(96.0, cfg.base_throttle_pct + 14.0)
            engine_load_pct = min(98.0, cfg.base_load_pct + 12.0)
        elif profile == "hot_weather":
            altitude_m = 1200.0 + 200.0 * wave
            ambient_temp_c = 41.0 + 3.0 * math.sin(math.pi * progress)
            throttle_pct = cfg.base_throttle_pct + 5.0 * wave
            engine_load_pct = cfg.base_load_pct + 6.0 * wave
        elif profile == "long_endurance":
            altitude_m = 3800.0 + 120.0 * wave
            ambient_temp_c = 6.0 + 1.5 * wave
            throttle_pct = 62.0 + 2.0 * wave
            engine_load_pct = 64.0 + 2.5 * wave
        elif profile == "rapid_throttle":
            step_phase = int(t_sec // 10) % 4
            step_offsets = [-18.0, +16.0, -10.0, +20.0]
            throttle_pct = max(25.0, min(98.0, cfg.base_throttle_pct + step_offsets[step_phase] + 5.0 * fast_wave))
            engine_load_pct = max(28.0, min(104.0, throttle_pct * 1.03))

        rpm = 1850.0 + 39.5 * throttle_pct + float(rng.normal(0.0, 12.0))
        rpm = max(1500.0, min(5900.0, rpm))

        return {
            "rpm": round(rpm, 1),
            "throttle_pct": round(max(10.0, min(100.0, throttle_pct)), 2),
            "engine_load_pct": round(max(10.0, min(112.0, engine_load_pct)), 2),
            "altitude_m": round(altitude_m, 1),
            "ambient_temp_c": round(ambient_temp_c, 2),
        }

    def generate_scenario(self, cfg: FaultScenarioConfig) -> List[TelemetryInputFrame]:
        if cfg.fault_class not in NINE_FAULT_CLASSES:
            raise ValueError(
                f"Unsupported fault_class '{cfg.fault_class}'. Must be one of {NINE_FAULT_CLASSES}"
            )

        rng = np.random.default_rng(cfg.random_seed)
        num_steps = max(1, int(round(cfg.duration_sec / cfg.sample_interval_sec)))
        start_dt = datetime.fromisoformat(cfg.start_timestamp_iso.replace("Z", "+00:00"))

        frames: List[TelemetryInputFrame] = []
        stuck_value_cache: Optional[float] = None

        for step in range(num_steps):
            t_sec = round(step * cfg.sample_interval_sec, 3)
            dt_point = (start_dt + timedelta(seconds=t_sec)).astimezone(timezone.utc)
            if cfg.sample_interval_sec < 1.0 or abs(t_sec - round(t_sec)) > 1e-6:
                ts_iso = dt_point.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            else:
                ts_iso = dt_point.strftime("%Y-%m-%dT%H:%M:%SZ")

            op = self._compute_operating_point(
                cfg.mission_profile, t_sec, cfg.duration_sec, cfg, rng
            )

            # Build nominal frame to query physics reference
            dummy_validated = ValidatedTelemetryFrame(
                engine_id=cfg.engine_id,
                mission_id=cfg.mission_id,
                timestamp=ts_iso,
                sequence_number=step,
                mission_elapsed_sec=t_sec,
                rpm=op["rpm"],
                cht_c=175.0,
                egt_c=800.0,
                oil_pressure_bar=4.1,
                oil_temp_c=98.0,
                fuel_flow_lph=21.0,
                vibration_rms_mms=2.2,
                throttle_pct=op["throttle_pct"],
                engine_load_pct=op["engine_load_pct"],
                altitude_m=op["altitude_m"],
                ambient_temp_c=op["ambient_temp_c"],
                battery_voltage_v=13.8,
                alternator_current_a=18.5,
                injection_pulse_ms=8.2,
                ignition_advance_deg=26.0,
                data_source=DataSourceType.SIMULATOR,
                is_synthetic=True,
                quality={"is_valid": True, "quality_score": 1.0},  # type: ignore[arg-type]
            )
            exp = self.ref_model.estimate_expected(dummy_validated)

            # Baseline measurements = expected + small bounded Gaussian noise
            rpm = op["rpm"]
            cht_c = exp.cht_c + float(rng.normal(0.0, 1.15))
            egt_c = exp.egt_c + float(rng.normal(0.0, 3.80))
            oil_pressure_bar = exp.oil_pressure_bar + float(rng.normal(0.0, 0.045))
            oil_temp_c = exp.oil_temp_c + float(rng.normal(0.0, 0.85))
            fuel_flow_lph = exp.fuel_flow_lph + float(rng.normal(0.0, 0.28))
            vibration_rms_mms = exp.vibration_rms_mms + float(rng.normal(0.0, 0.09))
            battery_voltage_v = exp.battery_voltage_v + float(rng.normal(0.0, 0.04))
            alternator_current_a = 16.0 + 0.06 * op["engine_load_pct"] + float(rng.normal(0.0, 0.3))
            injection_pulse_ms = exp.injection_pulse_ms + float(rng.normal(0.0, 0.08))
            ignition_advance_deg = exp.ignition_advance_deg + float(rng.normal(0.0, 0.15))

            active_label = "Normal"
            active_sev = 0.0

            if cfg.fault_class != "Normal" and t_sec >= cfg.onset_time_sec:
                active_label = cfg.fault_class
                ramp_window = max(6.0, min(25.0, cfg.duration_sec * 0.20))
                prog = min(1.0, (t_sec - cfg.onset_time_sec) / ramp_window)
                # Ensure minimum progression of 0.45 right after onset so early fault frames are distinguishable
                p = 0.45 + 0.55 * prog
                s = max(0.25, cfg.severity)
                active_sev = round(s * p, 3)

                if cfg.fault_class == "Cylinder Overheating":
                    cht_c += (24.0 + 38.0 * s) * p
                    oil_temp_c += (10.0 + 18.0 * s) * p
                    egt_c += (18.0 + 30.0 * s) * p
                    rpm -= 55.0 * s * p
                elif cfg.fault_class == "Oil Pressure Drop":
                    oil_pressure_bar -= (1.15 + 1.55 * s) * p
                    oil_temp_c += (12.0 + 22.0 * s) * p
                    vibration_rms_mms += (0.75 + 1.15 * s) * p
                elif cfg.fault_class == "Crankshaft Bearing Wear":
                    vibration_rms_mms += (2.70 + 4.60 * s) * p
                    oil_pressure_bar -= (0.48 + 0.62 * s) * p
                    oil_temp_c += (9.0 + 15.0 * s) * p
                elif cfg.fault_class == "Cylinder Misfire":
                    egt_c -= (58.0 + 84.0 * s) * p
                    rpm -= (145.0 + 210.0 * s) * p
                    vibration_rms_mms += (2.25 + 3.50 * s) * p
                    cht_c -= (14.0 + 22.0 * s) * p
                elif cfg.fault_class == "Piston Ring Wear":
                    oil_temp_c += (15.0 + 24.0 * s) * p
                    cht_c += (13.0 + 20.0 * s) * p
                    fuel_flow_lph += (2.5 + 3.8 * s) * p
                    vibration_rms_mms += (1.15 + 1.75 * s) * p
                    oil_pressure_bar -= (0.35 + 0.50 * s) * p
                elif cfg.fault_class == "Valve Clearance Issue":
                    egt_c += (48.0 + 74.0 * s) * p
                    vibration_rms_mms += (1.45 + 2.25 * s) * p
                    cht_c += (6.0 + 12.0 * s) * p
                    fuel_flow_lph -= (1.2 + 1.8 * s) * p
                elif cfg.fault_class == "Fuel Injector Clogging":
                    fuel_flow_lph -= (3.3 + 5.0 * s) * p
                    injection_pulse_ms += (1.45 + 2.35 * s) * p
                    egt_c += (40.0 + 65.0 * s) * p
                    vibration_rms_mms += (0.90 + 1.45 * s) * p
                elif cfg.fault_class == "Sensor Fault":
                    target_ch = cfg.sensor_fault_channel
                    submode = cfg.sensor_fault_submode
                    ch_map = {
                        "cht_c": cht_c,
                        "egt_c": egt_c,
                        "oil_pressure_bar": oil_pressure_bar,
                        "vibration_rms_mms": vibration_rms_mms,
                    }
                    base_v = ch_map.get(target_ch, cht_c)
                    if submode == "stuck_at":
                        if stuck_value_cache is None:
                            stuck_value_cache = round(base_v, 2)
                        corrupted_val: Optional[float] = stuck_value_cache
                    elif submode == "drift":
                        if target_ch == "cht_c":
                            corrupted_val = base_v + (38.0 + 45.0 * s) * p
                        elif target_ch == "egt_c":
                            corrupted_val = base_v + (115.0 + 130.0 * s) * p
                        elif target_ch == "oil_pressure_bar":
                            corrupted_val = max(0.2, base_v - (1.8 + 1.5 * s) * p)
                        else:
                            corrupted_val = base_v + (4.5 + 5.0 * s) * p
                    elif submode == "high_noise":
                        corrupted_val = base_v + float(rng.normal(0.0, 35.0 if target_ch != "oil_pressure_bar" else 1.8))
                    elif submode == "missing_samples":
                        corrupted_val = None
                    else:  # implausible_values
                        corrupted_val = 485.0 if target_ch == "cht_c" else (-15.0 if target_ch == "oil_pressure_bar" else 1650.0)

                    if target_ch == "cht_c":
                        cht_c = corrupted_val  # type: ignore[assignment]
                    elif target_ch == "egt_c":
                        egt_c = corrupted_val  # type: ignore[assignment]
                    elif target_ch == "oil_pressure_bar":
                        oil_pressure_bar = corrupted_val  # type: ignore[assignment]
                    elif target_ch == "vibration_rms_mms":
                        vibration_rms_mms = corrupted_val  # type: ignore[assignment]

            frames.append(
                TelemetryInputFrame(
                    engine_id=cfg.engine_id,
                    mission_id=cfg.mission_id,
                    timestamp=ts_iso,
                    sequence_number=step,
                    mission_elapsed_sec=t_sec,
                    rpm=round(rpm, 1) if rpm is not None else None,
                    cht_c=round(cht_c, 2) if cht_c is not None else None,
                    egt_c=round(egt_c, 2) if egt_c is not None else None,
                    oil_pressure_bar=round(max(0.05, oil_pressure_bar), 3)
                    if oil_pressure_bar is not None and oil_pressure_bar > -5.0
                    else oil_pressure_bar,
                    oil_temp_c=round(oil_temp_c, 2) if oil_temp_c is not None else None,
                    fuel_flow_lph=round(max(1.0, fuel_flow_lph), 2) if fuel_flow_lph is not None else None,
                    vibration_rms_mms=round(max(0.1, vibration_rms_mms), 3)
                    if vibration_rms_mms is not None
                    else None,
                    throttle_pct=op["throttle_pct"],
                    engine_load_pct=op["engine_load_pct"],
                    altitude_m=op["altitude_m"],
                    ambient_temp_c=op["ambient_temp_c"],
                    battery_voltage_v=round(battery_voltage_v, 2),
                    alternator_current_a=round(alternator_current_a, 2),
                    injection_pulse_ms=round(injection_pulse_ms, 2),
                    ignition_advance_deg=round(ignition_advance_deg, 2),
                    data_source=DataSourceType.SIMULATOR,
                    is_synthetic=True,
                    scenario_label=active_label,
                    fault_severity=active_sev,
                    seed=cfg.random_seed,
                )
            )

        return frames
