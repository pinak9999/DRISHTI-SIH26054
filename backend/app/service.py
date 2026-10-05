"""Core DRISHTI Digital Twin orchestration service."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

from backend.app.alerts.alert_engine import ExplainableAlertEngine
from backend.app.db.database import DrishtiDatabase
from backend.app.ml.pipeline import HEALTH_INDEX_WEIGHTS, DrishtiMLPipeline
from backend.app.physics.engine_model import AeroPistonReferenceModel
from backend.app.simulation.fault_simulator import (
    DeterministicFaultSimulator,
    FAULT_SIGNAL_TRANSFORMATIONS_DOC,
    FaultScenarioConfig,
    SIH26054_EIGHT_FAULT_CATEGORY_MAPPING,
    SIH26054_EIGHT_PARAMETER_GROUPS_SPEC,
)
from backend.app.simulation.mission_profiles import MISSION_SCENARIO_CATALOG
from backend.app.simulation.replay_manager import MissionReplayController
from backend.app.telemetry.can_adapter import (
    ModularSocketCANAdapter,
    parse_csv_telemetry,
)
from backend.app.telemetry.schema import (
    ExplainableAlert,
    FourValueDigitalTwinState,
    NINE_FAULT_CLASSES,
    TelemetryInputFrame,
)
from backend.app.telemetry.validator import TelemetryValidator

FLEET_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "engine_id": "ENG-MALE-01",
        "tail_number": "UAV-DRISHTI-101",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88201",
        "total_operating_hours": 312.5,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-01",
            engine_id="ENG-MALE-01",
            mission_id="MSN-ISR-101",
            mission_profile="normal_mission",
            fault_class="Normal",
            onset_time_sec=999.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.0,
            random_seed=101,
            base_altitude_m=3200.0,
            base_ambient_temp_c=12.0,
            base_throttle_pct=73.0,
            base_load_pct=75.0,
        ),
        "mission_title": "Sortie ISR-101 — Nominal Maritime Loiter",
    },
    {
        "engine_id": "ENG-MALE-02",
        "tail_number": "UAV-DRISHTI-102",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88202",
        "total_operating_hours": 648.0,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-02",
            engine_id="ENG-MALE-02",
            mission_id="MSN-DESERT-102",
            mission_profile="hot_weather",
            fault_class="Cylinder Overheating",
            onset_time_sec=22.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.78,
            random_seed=102,
            base_altitude_m=1400.0,
            base_ambient_temp_c=41.0,
            base_throttle_pct=79.0,
            base_load_pct=82.0,
        ),
        "mission_title": "Sortie DESERT-102 — Hot-Weather Patrol (Cooling Baffle Degradation)",
    },
    {
        "engine_id": "ENG-MALE-03",
        "tail_number": "UAV-DRISHTI-103",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88203",
        "total_operating_hours": 815.2,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-03",
            engine_id="ENG-MALE-03",
            mission_id="MSN-PATROL-103",
            mission_profile="controlled_fault_injection",
            fault_class="Oil Pressure Drop",
            onset_time_sec=20.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.82,
            random_seed=103,
            base_altitude_m=2900.0,
            base_ambient_temp_c=16.0,
            base_throttle_pct=75.0,
            base_load_pct=77.0,
        ),
        "mission_title": "Sortie PATROL-103 — Progressive Oil Regulator Pressure Bleed",
    },
    {
        "engine_id": "ENG-MALE-04",
        "tail_number": "UAV-DRISHTI-104",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88204",
        "total_operating_hours": 920.8,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-04",
            engine_id="ENG-MALE-04",
            mission_id="MSN-ENDUR-104",
            mission_profile="long_endurance",
            fault_class="Crankshaft Bearing Wear",
            onset_time_sec=18.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.76,
            random_seed=104,
            base_altitude_m=3900.0,
            base_ambient_temp_c=5.0,
            base_throttle_pct=65.0,
            base_load_pct=67.0,
        ),
        "mission_title": "Sortie ENDUR-104 — Long-Endurance Loiter (Journal Bearing Wear)",
    },
    {
        "engine_id": "ENG-MALE-05",
        "tail_number": "UAV-DRISHTI-105",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88205",
        "total_operating_hours": 410.0,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-05",
            engine_id="ENG-MALE-05",
            mission_id="MSN-RECON-105",
            mission_profile="high_altitude",
            fault_class="Sensor Fault",
            sensor_fault_submode="drift",
            sensor_fault_channel="cht_c",
            onset_time_sec=24.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.85,
            random_seed=105,
            base_altitude_m=5600.0,
            base_ambient_temp_c=-16.0,
            base_throttle_pct=84.0,
            base_load_pct=86.0,
        ),
        "mission_title": "Sortie RECON-105 — High-Altitude Recon (Isolated CHT Thermocouple Drift)",
    },
    {
        "engine_id": "ENG-MALE-06",
        "tail_number": "UAV-DRISHTI-106",
        "uav_platform": "TAPAS-BH / MALE ISR Class",
        "engine_model": "Rotax 914F Turbo (Ref Twin v1.0)",
        "serial_number": "SN-R914-88206",
        "total_operating_hours": 530.4,
        "seed_scenario": FaultScenarioConfig(
            scenario_id="SIM-SEED-06",
            engine_id="ENG-MALE-06",
            mission_id="MSN-TRANS-106",
            mission_profile="historical_replay",
            fault_class="Fuel Injector Clogging",
            onset_time_sec=20.0,
            duration_sec=75.0,
            sample_interval_sec=1.0,
            severity=0.78,
            random_seed=106,
            base_altitude_m=3100.0,
            base_ambient_temp_c=11.0,
            base_throttle_pct=75.0,
            base_load_pct=77.0,
        ),
        "mission_title": "Sortie TRANS-106 — Recorded Mission (Nozzle Partial Restriction)",
    },
]


class DrishtiTwinService:
    """Unified service coordinating validation, physics twin, ML inference, alerts, replay, and DB."""

    def __init__(
        self,
        db_path: Optional[Path] = None,
        artifact_dir: Optional[Path] = None,
        auto_seed: bool = True,
    ) -> None:
        self.db = DrishtiDatabase(db_path=db_path)
        self.validator = TelemetryValidator()
        self.physics_model = AeroPistonReferenceModel()
        self.ml_pipeline = DrishtiMLPipeline(artifact_dir=artifact_dir)
        self.alert_engine = ExplainableAlertEngine()
        self.simulator = DeterministicFaultSimulator()
        self.can_adapter = ModularSocketCANAdapter()
        self.replay_controller = MissionReplayController()

        # Benchmark / latency telemetry
        self.last_inference_latency_ms: float = 0.0
        self.throughput_frames_per_sec: float = 0.0

        # Configurable Health Index & Mission Readiness Advisory Policy (Prototype Advisory Only)
        default_policy: Dict[str, Any] = {
            "weights": dict(HEALTH_INDEX_WEIGHTS),
            "readiness_thresholds": {
                "go_min_health_index": 75.0,
                "precaution_min_health_index": 55.0,
                "go_min_rul_hours": 15.0,
                "precaution_min_rul_hours": 5.0,
            },
            "channel_alert_limits": {
                "cht_warning_c": 220.0,
                "cht_critical_c": 245.0,
                "egt_warning_c": 885.0,
                "egt_critical_c": 920.0,
                "oil_pressure_min_warning_bar": 2.2,
                "oil_pressure_min_critical_bar": 1.6,
                "oil_temp_warning_c": 122.0,
                "vibration_warning_mms": 5.5,
                "vibration_critical_mms": 8.0,
                "battery_min_warning_v": 12.4,
            },
            "advisory_disclosure": "PROTOTYPE DECISION-SUPPORT ADVISORY ONLY — NOT A FLIGHT-SAFETY CERTIFICATION OR AIRWORTHINESS RELEASE.",
        }
        persisted_policy = self.db.get_config("health_policy")
        if persisted_policy and isinstance(persisted_policy, dict):
            self.health_policy = persisted_policy
            if "weights" in self.health_policy and isinstance(self.health_policy["weights"], dict):
                HEALTH_INDEX_WEIGHTS.update(self.health_policy["weights"])
        else:
            self.health_policy = default_policy
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.db.save_config("health_policy", self.health_policy, now_iso)

        self.ml_pipeline.load_or_train(force_retrain=False)
        self._telemetry_listeners: List[Callable[[FourValueDigitalTwinState, Optional[ExplainableAlert]], None]] = []
        self._continuous_sim_running: bool = False
        self._fleet_rng = np.random.default_rng(202610)
        self._fleet_sim_step: Dict[str, int] = {item["engine_id"]: 75 for item in FLEET_DEFINITIONS}
        if auto_seed and len(self.db.list_engines()) == 0:
            self.seed_demo_fleet()

    def subscribe_telemetry(
        self,
        listener: Callable[[FourValueDigitalTwinState, Optional[ExplainableAlert]], None],
    ) -> None:
        if listener not in self._telemetry_listeners:
            self._telemetry_listeners.append(listener)

    def unsubscribe_telemetry(
        self,
        listener: Callable[[FourValueDigitalTwinState, Optional[ExplainableAlert]], None],
    ) -> None:
        if listener in self._telemetry_listeners:
            self._telemetry_listeners.remove(listener)

    def step_continuous_fleet_frame(
        self,
    ) -> List[Tuple[FourValueDigitalTwinState, Optional[ExplainableAlert]]]:
        """Advance all 6 fleet engines by 1 telemetry sample and broadcast to subscribers."""
        results: List[Tuple[FourValueDigitalTwinState, Optional[ExplainableAlert]]] = []
        now_dt = datetime.now(timezone.utc)
        ts_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        now_str = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        for item in FLEET_DEFINITIONS:
            eng_id = item["engine_id"]
            cfg: FaultScenarioConfig = item["seed_scenario"]
            step = self._fleet_sim_step.get(eng_id, 75) + 1
            self._fleet_sim_step[eng_id] = step

            raw_frame = self.simulator.generate_frame_at_step(
                cfg=cfg,
                step=step,
                rng=self._fleet_rng,
                custom_timestamp_iso=ts_iso,
            )
            twin_state, alert = self.process_telemetry_frame(raw_frame)
            results.append((twin_state, alert))

            # Update DB engine status & telemetry
            existing_eng = self.db.get_engine(eng_id)
            if existing_eng:
                if twin_state.predicted.health_index < 55.0 or (
                    twin_state.predicted.predicted_fault_class not in ("Normal", "Sensor Fault")
                    and twin_state.predicted.top_probability >= 0.65
                ):
                    eng_status = (
                        "CRITICAL_FAULT"
                        if twin_state.predicted.health_index < 48.0
                        else "WARNING_DEGRADED"
                    )
                elif twin_state.predicted.sensor_diagnosis.is_sensor_fault_detected:
                    eng_status = "CAUTION_SENSOR_FAULT"
                elif twin_state.predicted.is_anomaly:
                    eng_status = "CAUTION_ANOMALY"
                else:
                    eng_status = "NOMINAL_OPERATIONAL"

                eng_record = dict(existing_eng)
                eng_record.update(
                    {
                        "status": eng_status,
                        "latest_health_index": twin_state.predicted.health_index,
                        "latest_fault_class": twin_state.predicted.predicted_fault_class,
                        "latest_rul_status": twin_state.predicted.rul_status,
                        "latest_rul_hours": twin_state.predicted.rul_hours,
                        "updated_at": now_str,
                    }
                )
                self.db.upsert_engine(eng_record)

            # Broadcast to subscribers
            for listener in list(self._telemetry_listeners):
                try:
                    listener(twin_state, alert)
                except Exception:
                    pass

        return results

    async def run_continuous_simulation(self, interval_sec: float = 1.0) -> None:
        """Background coroutine advancing fleet simulation continuously."""
        self._continuous_sim_running = True
        while self._continuous_sim_running:
            try:
                self.step_continuous_fleet_frame()
            except Exception:
                pass
            await asyncio.sleep(interval_sec)

    def stop_continuous_simulation(self) -> None:
        self._continuous_sim_running = False

    def process_telemetry_frame(
        self, frame: TelemetryInputFrame
    ) -> Tuple[FourValueDigitalTwinState, Optional[ExplainableAlert]]:
        t0 = time.perf_counter()
        validated = self.validator.validate_frame(frame)
        expected = self.physics_model.estimate_expected(validated)
        calculated = self.physics_model.calculate_residuals_and_trends(validated, expected)
        predicted = self.ml_pipeline.predict_point(validated, expected, calculated)
        alert = self.alert_engine.evaluate(validated, expected, calculated, predicted)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        self.last_inference_latency_ms = round(elapsed_ms, 3)

        twin_state = FourValueDigitalTwinState(
            engine_id=validated.engine_id,
            mission_id=validated.mission_id,
            timestamp=validated.timestamp,
            sequence_number=validated.sequence_number,
            mission_elapsed_sec=validated.mission_elapsed_sec,
            data_source=validated.data_source,
            is_synthetic=validated.is_synthetic,
            actual=validated,
            expected=expected,
            calculated=calculated,
            predicted=predicted,
        )
        return twin_state, alert

    def run_simulation_scenario(
        self,
        cfg: FaultScenarioConfig,
        title: Optional[str] = None,
        engine_metadata_override: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        t_start = time.perf_counter()
        self.validator.reset_stream(cfg.engine_id, cfg.mission_id)
        self.physics_model.reset_engine_state(cfg.engine_id, cfg.mission_id)
        self.ml_pipeline.sensor_isolator.reset_stream(cfg.engine_id, cfg.mission_id)

        raw_frames = self.simulator.generate_scenario(cfg)
        states: List[FourValueDigitalTwinState] = []
        alerts: List[ExplainableAlert] = []

        for rf in raw_frames:
            st, alt = self.process_telemetry_frame(rf)
            states.append(st)
            if alt is not None:
                alerts.append(alt)

        total_sec = max(1e-6, time.perf_counter() - t_start)
        self.throughput_frames_per_sec = round(len(states) / total_sec, 1)

        final_state = states[-1]
        min_hi = round(min(s.predicted.health_index for s in states), 1)
        max_cht_res = round(max(abs(s.calculated.cht_residual_c) for s in states), 2)
        max_vib_res = round(max(abs(s.calculated.vibration_residual_mms) for s in states), 3)
        min_oil_res = round(min(s.calculated.oil_pressure_residual_bar for s in states), 3)

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        mission_title = title or f"Simulation {cfg.mission_id} ({cfg.fault_class})"

        summary = {
            "total_frames": len(states),
            "alert_count": len(alerts),
            "initial_health_index": states[0].predicted.health_index,
            "final_health_index": final_state.predicted.health_index,
            "min_health_index": min_hi,
            "final_predicted_class": final_state.predicted.predicted_fault_class,
            "final_top_probability": final_state.predicted.top_probability,
            "final_rul_status": final_state.predicted.rul_status,
            "final_rul_hours": final_state.predicted.rul_hours,
            "final_rul_interval_hours": [
                final_state.predicted.rul_lower_10_hours,
                final_state.predicted.rul_upper_90_hours,
            ],
            "peak_abs_cht_residual_c": max_cht_res,
            "peak_abs_vibration_residual_mms": max_vib_res,
            "min_oil_pressure_residual_bar": min_oil_res,
            "processing_throughput_fps": self.throughput_frames_per_sec,
            "mean_frame_latency_ms": round((total_sec * 1000.0) / max(1, len(states)), 3),
        }

        mission_meta = {
            "mission_id": cfg.mission_id,
            "engine_id": cfg.engine_id,
            "title": mission_title,
            "mission_profile": cfg.mission_profile,
            "fault_class": cfg.fault_class,
            "severity": cfg.severity,
            "onset_time_sec": cfg.onset_time_sec,
            "duration_sec": cfg.duration_sec,
            "random_seed": cfg.random_seed,
            "data_source": raw_frames[0].data_source.value,
            "is_synthetic": True,
            "created_at": now_iso,
            "config": cfg.model_dump(),
            "summary": summary,
        }
        self.db.save_mission_and_states(mission_meta, states, alerts)

        # Update or create engine record
        existing_eng = self.db.get_engine(cfg.engine_id)
        if final_state.predicted.health_index < 55.0 or (
            final_state.predicted.predicted_fault_class not in ("Normal", "Sensor Fault")
            and final_state.predicted.top_probability >= 0.65
        ):
            eng_status = "CRITICAL_FAULT" if final_state.predicted.health_index < 48.0 else "WARNING_DEGRADED"
        elif final_state.predicted.sensor_diagnosis.is_sensor_fault_detected:
            eng_status = "CAUTION_SENSOR_FAULT"
        elif final_state.predicted.is_anomaly:
            eng_status = "CAUTION_ANOMALY"
        else:
            eng_status = "NOMINAL_OPERATIONAL"

        eng_record = {
            "engine_id": cfg.engine_id,
            "tail_number": (engine_metadata_override or {}).get(
                "tail_number",
                existing_eng["tail_number"] if existing_eng else f"UAV-{cfg.engine_id}",
            ),
            "uav_platform": (engine_metadata_override or {}).get(
                "uav_platform",
                existing_eng["uav_platform"] if existing_eng else "TAPAS-BH / MALE ISR Class",
            ),
            "engine_model": (engine_metadata_override or {}).get(
                "engine_model",
                existing_eng["engine_model"] if existing_eng else "Rotax 914F Turbo (Ref Twin v1.0)",
            ),
            "serial_number": (engine_metadata_override or {}).get(
                "serial_number",
                existing_eng["serial_number"] if existing_eng else f"SN-{cfg.engine_id}",
            ),
            "total_operating_hours": (engine_metadata_override or {}).get(
                "total_operating_hours",
                existing_eng["total_operating_hours"] if existing_eng else 420.0,
            ),
            "status": eng_status,
            "active_mission_id": cfg.mission_id,
            "latest_health_index": final_state.predicted.health_index,
            "latest_fault_class": final_state.predicted.predicted_fault_class,
            "latest_rul_status": final_state.predicted.rul_status,
            "latest_rul_hours": final_state.predicted.rul_hours,
            "data_source": raw_frames[0].data_source.value,
            "is_synthetic": True,
            "updated_at": now_iso,
        }
        self.db.upsert_engine(eng_record)

        sim_record = {
            "simulation_id": cfg.scenario_id,
            "engine_id": cfg.engine_id,
            "mission_id": cfg.mission_id,
            "created_at": now_iso,
            "config": cfg.model_dump(),
            "summary": summary,
        }
        self.db.save_simulation(sim_record)

        report_id = f"RPT-{cfg.mission_id}"
        report_record = {
            "report_id": report_id,
            "title": f"Engineering Evaluation & Digital Twin Report — {mission_title}",
            "engine_id": cfg.engine_id,
            "mission_id": cfg.mission_id,
            "simulation_id": cfg.scenario_id,
            "created_at": now_iso,
            "is_synthetic": True,
            "data_source": raw_frames[0].data_source.value,
            "physics_model_version": self.physics_model.model_version,
            "ml_model_version": self.ml_pipeline.model_version,
            "scenario_configuration": cfg.model_dump(),
            "measured_results": summary,
            "latest_four_value_snapshot": final_state.model_dump(),
            "alerts_generated": [a.model_dump() for a in alerts[:15]],
            "engineering_disclosures": [
                "All scenario telemetry is generated by a deterministic physics-informed simulator with documented equations.",
                "Fault classification, anomaly detection, and RUL estimates are advisory engineering outputs evaluated on held-out trajectories.",
                "This report does not constitute airworthiness certification or flight-release authorization.",
            ],
        }
        self.db.save_report(report_record)

        return {
            "simulation_id": cfg.scenario_id,
            "report_id": report_id,
            "engine": eng_record,
            "mission": mission_meta,
            "summary": summary,
            "latest_state": final_state.model_dump(),
            "alerts": [a.model_dump() for a in alerts],
        }

    def ingest_csv_mission(
        self,
        csv_text: str,
        engine_id: str = "ENG-MALE-01",
        mission_id: str = "MSN-CSV-001",
        title: str = "Historical CSV Telemetry Import",
    ) -> Dict[str, Any]:
        frames = parse_csv_telemetry(
            csv_text, default_engine_id=engine_id, default_mission_id=mission_id
        )
        if not frames:
            raise ValueError("CSV payload contained no telemetry rows.")

        self.validator.reset_stream(engine_id, mission_id)
        self.physics_model.reset_engine_state(engine_id, mission_id)
        self.ml_pipeline.sensor_isolator.reset_stream(engine_id, mission_id)

        states: List[FourValueDigitalTwinState] = []
        alerts: List[ExplainableAlert] = []
        for f in frames:
            st, alt = self.process_telemetry_frame(f)
            states.append(st)
            if alt is not None:
                alerts.append(alt)

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        final_st = states[-1]
        summary = {
            "total_frames": len(states),
            "alert_count": len(alerts),
            "initial_health_index": states[0].predicted.health_index,
            "final_health_index": final_st.predicted.health_index,
            "final_predicted_class": final_st.predicted.predicted_fault_class,
            "final_rul_status": final_st.predicted.rul_status,
            "final_rul_hours": final_st.predicted.rul_hours,
        }
        mission_meta = {
            "mission_id": mission_id,
            "engine_id": engine_id,
            "title": title,
            "mission_profile": "historical_replay",
            "fault_class": final_st.predicted.predicted_fault_class,
            "severity": frames[-1].fault_severity,
            "onset_time_sec": 0.0,
            "duration_sec": frames[-1].mission_elapsed_sec,
            "random_seed": 0,
            "data_source": "CSV_REPLAY",
            "is_synthetic": frames[0].is_synthetic,
            "created_at": now_iso,
            "config": {"source": "CSV_REPLAY", "rows": len(frames)},
            "summary": summary,
        }
        self.db.save_mission_and_states(mission_meta, states, alerts)

        existing_eng = self.db.get_engine(engine_id)
        if final_st.predicted.health_index < 55.0 or (
            final_st.predicted.predicted_fault_class not in ("Normal", "Sensor Fault")
            and final_st.predicted.top_probability >= 0.65
        ):
            eng_status = (
                "CRITICAL_FAULT"
                if final_st.predicted.health_index < 48.0
                else "WARNING_DEGRADED"
            )
        elif final_st.predicted.sensor_diagnosis.is_sensor_fault_detected:
            eng_status = "CAUTION_SENSOR_FAULT"
        elif final_st.predicted.is_anomaly:
            eng_status = "CAUTION_ANOMALY"
        else:
            eng_status = "NOMINAL_OPERATIONAL"

        eng_record = {
            "engine_id": engine_id,
            "tail_number": existing_eng["tail_number"]
            if existing_eng
            else f"UAV-{engine_id}",
            "uav_platform": existing_eng["uav_platform"]
            if existing_eng
            else "TAPAS-BH / MALE ISR Class",
            "engine_model": existing_eng["engine_model"]
            if existing_eng
            else "Rotax 914F Turbo (Ref Twin v1.0)",
            "serial_number": existing_eng["serial_number"]
            if existing_eng
            else f"SN-{engine_id}",
            "total_operating_hours": existing_eng["total_operating_hours"]
            if existing_eng
            else 420.0,
            "status": eng_status,
            "active_mission_id": mission_id,
            "latest_health_index": final_st.predicted.health_index,
            "latest_fault_class": final_st.predicted.predicted_fault_class,
            "latest_rul_status": final_st.predicted.rul_status,
            "latest_rul_hours": final_st.predicted.rul_hours,
            "data_source": "CSV_REPLAY",
            "is_synthetic": bool(frames[0].is_synthetic),
            "updated_at": now_iso,
        }
        self.db.upsert_engine(eng_record)

        return {
            "engine": eng_record,
            "mission": mission_meta,
            "summary": summary,
            "latest_state": final_st.model_dump(),
            "alerts": [a.model_dump() for a in alerts],
        }

    def seed_demo_fleet(self) -> Dict[str, Any]:
        self.db.clear_all()
        seeded_engines: List[str] = []
        seeded_missions: List[str] = []

        for item in FLEET_DEFINITIONS:
            cfg: FaultScenarioConfig = item["seed_scenario"]
            res = self.run_simulation_scenario(
                cfg=cfg,
                title=item["mission_title"],
                engine_metadata_override={
                    "tail_number": item["tail_number"],
                    "uav_platform": item["uav_platform"],
                    "engine_model": item["engine_model"],
                    "serial_number": item["serial_number"],
                    "total_operating_hours": item["total_operating_hours"],
                },
            )
            seeded_engines.append(cfg.engine_id)
            seeded_missions.append(cfg.mission_id)

        # Load the first fault mission into replay controller by default so Historical Replay is immediately ready
        default_replay_mission = self.db.get_mission("MSN-DESERT-102")
        if default_replay_mission:
            telem = self.db.get_engine_telemetry("ENG-MALE-02", "MSN-DESERT-102", limit=500)
            alts = self.db.get_engine_alerts("ENG-MALE-02", "MSN-DESERT-102", limit=500)
            self.replay_controller.load_mission(
                mission_meta=default_replay_mission,
                states=telem["items"],
                alerts=list(reversed(alts)),
                speed=1.0,
                start_index=35,
            )
            self.replay_controller.stop()

        return {
            "seeded_engine_count": len(seeded_engines),
            "seeded_engines": seeded_engines,
            "seeded_missions": seeded_missions,
        }

    def get_fleet_overview(self) -> Dict[str, Any]:
        engines = self.db.list_engines()
        alerts = self.db.get_engine_alerts(limit=100)
        nominal = sum(1 for e in engines if e["status"] == "NOMINAL_OPERATIONAL")
        caution = sum(1 for e in engines if e["status"].startswith("CAUTION"))
        warning = sum(1 for e in engines if e["status"].startswith("WARNING"))
        critical = sum(1 for e in engines if e["status"].startswith("CRITICAL"))
        mean_hi = (
            round(sum(float(e["latest_health_index"]) for e in engines) / len(engines), 1)
            if engines
            else 0.0
        )

        return {
            "fleet_size": len(engines),
            "nominal_count": nominal,
            "caution_count": caution,
            "warning_count": warning,
            "critical_count": critical,
            "mean_fleet_health_index": mean_hi,
            "total_active_alerts": len(alerts),
            "engines": engines,
            "recent_alerts": alerts[:25],
            "can_adapter_status": self.can_adapter.get_interface_status(),
            "data_quality_stats": self.validator.get_rejection_stats(),
        }

    def get_system_catalog(self) -> Dict[str, Any]:
        return {
            "fault_classes": NINE_FAULT_CLASSES,
            "fault_signal_transformations": FAULT_SIGNAL_TRANSFORMATIONS_DOC,
            "sih26054_eight_fault_categories": SIH26054_EIGHT_FAULT_CATEGORY_MAPPING,
            "sih26054_eight_parameter_groups": SIH26054_EIGHT_PARAMETER_GROUPS_SPEC,
            "mission_presets": MISSION_SCENARIO_CATALOG,
            "physics_metadata": self.physics_model.get_model_metadata(),
            "can_interface": self.can_adapter.get_interface_status(),
            "health_policy": self.health_policy,
        }

    def get_health_policy(self) -> Dict[str, Any]:
        persisted = self.db.get_config("health_policy")
        if persisted and isinstance(persisted, dict):
            self.health_policy = persisted
        return self.health_policy

    def update_health_policy(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict) or not payload:
            raise ValueError("Health policy payload must be a non-empty JSON object.")

        if "weights" in payload:
            if not isinstance(payload["weights"], dict):
                raise ValueError("Field 'weights' must be a JSON object.")
            w_in = payload["weights"]
            raw_t = float(w_in.get("thermal_penalty_weight", self.health_policy["weights"]["thermal_penalty_weight"]))
            raw_o = float(w_in.get("oil_penalty_weight", self.health_policy["weights"]["oil_penalty_weight"]))
            raw_v = float(w_in.get("vibration_penalty_weight", self.health_policy["weights"]["vibration_penalty_weight"]))
            raw_a = float(w_in.get("anomaly_penalty_weight", self.health_policy["weights"]["anomaly_penalty_weight"]))
            if any(x < 0.0 for x in (raw_t, raw_o, raw_v, raw_a)):
                raise ValueError("Health Index penalty weights must be non-negative (>= 0.0).")
            total_w = raw_t + raw_o + raw_v + raw_a
            if total_w <= 0.0:
                raise ValueError("Sum of Health Index penalty weights must be > 0.")
            norm_weights = {
                "thermal_penalty_weight": round(raw_t / total_w, 4),
                "oil_penalty_weight": round(raw_o / total_w, 4),
                "vibration_penalty_weight": round(raw_v / total_w, 4),
                "anomaly_penalty_weight": round(raw_a / total_w, 4),
            }
            self.health_policy["weights"] = norm_weights
            HEALTH_INDEX_WEIGHTS.update(norm_weights)

        if "readiness_thresholds" in payload:
            if not isinstance(payload["readiness_thresholds"], dict):
                raise ValueError("Field 'readiness_thresholds' must be a JSON object.")
            rt = payload["readiness_thresholds"]
            cur_rt = dict(self.health_policy["readiness_thresholds"])
            for k in ("go_min_health_index", "precaution_min_health_index", "go_min_rul_hours", "precaution_min_rul_hours"):
                if k in rt:
                    cur_rt[k] = float(rt[k])
            if not (0.0 <= cur_rt["precaution_min_health_index"] < cur_rt["go_min_health_index"] <= 100.0):
                raise ValueError(
                    "Invalid readiness thresholds: must satisfy 0.0 <= precaution_min_health_index < go_min_health_index <= 100.0."
                )
            if not (0.0 <= cur_rt["precaution_min_rul_hours"] < cur_rt["go_min_rul_hours"]):
                raise ValueError(
                    "Invalid RUL readiness thresholds: must satisfy 0.0 <= precaution_min_rul_hours < go_min_rul_hours."
                )
            self.health_policy["readiness_thresholds"] = cur_rt

        if "channel_alert_limits" in payload:
            if not isinstance(payload["channel_alert_limits"], dict):
                raise ValueError("Field 'channel_alert_limits' must be a JSON object.")
            cal = payload["channel_alert_limits"]
            for k, v in cal.items():
                if k in self.health_policy["channel_alert_limits"]:
                    val_f = float(v)
                    if val_f <= 0.0:
                        raise ValueError(f"Channel alert limit '{k}' must be > 0.")
                    self.health_policy["channel_alert_limits"][k] = val_f

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.db.save_config("health_policy", self.health_policy, now_iso)
        self._recalculate_fleet_health_with_policy(now_iso)
        return self.health_policy

    def _recalculate_fleet_health_with_policy(self, now_iso: str) -> None:
        w = self.health_policy["weights"]
        rt = self.health_policy["readiness_thresholds"]
        prec_hi = float(rt["precaution_min_health_index"])
        for eng in self.db.list_engines():
            telem = self.db.get_engine_telemetry(eng["engine_id"], eng["active_mission_id"], limit=5)
            if not telem["items"]:
                continue
            latest = telem["items"][-1]
            pred = latest.get("predicted", {})
            b = pred.get("health_breakdown", {})
            recomputed_hi = round(
                max(
                    0.0,
                    min(
                        100.0,
                        w["thermal_penalty_weight"] * float(b.get("thermal_health_subscore", 100.0))
                        + w["oil_penalty_weight"] * float(b.get("oil_system_subscore", 100.0))
                        + w["vibration_penalty_weight"] * float(b.get("vibration_mechanical_subscore", 100.0))
                        + w["anomaly_penalty_weight"] * float(b.get("anomaly_subscore", 100.0)),
                    ),
                ),
                1,
            )
            eng["latest_health_index"] = recomputed_hi
            top_cls = pred.get("predicted_fault_class", eng["latest_fault_class"])
            top_prob = float(pred.get("top_probability", 0.0))
            s_diag = pred.get("sensor_diagnosis", {})
            if recomputed_hi < prec_hi or (top_cls not in ("Normal", "Sensor Fault") and top_prob >= 0.65):
                eng["status"] = "CRITICAL_FAULT" if recomputed_hi < (prec_hi - 7.0) else "WARNING_DEGRADED"
            elif s_diag.get("is_sensor_fault_detected"):
                eng["status"] = "CAUTION_SENSOR_FAULT"
            elif pred.get("is_anomaly"):
                eng["status"] = "CAUTION_ANOMALY"
            else:
                eng["status"] = "NOMINAL_OPERATIONAL"
            eng["updated_at"] = now_iso
            self.db.upsert_engine(eng)

    def evaluate_engine_parameter_groups(self, engine_id: str) -> Dict[str, Any]:
        eng = self.db.get_engine(engine_id)
        if not eng:
            raise ValueError(f"Engine '{engine_id}' not found.")
        telem = self.db.get_engine_telemetry(engine_id, eng["active_mission_id"], limit=200)
        items = telem["items"]
        if not items:
            return {"engine_id": engine_id, "mission_id": eng["active_mission_id"], "groups": []}

        latest = items[-1]
        act = latest["actual"]
        exp = latest["expected"]
        calc = latest["calculated"]
        pred = latest["predicted"]
        limits = self.health_policy["channel_alert_limits"]

        def _series_stats(ch: str) -> Dict[str, float]:
            vals = [float(st["actual"].get(ch, 0.0)) for st in items if st["actual"].get(ch) is not None]
            if not vals:
                return {"mean": 0.0, "min": 0.0, "max": 0.0}
            return {
                "mean": round(sum(vals) / len(vals), 2),
                "min": round(min(vals), 2),
                "max": round(max(vals), 2),
            }

        groups = [
            {
                "group_id": 1,
                "group_name": "1. Engine RPM",
                "unit": "RPM",
                "current_value": f"{act['rpm']:.0f} RPM",
                "expected_value": f"{act['rpm']:.0f} RPM (Target Cmd)",
                "residual_value": "0.0 RPM (Speed Reference)",
                "operating_range": "4,400–5,500 RPM (Warn <1,400 / >5,650)",
                "historical_stats": _series_stats("rpm"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']} ({latest['timestamp']})",
                "abnormality_detected": act["rpm"] < 1400.0 or act["rpm"] > 5650.0,
                "severity": "WARNING" if (act["rpm"] < 1400.0 or act["rpm"] > 5650.0) else "NOMINAL",
                "health_contribution": f"Speed governance & Oil-P/RPM ratio ({pred['health_breakdown'].get('anomaly_subscore', 100.0):.1f}% subscore)",
            },
            {
                "group_id": 2,
                "group_name": "2. Cylinder Head Temperature (CHT)",
                "unit": "°C",
                "current_value": f"{act['cht_c']:.1f} °C",
                "expected_value": f"{exp['cht_c']:.1f} °C",
                "residual_value": f"{calc['cht_residual_c']:+.2f} °C (Slope: {calc['cht_rolling_slope_c_per_s']:+.3f} °C/s)",
                "operating_range": f"135–205 °C (Warn >{limits['cht_warning_c']} °C, Crit >{limits['cht_critical_c']} °C)",
                "historical_stats": _series_stats("cht_c"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": act["cht_c"] >= limits["cht_warning_c"] or abs(calc["cht_residual_c"]) > 15.0,
                "severity": "CRITICAL" if act["cht_c"] >= limits["cht_critical_c"] else ("WARNING" if (act["cht_c"] >= limits["cht_warning_c"] or abs(calc["cht_residual_c"]) > 15.0) else "NOMINAL"),
                "health_contribution": f"Thermal Subscore: {pred['health_breakdown'].get('thermal_health_subscore', 100.0):.1f}% (Weight α={self.health_policy['weights']['thermal_penalty_weight']:.2f})",
            },
            {
                "group_id": 3,
                "group_name": "3. Exhaust Gas Temperature (EGT)",
                "unit": "°C",
                "current_value": f"{act['egt_c']:.1f} °C",
                "expected_value": f"{exp['egt_c']:.1f} °C",
                "residual_value": f"{calc['egt_residual_c']:+.2f} °C",
                "operating_range": f"740–860 °C (Warn >{limits['egt_warning_c']} °C, Crit >{limits['egt_critical_c']} °C)",
                "historical_stats": _series_stats("egt_c"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": act["egt_c"] >= limits["egt_warning_c"] or abs(calc["egt_residual_c"]) > 35.0,
                "severity": "CRITICAL" if act["egt_c"] >= limits["egt_critical_c"] else ("WARNING" if (act["egt_c"] >= limits["egt_warning_c"] or abs(calc["egt_residual_c"]) > 35.0) else "NOMINAL"),
                "health_contribution": f"Thermal Subscore: {pred['health_breakdown'].get('thermal_health_subscore', 100.0):.1f}% (Weight α={self.health_policy['weights']['thermal_penalty_weight']:.2f})",
            },
            {
                "group_id": 4,
                "group_name": "4. Oil Pressure & Oil Temperature",
                "unit": "bar / °C",
                "current_value": f"{act['oil_pressure_bar']:.2f} bar / {act['oil_temp_c']:.1f} °C",
                "expected_value": f"{exp['oil_pressure_bar']:.2f} bar / {exp['oil_temp_c']:.1f} °C",
                "residual_value": f"{calc['oil_pressure_residual_bar']:+.3f} bar / {calc['oil_temp_residual_c']:+.2f} °C",
                "operating_range": f"2.5–5.2 bar (Warn <{limits['oil_pressure_min_warning_bar']}) | 85–112 °C (Warn >{limits['oil_temp_warning_c']})",
                "historical_stats": _series_stats("oil_pressure_bar"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": act["oil_pressure_bar"] <= limits["oil_pressure_min_warning_bar"] or calc["oil_pressure_residual_bar"] < -0.45 or act["oil_temp_c"] >= limits["oil_temp_warning_c"],
                "severity": "CRITICAL" if act["oil_pressure_bar"] <= limits["oil_pressure_min_critical_bar"] else ("WARNING" if (act["oil_pressure_bar"] <= limits["oil_pressure_min_warning_bar"] or calc["oil_pressure_residual_bar"] < -0.45) else "NOMINAL"),
                "health_contribution": f"Oil System Subscore: {pred['health_breakdown'].get('oil_system_subscore', 100.0):.1f}% (Weight β={self.health_policy['weights']['oil_penalty_weight']:.2f})",
            },
            {
                "group_id": 5,
                "group_name": "5. Fuel-Flow Rate",
                "unit": "L/h",
                "current_value": f"{act['fuel_flow_lph']:.2f} L/h",
                "expected_value": f"{exp['fuel_flow_lph']:.2f} L/h",
                "residual_value": f"{calc['fuel_flow_residual_lph']:+.2f} L/h",
                "operating_range": "14.0–29.5 L/h (Warn <8.0 or >33.0 L/h)",
                "historical_stats": _series_stats("fuel_flow_lph"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": abs(calc["fuel_flow_residual_lph"]) > 2.0,
                "severity": "WARNING" if abs(calc["fuel_flow_residual_lph"]) > 2.0 else "NOMINAL",
                "health_contribution": f"Stoichiometric Anomaly Subscore: {pred['health_breakdown'].get('anomaly_subscore', 100.0):.1f}% (Weight δ={self.health_policy['weights']['anomaly_penalty_weight']:.2f})",
            },
            {
                "group_id": 6,
                "group_name": "6. Vibration Signatures",
                "unit": "mm/s RMS",
                "current_value": f"{act['vibration_rms_mms']:.2f} mm/s",
                "expected_value": f"{exp['vibration_rms_mms']:.2f} mm/s",
                "residual_value": f"{calc['vibration_residual_mms']:+.3f} mm/s (Slope: {calc['vibration_rolling_slope_mms_per_s']:+.3f} mm/s²)",
                "operating_range": f"1.2–3.8 mm/s (Warn >{limits['vibration_warning_mms']}, Crit >{limits['vibration_critical_mms']} mm/s)",
                "historical_stats": _series_stats("vibration_rms_mms"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": act["vibration_rms_mms"] >= limits["vibration_warning_mms"] or calc["vibration_residual_mms"] > 1.0,
                "severity": "CRITICAL" if act["vibration_rms_mms"] >= limits["vibration_critical_mms"] else ("WARNING" if (act["vibration_rms_mms"] >= limits["vibration_warning_mms"] or calc["vibration_residual_mms"] > 1.0) else "NOMINAL"),
                "health_contribution": f"Vibration Mechanical Subscore: {pred['health_breakdown'].get('vibration_mechanical_subscore', 100.0):.1f}% (Weight γ={self.health_policy['weights']['vibration_penalty_weight']:.2f})",
            },
            {
                "group_id": 7,
                "group_name": "7. Battery & Alternator Health",
                "unit": "V / A",
                "current_value": f"{act['battery_voltage_v']:.2f} V / {act['alternator_current_a']:.1f} A",
                "expected_value": "13.80 V / 18.0 A (Bus Nominal)",
                "residual_value": f"{act['battery_voltage_v'] - 13.8:+.2f} V / {act['alternator_current_a'] - 18.0:+.1f} A",
                "operating_range": f"13.2–14.4 V (Warn <{limits['battery_min_warning_v']} V) | 12.0–28.0 A",
                "historical_stats": _series_stats("battery_voltage_v"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": act["battery_voltage_v"] < limits["battery_min_warning_v"] or act["battery_voltage_v"] > 14.8,
                "severity": "WARNING" if (act["battery_voltage_v"] < limits["battery_min_warning_v"] or act["battery_voltage_v"] > 14.8) else "NOMINAL",
                "health_contribution": "Avionics & ECU Electrical Bus Integrity (Data-Quality Gate)",
            },
            {
                "group_id": 8,
                "group_name": "8. Injection Timing Parameters",
                "unit": "ms / °BTDC",
                "current_value": f"{act['injection_pulse_ms']:.2f} ms / {act['ignition_advance_deg']:.1f} °BTDC",
                "expected_value": f"{exp['injection_pulse_ms']:.2f} ms / 24.0 °BTDC",
                "residual_value": f"{calc['injection_pulse_residual_ms']:+.2f} ms",
                "operating_range": "5.5–11.5 ms | 18.0–28.0 °BTDC",
                "historical_stats": _series_stats("injection_pulse_ms"),
                "quality_freshness": f"Q={act['quality']['quality_score']:.2f} | Seq #{latest['sequence_number']}",
                "abnormality_detected": abs(calc["injection_pulse_residual_ms"]) > 1.0,
                "severity": "WARNING" if abs(calc["injection_pulse_residual_ms"]) > 1.0 else "NOMINAL",
                "health_contribution": "Fuel-to-Pulse Ratio Feature in 9-Class Classifier & Anomaly Detector",
            },
        ]

        return {
            "engine_id": engine_id,
            "mission_id": eng["active_mission_id"],
            "timestamp": latest["timestamp"],
            "sequence_number": latest["sequence_number"],
            "data_source": latest["data_source"],
            "is_synthetic": latest["is_synthetic"],
            "groups": groups,
        }

