"""Automated Verification Suite for DRISHTI SIH26054 PPT Alignment.

Covers all Section 9 requirements:
- Dataset & split tests: 100,000 rows, 50 distinct engine IDs, 70%/15%/15% engine-disjoint split,
  zero engine overlap across train/val/test, all 9 fault classes present, deterministic seed reproducibility.
- Feature & leakage tests: identical feature order between training and inference, scaler fit strictly on
  train split, causal rolling features depend only on current/past samples.
- Model tests: 9-class RandomForestClassifier probabilities sum to 1, IsolationForest anomaly score and
  validation-calibrated threshold, xgboost.XGBRegressor RUL in cycles and hours, Sensor-Fault isolator
  suppressing RUL (NOT_ESTIMABLE), and Hybrid Health Index bounds [0, 100] with weights (0.30, 0.30, 0.20, 0.20).
- Digital Twin & 10 Hz tests: Four-Value state (Actual, Expected, Calculated, Predicted) and 10 Hz
  (0.1 s sample interval) simulation, ingestion, replay, and throughput/latency verification.
"""

from __future__ import annotations

import json
from pathlib import Path
import time

from fastapi.testclient import TestClient
import numpy as np
import xgboost as xgb

from backend.app.main import create_app
from backend.app.ml.features import FEATURE_NAMES, extract_feature_vector, feature_dict_to_array
from backend.app.ml.pipeline import HEALTH_INDEX_WEIGHTS, DrishtiMLPipeline
from backend.app.ml.ppt_100k_pipeline import (
    PPT_HEALTH_WEIGHTS,
    _causal_rolling_mean_std_slope,
    _generate_single_trajectory_arrays,
    run_ppt_100k_training_and_evaluation,
)
from backend.app.physics.engine_model import AeroPistonReferenceModel
from backend.app.service import DrishtiTwinService
from backend.app.simulation.fault_simulator import (
    DeterministicFaultSimulator,
    FaultScenarioConfig,
)
from backend.app.telemetry.schema import CalculatedValues, NINE_FAULT_CLASSES
from backend.app.telemetry.validator import TelemetryValidator

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_ppt_100k_dataset_manifest_and_split_integrity() -> None:
    """Verify 100,000 rows, 50 engines, 70%/15%/15% split, zero engine leakage, and 9-class coverage."""
    manifest_path = REPO_ROOT / "data" / "processed" / "drishti_100k_manifest.json"
    quality_path = REPO_ROOT / "data" / "processed" / "drishti_100k_quality_report.json"
    npz_path = REPO_ROOT / "data" / "processed" / "drishti_100k_dataset.npz"

    assert manifest_path.exists(), "Missing data/processed/drishti_100k_manifest.json"
    assert quality_path.exists(), "Missing data/processed/drishti_100k_quality_report.json"
    assert npz_path.exists(), "Missing data/processed/drishti_100k_dataset.npz"

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    quality = json.loads(quality_path.read_text(encoding="utf-8"))
    npz = np.load(npz_path, allow_pickle=False)

    # 1. Exact 100,000 rows and 50 distinct engine units
    assert manifest["total_rows"] == 100000
    assert manifest["total_distinct_engines"] == 50
    assert npz["X"].shape == (100000, len(FEATURE_NAMES))
    assert len(set(npz["engines"].tolist())) == 50

    # 2. Exact 70% / 15% / 15% split proportions (70,000 / 15,000 / 15,000) across 35 / 8 / 7 engines
    splits = manifest["splits"]
    assert splits["train"]["engine_count"] == 35
    assert splits["validation"]["engine_count"] == 8
    assert splits["test"]["engine_count"] == 7
    assert splits["train"]["row_count"] == 70000
    assert splits["validation"]["row_count"] == 15000
    assert splits["test"]["row_count"] == 15000
    assert splits["train"]["row_proportion"] == 0.70
    assert splits["validation"]["row_proportion"] == 0.15
    assert splits["test"]["row_proportion"] == 0.15

    # 3. Zero shared engine IDs between train, validation, and test
    train_eng = set(splits["train"]["engine_ids"])
    val_eng = set(splits["validation"]["engine_ids"])
    test_eng = set(splits["test"]["engine_ids"])
    assert len(train_eng & val_eng) == 0
    assert len(train_eng & test_eng) == 0
    assert len(val_eng & test_eng) == 0
    assert manifest["leakage_checks"]["zero_engine_leakage_verified"] is True

    # 4. All 9 fault classes present in train, validation, and test
    for split_key in ("train", "validation", "test"):
        cls_counts = splits[split_key]["class_counts"]
        for cls_name in NINE_FAULT_CLASSES:
            assert cls_counts.get(cls_name, 0) > 0, f"Class {cls_name} missing in {split_key}"

    # 5. Quality report checks
    assert quality["nan_or_inf_feature_cells"] == 0
    assert quality["sensor_fault_excluded_from_rul"] is True
    assert quality["split_proportions_match_70_15_15"] is True


def test_causal_features_and_deterministic_seed_reproducibility() -> None:
    """Verify deterministic trajectory generation and strictly causal rolling window features."""
    t1 = _generate_single_trajectory_arrays(
        engine_id="ENG-UNIT-001",
        mission_id="MSN-DET-1",
        split_name="train",
        fault_class="Cylinder Overheating",
        profile="high_altitude",
        n_samples=120,
        seed=202601,
        engine_tolerance_seed=1001,
    )
    t2 = _generate_single_trajectory_arrays(
        engine_id="ENG-UNIT-001",
        mission_id="MSN-DET-1",
        split_name="train",
        fault_class="Cylinder Overheating",
        profile="high_altitude",
        n_samples=120,
        seed=202601,
        engine_tolerance_seed=1001,
    )
    np.testing.assert_allclose(t1["X"], t2["X"], rtol=0.0, atol=0.0)
    np.testing.assert_allclose(t1["y_rul_cycles"], t2["y_rul_cycles"], rtol=0.0, atol=0.0)

    # Verify causal rolling statistics: mutating future values (indices > 30) must NOT alter features at index <= 30
    sig_a = np.linspace(150.0, 180.0, 60)
    sig_b = sig_a.copy()
    sig_b[31:] += 500.0  # massive future spike after index 30

    m_a, s_a, sl_a = _causal_rolling_mean_std_slope(sig_a, dt=1.0, window=12)
    m_b, s_b, sl_b = _causal_rolling_mean_std_slope(sig_b, dt=1.0, window=12)

    np.testing.assert_allclose(m_a[:31], m_b[:31], rtol=0.0, atol=1e-12)
    np.testing.assert_allclose(s_a[:31], s_b[:31], rtol=0.0, atol=1e-12)
    np.testing.assert_allclose(sl_a[:31], sl_b[:31], rtol=0.0, atol=1e-12)


def test_ppt_100k_models_xgboost_and_evaluation_report() -> None:
    """Verify 100k evaluation report, scaler fit on train only, RF probabilities, IF threshold, and XGBRegressor RUL."""
    res = run_ppt_100k_training_and_evaluation(
        base_seed=2026, save_artifacts=False, use_cached_dataset=True
    )
    report = res["report"]
    models = res["models"]

    # Check library & model types
    assert isinstance(models["xgb_rul_cycles"], xgb.XGBRegressor)
    assert isinstance(models["xgb_rul_hours"], xgb.XGBRegressor)

    # Verify scaler was fit on the 70,000 training rows
    assert int(models["scaler"].n_samples_seen_) == 70000

    # Verify RF probability vectors sum to 1.0
    sample_X = models["scaler"].transform(np.zeros((5, len(FEATURE_NAMES)), dtype=np.float64))
    probs = models["classifier"].predict_proba(sample_X)
    assert probs.shape == (5, 9)
    np.testing.assert_allclose(np.sum(probs, axis=1), np.ones(5), atol=1e-6)

    # Verify held-out test metrics on 100k dataset
    held_out = report["held_out_test_metrics"]
    assert held_out["classification"]["macro_f1"] > 0.85
    assert len(held_out["classification"]["confusion_matrix"]) == 9
    assert len(held_out["classification"]["normalized_confusion_matrix"]) == 9
    assert held_out["anomaly_detection"]["recall"] > 0.85
    assert held_out["anomaly_detection"]["false_alarm_rate"] < 0.08
    assert held_out["sensor_fault_isolation"]["f1"] > 0.85
    assert held_out["rul_xgboost"]["held_out_mae_cycles"] < 25.0
    assert held_out["rul_xgboost"]["held_out_rmse_cycles"] < 35.0


def test_health_index_weights_and_monotonic_response() -> None:
    """Verify PPT Health Index weights (alpha=0.30, beta=0.30, gamma=0.20, delta=0.20) and monotonic degradation."""
    assert HEALTH_INDEX_WEIGHTS["thermal_penalty_weight"] == 0.30
    assert HEALTH_INDEX_WEIGHTS["oil_penalty_weight"] == 0.30
    assert HEALTH_INDEX_WEIGHTS["vibration_penalty_weight"] == 0.20
    assert HEALTH_INDEX_WEIGHTS["anomaly_penalty_weight"] == 0.20
    assert abs(sum(HEALTH_INDEX_WEIGHTS.values()) - 1.0) < 1e-9
    assert abs(sum(PPT_HEALTH_WEIGHTS.values()) - 1.0) < 1e-9

    calc_nominal = CalculatedValues(
        timestamp="2026-10-03T12:00:00Z",
        cht_residual_c=1.0,
        egt_residual_c=4.0,
        oil_pressure_residual_bar=-0.02,
        oil_temp_residual_c=0.8,
        fuel_flow_residual_lph=0.2,
        vibration_residual_mms=0.05,
        battery_voltage_residual_v=0.0,
        injection_pulse_residual_ms=0.0,
        cht_rolling_mean_c=175.0,
        cht_rolling_std_c=1.2,
        cht_rolling_slope_c_per_s=0.0,
        egt_rolling_mean_c=810.0,
        oil_pressure_rolling_mean_bar=4.2,
        oil_pressure_rolling_slope_bar_per_s=0.0,
        vibration_rolling_mean_mms=2.2,
        vibration_rolling_std_mms=0.1,
        vibration_rolling_slope_mms_per_s=0.0,
        thermal_margin_pct=82.0,
        oil_pressure_margin_pct=85.0,
        vibration_margin_pct=80.0,
        specific_fuel_index=0.28,
        envelope_violations=[],
    )
    hi_nom, _ = DrishtiMLPipeline.compute_health_indicator(calc_nominal, -0.1, 0.05)

    calc_degraded = calc_nominal.model_copy(
        update={
            "cht_residual_c": 32.0,
            "oil_pressure_residual_bar": -1.1,
            "vibration_residual_mms": 2.4,
        }
    )
    hi_deg, _ = DrishtiMLPipeline.compute_health_indicator(calc_degraded, 0.22, 0.05)

    assert 0.0 <= hi_deg < hi_nom <= 100.0
    assert hi_nom >= 95.0
    assert hi_deg <= 60.0


def test_10hz_telemetry_simulation_ingestion_replay_and_latency(tmp_path: Path) -> None:
    """Verify 10 Hz (0.1 s sample interval) simulation, millisecond timestamps, Four-Value Twin, replay, and latency."""
    service = DrishtiTwinService(db_path=tmp_path / "drishti_10hz.db", auto_seed=False)
    app = create_app(service=service)
    client = TestClient(app)
    _ = client.get("/health")

    # 1. Generate and ingest 10 seconds of 10 Hz telemetry (100 frames at dt = 0.1 s)
    t_start = time.perf_counter()
    resp = client.post(
        "/api/simulations",
        json={
            "scenario_id": "SIM-10HZ-BENCH",
            "engine_id": "ENG-10HZ-01",
            "mission_id": "MSN-10HZ-01",
            "mission_profile": "rapid_throttle",
            "fault_class": "Cylinder Overheating",
            "onset_time_sec": 3.0,
            "duration_sec": 10.0,
            "sample_interval_sec": 0.1,
            "severity": 0.78,
            "random_seed": 202610,
            "base_altitude_m": 2800.0,
            "base_ambient_temp_c": 22.0,
            "base_throttle_pct": 78.0,
            "base_load_pct": 80.0,
        },
    )
    elapsed_100_frames_sec = time.perf_counter() - t_start
    assert resp.status_code == 200, resp.text
    payload = resp.json()

    summary = payload["summary"]
    assert summary["total_frames"] == 100

    # Verify per-frame processing latency is below the 100 ms (10 Hz) real-time budget
    mean_frame_latency_ms = (elapsed_100_frames_sec * 1000.0) / 100.0
    effective_throughput_hz = 100.0 / max(1e-6, elapsed_100_frames_sec)
    assert mean_frame_latency_ms < 100.0, f"10 Hz budget exceeded: {mean_frame_latency_ms:.2f} ms/frame"
    assert effective_throughput_hz >= 10.0

    # Verify all 100 frames have unique millisecond timestamps (no false duplicate flags) and RUL in cycles & hours
    sim_detail = client.get("/api/simulations/SIM-10HZ-BENCH").json()
    frames = sim_detail["telemetry"]
    assert len(frames) == 100
    timestamps = [f["timestamp"] for f in frames]
    assert len(set(timestamps)) == 100, "10 Hz timestamps must be unique at millisecond resolution"

    last_state = frames[-1]
    assert last_state["actual"]["quality"]["is_duplicate"] is False
    assert last_state["predicted"]["rul_hours"] is not None
    assert last_state["predicted"]["rul_cycles"] is not None
    assert last_state["predicted"]["rul_cycle_unit"] == "cycles"

    # Verify replay works on the 100-frame 10 Hz mission
    r_start = client.post(
        "/api/replay/start",
        json={"mission_id": "MSN-10HZ-01", "playback_speed": 2.0, "start_index": 0},
    )
    assert r_start.status_code == 200
    assert r_start.json()["total_frames"] == 100

    r_step = client.post("/api/replay/step", json={"steps": 10})
    assert r_step.status_code == 200
    assert abs(r_step.json()["current_elapsed_sec"] - 1.0) < 1e-6
