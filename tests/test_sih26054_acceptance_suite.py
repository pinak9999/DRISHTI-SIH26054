"""SIH26054 Master Acceptance Test Suite — Verifies Sections A through N of the DRDO Problem Statement."""

from __future__ import annotations

from pathlib import Path
import sys
from typing import Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
import pytest

from backend.app.main import create_app
from backend.app.service import DrishtiTwinService


@pytest.fixture(scope="module")
def acceptance_client(
    tmp_path_factory: pytest.TempPathFactory,
) -> Tuple[DrishtiTwinService, TestClient]:
    db_dir = tmp_path_factory.mktemp("sih26054_acceptance_db")
    svc = DrishtiTwinService(
        db_path=db_dir / "acceptance.db",
        artifact_dir=None,
        auto_seed=True,
    )
    app = create_app(service=svc)
    return svc, TestClient(app)


def test_01_02_startup_health_and_readiness_probes(
    acceptance_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Criteria 1 & 2: Application startup, /health, and /ready probes."""
    _, client = acceptance_client
    r_health = client.get("/health")
    assert r_health.status_code == 200
    h = r_health.json()
    assert h["status"] == "ok"
    assert h["problem_statement"] == "SIH26054"
    assert h["ml_models_loaded"] is True

    r_ready = client.get("/ready")
    assert r_ready.status_code == 200
    rd = r_ready.json()
    assert rd["status"] == "ready"
    assert rd["database_ready"] is True
    assert rd["ml_bundle_ready"] is True
    assert rd["physics_model_ready"] is True
    assert rd["seeded_engine_count"] == 6
    assert rd["simulation_mode"] is True


def test_06_all_eight_parameter_groups_monitored(
    acceptance_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Criterion 6: Verify end-to-end monitoring for all 8 required SIH26054 parameter groups."""
    _, client = acceptance_client
    r_cat = client.get("/api/catalog")
    assert r_cat.status_code == 200
    cat = r_cat.json()
    spec_groups = cat["sih26054_eight_parameter_groups"]
    assert len(spec_groups) == 8

    r_pg = client.get("/api/engines/ENG-MALE-01/parameter-groups")
    assert r_pg.status_code == 200
    pg = r_pg.json()
    assert pg["engine_id"] == "ENG-MALE-01"
    groups = pg["groups"]
    assert len(groups) == 8
    expected_ids = [1, 2, 3, 4, 5, 6, 7, 8]
    assert [g["group_id"] for g in groups] == expected_ids
    for g in groups:
        assert "current_value" in g and len(g["current_value"]) > 0
        assert "expected_value" in g and len(g["expected_value"]) > 0
        assert "operating_range" in g
        assert "historical_stats" in g
        assert "quality_freshness" in g
        assert "health_contribution" in g
        assert g["severity"] in ("NOMINAL", "WARNING", "CRITICAL")


def test_07_all_eight_fault_categories_and_cooling_degradation_mapping(
    acceptance_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Criterion 7: Verify all 8 intended SIH26054 fault categories and 'Coding -> Cooling degradation' interpretation."""
    _, client = acceptance_client
    r_cat = client.get("/api/catalog")
    assert r_cat.status_code == 200
    fault_cats = r_cat.json()["sih26054_eight_fault_categories"]
    assert len(fault_cats) == 8

    cat_names = [fc["sih_problem_statement_category"] for fc in fault_cats]
    assert any("Misfire" in n for n in cat_names)
    assert any("Injector" in n for n in cat_names)
    assert any("Cooling degradation" in n and "Coding degradation" in n for n in cat_names)
    assert any("Lubrication" in n for n in cat_names)
    assert any("Sensor drift" in n for n in cat_names)
    assert any("Combustion instability" in n for n in cat_names)
    assert any("Overheating" in n for n in cat_names)
    assert any("Abnormal vibration" in n for n in cat_names)

    for fc in fault_cats:
        assert len(fc["mapped_ml_fault_classes"]) >= 1
        assert len(fc["primary_sensor_evidence"]) >= 1
        assert len(fc["causal_rationale"]) > 20
        assert len(fc["limitation_disclosure"]) > 15


def test_09_configurable_health_index_weights_and_readiness_thresholds(
    acceptance_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Criterion 9: Verify configurable Health Index weights, SQLite persistence, and 422 validation."""
    svc, client = acceptance_client
    r_get = client.get("/api/config/health-policy")
    assert r_get.status_code == 200
    initial_policy = r_get.json()
    assert initial_policy["weights"]["thermal_penalty_weight"] == 0.30

    # Update weights & thresholds dynamically
    r_put = client.put(
        "/api/config/health-policy",
        json={
            "weights": {
                "thermal_penalty_weight": 0.40,
                "oil_penalty_weight": 0.25,
                "vibration_penalty_weight": 0.20,
                "anomaly_penalty_weight": 0.15,
            },
            "readiness_thresholds": {
                "go_min_health_index": 78.0,
                "precaution_min_health_index": 58.0,
            },
        },
    )
    assert r_put.status_code == 200
    updated = r_put.json()["health_policy"]
    assert updated["weights"]["thermal_penalty_weight"] == 0.40
    assert updated["readiness_thresholds"]["go_min_health_index"] == 78.0

    # Verify SQLite persistence across a newly instantiated DrishtiTwinService on the same db_path
    reloaded_svc = DrishtiTwinService(
        db_path=svc.db.db_path,
        artifact_dir=svc.ml_pipeline.artifact_dir,
        auto_seed=False,
    )
    reloaded_policy = reloaded_svc.get_health_policy()
    assert reloaded_policy["weights"]["thermal_penalty_weight"] == 0.40
    assert reloaded_policy["readiness_thresholds"]["go_min_health_index"] == 78.0

    # Verify HTTP 422 validation on negative weights and inverted readiness thresholds
    r_neg = client.put(
        "/api/config/health-policy",
        json={"weights": {"thermal_penalty_weight": -0.20}},
    )
    assert r_neg.status_code == 422

    r_inv_thresh = client.put(
        "/api/config/health-policy",
        json={
            "readiness_thresholds": {
                "go_min_health_index": 50.0,
                "precaution_min_health_index": 70.0,
            }
        },
    )
    assert r_inv_thresh.status_code == 422

    # Reset back to SIH26054 defaults (0.30, 0.30, 0.20, 0.20)
    r_reset = client.put(
        "/api/config/health-policy",
        json={
            "weights": {
                "thermal_penalty_weight": 0.30,
                "oil_penalty_weight": 0.30,
                "vibration_penalty_weight": 0.20,
                "anomaly_penalty_weight": 0.20,
            },
            "readiness_thresholds": {
                "go_min_health_index": 75.0,
                "precaution_min_health_index": 55.0,
                "go_min_rul_hours": 15.0,
                "precaution_min_rul_hours": 5.0,
            },
        },
    )
    assert r_reset.status_code == 200
    assert r_reset.json()["health_policy"]["weights"]["thermal_penalty_weight"] == 0.30


def test_11_14_18_environmental_profiles_maintenance_and_report_export(
    acceptance_client: Tuple[DrishtiTwinService, TestClient],
) -> None:
    """Criteria 11, 14, 18: Verify environmental mission profiles, maintenance recommendations, and exported reports."""
    _, client = acceptance_client
    for profile, fault_cls in [
        ("high_altitude", "Fuel Injector Clogging"),
        ("hot_weather", "Cylinder Overheating"),
        ("rapid_throttle", "Valve Clearance Issue"),
    ]:
        r_sim = client.post(
            "/api/simulations",
            json={
                "scenario_id": f"SIM-ACC-{profile.upper()}",
                "engine_id": "ENG-MALE-01",
                "mission_id": f"MSN-ACC-{profile.upper()}",
                "mission_profile": profile,
                "fault_class": fault_cls,
                "onset_time_sec": 10.0,
                "duration_sec": 35.0,
                "sample_interval_sec": 1.0,
                "severity": 0.78,
                "random_seed": 2026,
                "base_altitude_m": 5500.0 if profile == "high_altitude" else 2500.0,
                "base_ambient_temp_c": 42.0 if profile == "hot_weather" else 15.0,
                "base_throttle_pct": 78.0,
                "base_load_pct": 80.0,
            },
        )
        assert r_sim.status_code == 200
        sim_out = r_sim.json()
        assert sim_out["summary"]["total_frames"] == 35
        rep_id = sim_out["report_id"]
        r_rep = client.get(f"/api/reports/{rep_id}")
        assert r_rep.status_code == 200
        rep = r_rep.json()
        assert rep["scenario_configuration"]["mission_profile"] == profile
        assert len(rep["engineering_disclosures"]) >= 2
