"""End-to-End API, WebSocket, Replay Synchronization, and 11-Step Demo Verification Tests."""

from __future__ import annotations

from pathlib import Path
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.service import DrishtiTwinService


def test_full_end_to_end_11_step_workflow_and_api(tmp_path: Path) -> None:
    # Step 1: Initialize service and FastAPI app locally with isolated SQLite DB and preserved ML artifact
    svc = DrishtiTwinService(
        db_path=tmp_path / "test_drishti.db",
        artifact_dir=None,
        auto_seed=True,
    )
    app = create_app(service=svc)
    client = TestClient(app)

    # Check /health and /api/model-status
    r_health = client.get("/health")
    assert r_health.status_code == 200
    assert r_health.json()["ml_models_loaded"] is True

    r_status = client.get("/api/model-status")
    assert r_status.status_code == 200
    assert "evaluation_report" in r_status.json()

    # Step 2: Load seeded simulated fleet
    r_fleet = client.get("/api/fleet")
    assert r_fleet.status_code == 200
    fleet_data = r_fleet.json()
    assert fleet_data["fleet_size"] == 6
    assert len(fleet_data["engines"]) == 6

    # Step 3: Open one engine (ENG-MALE-01) and display incoming telemetry
    r_eng = client.get("/api/engines/ENG-MALE-01")
    assert r_eng.status_code == 200
    eng_detail = r_eng.json()
    assert eng_detail["engine"]["engine_id"] == "ENG-MALE-01"

    r_telem = client.get("/api/engines/ENG-MALE-01/telemetry?limit=50")
    assert r_telem.status_code == 200
    telem_items = r_telem.json()["items"]
    assert len(telem_items) == 50

    # Step 4 & Step 5: Verify ACTUAL, EXPECTED, and CALCULATED residuals together
    sample_point = telem_items[-1]
    assert "actual" in sample_point
    assert "expected" in sample_point
    assert "calculated" in sample_point
    assert "predicted" in sample_point
    expected_cht_res = round(
        sample_point["actual"]["cht_c"] - sample_point["expected"]["cht_c"], 2
    )
    assert abs(sample_point["calculated"]["cht_residual_c"] - expected_cht_res) < 0.05

    # Step 6: Start a deterministic fault scenario (Cylinder Overheating on ENG-MALE-01)
    sim_payload = {
        "scenario_id": "SIM-E2E-OVERHEAT",
        "engine_id": "ENG-MALE-01",
        "mission_id": "MSN-E2E-OVERHEAT",
        "mission_profile": "hot_weather",
        "fault_class": "Cylinder Overheating",
        "onset_time_sec": 10.0,
        "duration_sec": 45.0,
        "sample_interval_sec": 1.0,
        "severity": 0.85,
        "random_seed": 2026,
        "base_altitude_m": 1500.0,
        "base_ambient_temp_c": 40.0,
        "base_throttle_pct": 80.0,
        "base_load_pct": 82.0,
    }
    r_sim1 = client.post("/api/simulations", json=sim_payload)
    assert r_sim1.status_code == 200
    sim_out1 = r_sim1.json()

    # Verify deterministic reproducibility with identical seed
    r_sim2 = client.post("/api/simulations", json=sim_payload)
    assert r_sim2.status_code == 200
    sim_out2 = r_sim2.json()
    assert (
        sim_out1["latest_state"]["actual"]["cht_c"]
        == sim_out2["latest_state"]["actual"]["cht_c"]
    )
    assert (
        sim_out1["summary"]["final_health_index"]
        == sim_out2["summary"]["final_health_index"]
    )

    # Step 7: Show anomaly detector and fault classifier outputs
    latest_pred = sim_out1["latest_state"]["predicted"]
    assert latest_pred["is_anomaly"] is True
    assert latest_pred["predicted_fault_class"] == "Cylinder Overheating"
    assert latest_pred["top_probability"] > 0.50

    # Step 8: Show the evidence behind the alert
    assert len(sim_out1["alerts"]) > 0
    top_alert = sim_out1["alerts"][-1]
    assert top_alert["fault_class"] == "Cylinder Overheating"
    assert top_alert["is_simulated_evidence"] is True
    assert len(top_alert["supporting_evidence"]) >= 1
    assert "cht_residual_c" in top_alert["actual_vs_expected_deviations"]
    assert "ADVISORY:" in top_alert["recommended_action"]

    # Verify alert acknowledgment endpoint
    r_ack = client.post(f"/api/alerts/{top_alert['alert_id']}/acknowledge?acknowledged=true")
    assert r_ack.status_code == 200
    assert r_ack.json()["alert"]["acknowledged"] is True

    # Step 9: Display RUL when valid inputs and trained artifact are present
    assert latest_pred["rul_status"] == "ESTIMATED"
    assert latest_pred["rul_hours"] is not None
    assert latest_pred["rul_hours"] > 0.0
    assert latest_pred["rul_unit"] == "hours"

    r_health_ep = client.get("/api/engines/ENG-MALE-01/health")
    assert r_health_ep.status_code == 200
    assert len(r_health_ep.json()["degradation_trajectory"]) == 45

    # Step 10: Replay the same mission and reproduce its alert timeline
    r_rep_start = client.post(
        "/api/replay/start",
        json={"mission_id": "MSN-E2E-OVERHEAT", "playback_speed": 2.0, "start_index": 5},
    )
    assert r_rep_start.status_code == 200
    snap_early = r_rep_start.json()
    assert snap_early["current_index"] == 5
    assert snap_early["current_state"]["sequence_number"] == 5
    # At index 5 (5s < onset 10s), no fault alerts yet
    assert len(snap_early["synchronized_alerts"]) == 0

    # Seek to index 40 (post-onset) -> alerts and telemetry match index 40
    r_rep_seek = client.post("/api/replay/seek", json={"target_index": 40})
    assert r_rep_seek.status_code == 200
    snap_late = r_rep_seek.json()
    assert snap_late["current_index"] == 40
    assert snap_late["current_state"]["sequence_number"] == 40
    assert len(snap_late["synchronized_History" if "synchronized_History" in snap_late else "synchronized_history"]) == 41
    assert len(snap_late["synchronized_alerts"]) > 0

    r_rep_stop = client.post("/api/replay/stop")
    assert r_rep_stop.status_code == 200
    assert r_rep_stop.json()["is_playing"] is False

    # Step 11: Export an engineering report with scenario details and measured results
    report_id = sim_out1["report_id"]
    r_rep = client.get(f"/api/reports/{report_id}")
    assert r_rep.status_code == 200
    rep_json = r_rep.json()
    assert rep_json["report_id"] == report_id
    assert rep_json["scenario_configuration"]["fault_class"] == "Cylinder Overheating"
    assert "measured_results" in rep_json
    assert "latest_four_value_snapshot" in rep_json

    # Test WebSocket streaming endpoint
    with client.websocket_connect("/ws/telemetry?engine_id=ENG-MALE-01") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "telemetry_frame"
        assert msg["engine_id"] == "ENG-MALE-01"
        assert "twin_state" in msg

    # Test 404 error handling
    r_404 = client.get("/api/engines/NON-EXISTENT-ENGINE")
    assert r_404.status_code == 404
