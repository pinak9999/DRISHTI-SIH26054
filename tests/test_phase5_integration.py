"""DRISHTI Phase 5 Integration Tests — End-to-End Verification and Release Audit."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from typing import Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
import pytest

from backend.app.data_ingestion.real_data_pipeline import (
    LIU_ICE_EXPECTED_SHA256,
    MARINE_EXPECTED_SHA256,
    RealDatasetIngestor,
)
from backend.app.main import create_app
from backend.app.service import DrishtiTwinService


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


@pytest.fixture(scope="module")
def seeded_service_and_client(
    tmp_path_factory: pytest.TempPathFactory,
) -> Tuple[DrishtiTwinService, TestClient]:
    db_dir = tmp_path_factory.mktemp("phase5_db")
    svc = DrishtiTwinService(
        db_path=db_dir / "phase5_shared.db",
        artifact_dir=None,
        auto_seed=True,
    )
    app = create_app(service=svc)
    return svc, TestClient(app)


def test_backend_health_and_model_status_and_artifact_backup(
    seeded_service_and_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Verify /health, /api/model-status, and production model bundle backup integrity."""
    _, client = seeded_service_and_client

    r_health = client.get("/health")
    assert r_health.status_code == 200
    h_data = r_health.json()
    assert h_data["status"] == "ok"
    assert h_data["ml_models_loaded"] is True
    assert h_data["physics_model_version"] == "Rotax914-Simplified-Ref-v1.0"
    assert h_data["ml_model_version"] in (
        "DRISHTI-ML-Ensemble-v1.0",
        "DRISHTI-PPT-100K-Ensemble-v2.0",
    )
    assert "model_bundle_sha256" in h_data
    assert len(h_data["model_bundle_sha256"]) == 64
    assert h_data["can_interface"]["hardware_connected"] is False

    r_status = client.get("/api/model-status")
    assert r_status.status_code == 200
    s_data = r_status.json()
    assert s_data["ml_loaded"] is True
    assert "evaluation_report" in s_data
    assert "bundle_sha256" in s_data
    assert s_data["bundle_sha256"] == h_data["model_bundle_sha256"]
    assert s_data["evaluation_report"]["classification_metrics"]["macro_f1"] > 0.85

    prod_bundle = ROOT_DIR / "backend" / "artifacts" / "drishti_ml_bundle.joblib"
    backup_bundle = (
        ROOT_DIR / "backend" / "artifacts" / "backups" / "drishti_ml_bundle.joblib.bak"
    )
    assert prod_bundle.exists(), "Production ML bundle must exist"
    assert backup_bundle.exists(), "Backed-up ML bundle must exist"
    assert _sha256(prod_bundle) == _sha256(backup_bundle)

    ppt_bundle = ROOT_DIR / "backend" / "artifacts" / "ppt_100k_ml_bundle.joblib"
    ppt_backup = (
        ROOT_DIR / "backend" / "artifacts" / "backups" / "ppt_100k_ml_bundle.joblib.bak"
    )
    if ppt_bundle.exists() and ppt_backup.exists():
        assert _sha256(ppt_bundle) == _sha256(ppt_backup)


def test_all_routes_registered_and_error_handling(
    seeded_service_and_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Verify all documented REST/WebSocket routes exist and return proper 404/422 errors."""
    _, client = seeded_service_and_client
    app = client.app

    registered_paths = {getattr(r, "path", "") for r in app.routes}
    expected_paths = {
        "/health",
        "/api/model-status",
        "/api/model-retrain",
        "/api/catalog",
        "/api/fleet",
        "/api/fleet/seed",
        "/api/engines",
        "/api/engines/{engine_id}",
        "/api/engines/{engine_id}/telemetry",
        "/api/engines/{engine_id}/health",
        "/api/engines/{engine_id}/alerts",
        "/api/alerts/{alert_id}/acknowledge",
        "/api/predict",
        "/api/simulations",
        "/api/simulations/{simulation_id}",
        "/api/telemetry/ingest-csv",
        "/api/replay/start",
        "/api/replay/stop",
        "/api/replay/seek",
        "/api/replay/step",
        "/api/replay/status",
        "/api/missions",
        "/api/reports",
        "/api/reports/{report_id}",
        "/ws/telemetry",
    }
    missing = expected_paths - registered_paths
    assert not missing, f"Missing expected routes: {missing}"

    # 404 error checks
    assert client.get("/api/engines/ENG-DOES-NOT-EXIST").status_code == 404
    assert client.get("/api/engines/ENG-DOES-NOT-EXIST/telemetry").status_code == 404
    assert client.get("/api/engines/ENG-DOES-NOT-EXIST/health").status_code == 404
    assert client.get("/api/engines/ENG-DOES-NOT-EXIST/alerts").status_code == 404
    assert client.get("/api/simulations/SIM-DOES-NOT-EXIST").status_code == 404
    assert client.get("/api/reports/RPT-DOES-NOT-EXIST").status_code == 404
    assert client.post("/api/alerts/ALT-DOES-NOT-EXIST/acknowledge").status_code == 404
    assert (
        client.post(
            "/api/replay/start",
            json={"mission_id": "MSN-DOES-NOT-EXIST", "playback_speed": 1.0},
        ).status_code
        == 404
    )

    # 422 / 400 validation error checks
    bad_predict = {
        "engine_id": "ENG-MALE-01",
        "mission_id": "MSN-BAD",
        "timestamp": "2026-10-03T10:00:00Z",
        "sequence_number": 1,
        "data_source": "SIMULATION",  # Invalid enum (valid is SIMULATOR)
    }
    assert client.post("/api/predict", json=bad_predict).status_code == 422

    bad_csv = {
        "csv_text": "sequence_number,mission_elapsed_sec\n",
        "engine_id": "ENG-MALE-01",
        "mission_id": "MSN-EMPTY-CSV",
    }
    assert client.post("/api/telemetry/ingest-csv", json=bad_csv).status_code == 400


def test_missing_model_graceful_fallback_via_api(tmp_path: Path) -> None:
    """Verify API behavior when ML model artifacts are unloaded/unavailable."""
    svc = DrishtiTwinService(
        db_path=tmp_path / "phase5_nomodel.db",
        artifact_dir=None,
        auto_seed=False,
    )
    svc.ml_pipeline.is_loaded = False
    svc.ml_pipeline.scaler = None
    svc.ml_pipeline.classifier = None
    svc.ml_pipeline.anomaly_detector = None
    svc.ml_pipeline.rul_regressor = None

    app = create_app(service=svc)
    client = TestClient(app)

    r_health = client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["ml_models_loaded"] is False

    frame_payload = {
        "engine_id": "ENG-FALLBACK-01",
        "mission_id": "MSN-FALLBACK-01",
        "timestamp": "2026-10-03T10:00:00Z",
        "sequence_number": 0,
        "mission_elapsed_sec": 0.0,
        "rpm": 5000.0,
        "throttle_pct": 74.0,
        "engine_load_pct": 76.0,
        "altitude_m": 3000.0,
        "ambient_temp_c": 14.0,
        "cht_c": 178.0,
        "egt_c": 815.0,
        "oil_pressure_bar": 4.15,
        "oil_temp_c": 99.0,
        "fuel_flow_lph": 22.1,
        "vibration_rms_mms": 2.3,
        "data_source": "SIMULATOR",
        "is_synthetic": True,
    }
    r_pred = client.post("/api/predict", json=frame_payload)
    assert r_pred.status_code == 200
    pred = r_pred.json()["twin_state"]["predicted"]
    assert pred["model_version"] == "UNAVAILABLE_MODEL_ARTIFACT"
    assert pred["source"] == "FALLBACK_RULE_ONLY"
    assert pred["rul_status"] == "NOT_ESTIMABLE"
    assert pred["rul_hours"] is None


def test_normal_telemetry_sequence_end_to_end_trace(
    seeded_service_and_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Trace a normal simulated telemetry sequence through ingestion, persistence, prediction, and reporting."""
    _, client = seeded_service_and_client

    sim_cfg = {
        "scenario_id": "SIM-P5-NORMAL-TRACE",
        "engine_id": "ENG-P5-NORMAL",
        "mission_id": "MSN-P5-NORMAL-TRACE",
        "mission_profile": "normal_mission",
        "fault_class": "Normal",
        "onset_time_sec": 999.0,
        "duration_sec": 25.0,
        "sample_interval_sec": 1.0,
        "severity": 0.0,
        "random_seed": 5001,
        "base_altitude_m": 3000.0,
        "base_ambient_temp_c": 15.0,
        "base_throttle_pct": 74.0,
        "base_load_pct": 76.0,
    }
    r_sim = client.post("/api/simulations", json=sim_cfg)
    assert r_sim.status_code == 200
    sim_data = r_sim.json()

    assert sim_data["summary"]["total_frames"] == 25
    assert sim_data["summary"]["alert_count"] == 0
    assert sim_data["summary"]["final_predicted_class"] == "Normal"
    assert sim_data["summary"]["final_health_index"] >= 90.0
    assert sim_data["engine"]["status"] == "NOMINAL_OPERATIONAL"
    assert sim_data["engine"]["is_synthetic"] is True
    assert sim_data["engine"]["data_source"] == "SIMULATOR"

    r_eng = client.get("/api/engines/ENG-P5-NORMAL")
    assert r_eng.status_code == 200
    assert r_eng.json()["telemetry_count"] == 25
    assert len(r_eng.json()["alerts"]) == 0

    r_health = client.get("/api/engines/ENG-P5-NORMAL/health")
    assert r_health.status_code == 200
    h_json = r_health.json()
    assert len(h_json["degradation_trajectory"]) == 25
    assert h_json["latest_predicted"]["rul_status"] == "ESTIMATED"
    assert h_json["latest_predicted"]["rul_hours"] is not None


def test_fault_telemetry_sequence_and_sensor_fault_rul_gating_end_to_end(
    seeded_service_and_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Trace a fault sequence through simulation, persistence, alert generation, replay, and RUL gating."""
    _, client = seeded_service_and_client

    sim_cfg = {
        "scenario_id": "SIM-P5-FAULT-TRACE",
        "engine_id": "ENG-P5-FAULT",
        "mission_id": "MSN-P5-FAULT-TRACE",
        "mission_profile": "controlled_fault_injection",
        "fault_class": "Cylinder Overheating",
        "onset_time_sec": 10.0,
        "duration_sec": 35.0,
        "sample_interval_sec": 1.0,
        "severity": 0.82,
        "random_seed": 5002,
        "base_altitude_m": 1500.0,
        "base_ambient_temp_c": 38.0,
        "base_throttle_pct": 80.0,
        "base_load_pct": 82.0,
    }
    r_sim = client.post("/api/simulations", json=sim_cfg)
    assert r_sim.status_code == 200
    sim_data = r_sim.json()

    assert sim_data["summary"]["total_frames"] == 35
    assert sim_data["summary"]["final_predicted_class"] == "Cylinder Overheating"
    assert sim_data["summary"]["alert_count"] > 0
    assert sim_data["summary"]["final_health_index"] < 65.0
    assert sim_data["summary"]["peak_abs_cht_residual_c"] > 25.0
    assert sim_data["latest_state"]["predicted"]["is_anomaly"] is True

    alerts = sim_data["alerts"]
    assert len(alerts) > 0
    first_alert = alerts[0]
    assert first_alert["is_simulated_evidence"] is True
    assert len(first_alert["supporting_evidence"]) >= 1

    r_ack = client.post(
        f"/api/alerts/{first_alert['alert_id']}/acknowledge?acknowledged=true"
    )
    assert r_ack.status_code == 200
    assert r_ack.json()["alert"]["acknowledged"] is True

    # Verify replay synchronization before and after onset
    r_start = client.post(
        "/api/replay/start",
        json={
            "mission_id": "MSN-P5-FAULT-TRACE",
            "playback_speed": 1.0,
            "start_index": 4,
        },
    )
    assert r_start.status_code == 200
    snap_pre = r_start.json()
    assert snap_pre["current_index"] == 4
    assert len(snap_pre["synchronized_alerts"]) == 0

    r_seek = client.post("/api/replay/seek", json={"target_index": 30})
    assert r_seek.status_code == 200
    snap_post = r_seek.json()
    assert snap_post["current_index"] == 30
    assert len(snap_post["synchronized_alerts"]) > 0

    # Verify Sensor Fault RUL gating on seeded ENG-MALE-05
    r_sf_health = client.get("/api/engines/ENG-MALE-05/health")
    assert r_sf_health.status_code == 200
    sf_pred = r_sf_health.json()["latest_predicted"]
    assert sf_pred["predicted_fault_class"] == "Sensor Fault"
    assert sf_pred["rul_status"] == "NOT_ESTIMABLE"
    assert sf_pred["rul_hours"] is None


def test_csv_ingestion_updates_active_engine_mission_end_to_end(
    seeded_service_and_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Verify CSV ingestion persists states and updates the engine active_mission_id."""
    _, client = seeded_service_and_client

    csv_text = (
        "sequence_number,mission_elapsed_sec,timestamp,rpm,cht_c,egt_c,oil_pressure_bar,"
        "oil_temp_c,fuel_flow_lph,vibration_rms_mms,throttle_pct,engine_load_pct,altitude_m,ambient_temp_c\n"
        "0,0.0,2026-10-03T08:00:00Z,5010,178.5,816.0,4.15,99.0,22.2,2.30,74.0,76.0,3000,14.0\n"
        "1,1.0,2026-10-03T08:00:01Z,5020,218.4,845.0,3.95,114.0,22.8,2.95,74.5,76.5,3005,14.0\n"
        "2,2.0,2026-10-03T08:00:02Z,4990,229.0,856.0,3.88,119.5,23.0,3.20,75.0,77.0,3010,14.0"
    )
    r_csv = client.post(
        "/api/telemetry/ingest-csv",
        json={
            "csv_text": csv_text,
            "engine_id": "ENG-CSV-TEST",
            "mission_id": "MSN-CSV-PHASE5",
            "title": "Phase 5 CSV Integration Verification",
        },
    )
    assert r_csv.status_code == 200
    csv_out = r_csv.json()
    assert csv_out["summary"]["total_frames"] == 3
    assert csv_out["engine"]["active_mission_id"] == "MSN-CSV-PHASE5"
    assert csv_out["engine"]["data_source"] == "CSV_REPLAY"

    r_detail = client.get("/api/engines/ENG-CSV-TEST")
    assert r_detail.status_code == 200
    assert r_detail.json()["engine"]["active_mission_id"] == "MSN-CSV-PHASE5"
    assert r_detail.json()["telemetry_count"] == 3

    r_telem = client.get("/api/engines/ENG-CSV-TEST/telemetry")
    assert r_telem.status_code == 200
    assert r_telem.json()["mission_id"] == "MSN-CSV-PHASE5"
    assert len(r_telem.json()["items"]) == 3


def test_phase2_phase3_phase4_reports_and_phase5_deliverables_exist() -> None:
    """Verify raw dataset archives, Phase 2/3/4 artifacts, frontend build, and Phase 5 audit files are intact."""
    ingestor = RealDatasetIngestor()
    hashes = ingestor.verify_raw_archives()
    assert hashes["liu_ice_archive"]["sha256"] == LIU_ICE_EXPECTED_SHA256
    assert hashes["marine_engine_archive"]["sha256"] == MARINE_EXPECTED_SHA256

    required_files = [
        ROOT_DIR / "requirements.txt",
        ROOT_DIR / "data" / "raw" / "liu_ice" / "dxc25liu-ice-main.zip",
        ROOT_DIR / "data" / "raw" / "marine_engine_fault" / "Marine_Engine_Fault_Data_v1.zip",
        ROOT_DIR / "data" / "processed" / "real_data_quality_report.json",
        ROOT_DIR / "backend" / "artifacts" / "real_data_evaluation_report.json",
        ROOT_DIR / "backend" / "artifacts" / "phase3_experiment_report.json",
        ROOT_DIR / "backend" / "artifacts" / "phase4_experiment_report.json",
        ROOT_DIR / "backend" / "artifacts" / "phase5_release_checklist.json",
        ROOT_DIR / "docs" / "PHASE5_RELEASE_AUDIT.md",
        ROOT_DIR / "docs" / "PHASE5_END_TO_END_TEST_REPORT.md",
        ROOT_DIR / "frontend" / "dist" / "index.html",
    ]
    for path in required_files:
        assert path.exists(), f"Required artifact missing: {path}"

    checklist = json.loads(
        (ROOT_DIR / "backend" / "artifacts" / "phase5_release_checklist.json").read_text(
            encoding="utf-8"
        )
    )
    assert checklist["release_decision"]["demo_ready"] is True
    assert checklist["release_decision"]["real_uav_flight_ready"] is False
