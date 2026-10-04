"""Automated tests for ML pipeline, leak-free splits, 9-class RF, IsolationForest, Sensor Isolator, and RUL."""

from __future__ import annotations

from pathlib import Path
from backend.app.ml.pipeline import DrishtiMLPipeline
from backend.app.physics.engine_model import AeroPistonReferenceModel
from backend.app.simulation.fault_simulator import (
    DeterministicFaultSimulator,
    FaultScenarioConfig,
)
from backend.app.telemetry.schema import NINE_FAULT_CLASSES, TelemetryInputFrame
from backend.app.telemetry.validator import TelemetryValidator


def test_ml_pipeline_training_leak_free_and_metrics(tmp_path: Path) -> None:
    pipeline = DrishtiMLPipeline(artifact_dir=tmp_path)
    report = pipeline.train_and_evaluate(base_seed=1000)

    # 1. Verify strict engine-level separation (zero shared engines between train and test)
    manifest = report["dataset_manifest"]
    assert manifest["shared_engines_between_train_and_test"] == 0
    assert manifest["train_trajectories"] == 36
    assert manifest["test_trajectories"] == 18

    # 2. Verify 9-class classification metrics
    cls_metrics = report["classification_metrics"]
    assert cls_metrics["macro_f1"] > 0.72
    assert len(cls_metrics["confusion_matrix"]) == 9
    assert len(cls_metrics["confusion_matrix"][0]) == 9
    for c_name in NINE_FAULT_CLASSES:
        assert c_name in cls_metrics["per_class"]
        assert cls_metrics["per_class"][c_name]["support"] > 0

    # 3. Verify anomaly detection metrics
    anom_metrics = report["anomaly_detection_metrics"]
    assert anom_metrics["recall"] > 0.75
    assert 0.0 <= anom_metrics["false_alarm_rate"] <= 0.25
    assert len(anom_metrics["pr_curve"]) >= 5

    # 4. Verify RUL metrics and units
    rul_metrics = report["rul_estimation_metrics"]
    assert rul_metrics["target_unit"] == "hours"
    assert rul_metrics["held_out_mae_hours"] < 15.0
    assert rul_metrics["held_out_rmse_hours"] < 20.0

    # 5. Verify sensor-fault isolation and RUL NOT_ESTIMABLE gating on sensor fault
    sim = DeterministicFaultSimulator()
    validator = TelemetryValidator()
    ref_model = AeroPistonReferenceModel()

    sf_cfg = FaultScenarioConfig(
        scenario_id="TEST-SF-DRIFT",
        engine_id="ENG-SF-TEST",
        mission_id="MSN-SF-TEST",
        fault_class="Sensor Fault",
        sensor_fault_submode="drift",
        sensor_fault_channel="cht_c",
        onset_time_sec=2.0,
        duration_sec=12.0,
        severity=0.85,
        random_seed=555,
    )
    sf_frames = sim.generate_scenario(sf_cfg)
    last_pred = None
    for f in sf_frames:
        vf = validator.validate_frame(f)
        exp = ref_model.estimate_expected(vf)
        calc = ref_model.calculate_residuals_and_trends(vf, exp)
        last_pred = pipeline.predict_point(vf, exp, calc)

    assert last_pred is not None
    assert last_pred.predicted_fault_class == "Sensor Fault"
    assert last_pred.sensor_diagnosis.is_sensor_fault_detected is True
    assert last_pred.rul_status == "NOT_ESTIMABLE"
    assert last_pred.rul_hours is None


def test_unavailable_model_artifact_fallback(tmp_path: Path) -> None:
    empty_pipeline = DrishtiMLPipeline(artifact_dir=tmp_path / "empty")
    # Do NOT call load_or_train -> simulate missing artifact
    validator = TelemetryValidator()
    ref = AeroPistonReferenceModel()
    f = TelemetryInputFrame(
        engine_id="ENG-UNAVAIL",
        mission_id="MSN-UNAVAIL",
        timestamp="2026-10-03T06:00:00Z",
        sequence_number=0,
        mission_elapsed_sec=0.0,
        rpm=5000.0,
        cht_c=178.0,
        egt_c=815.0,
        oil_pressure_bar=4.2,
        oil_temp_c=99.0,
        fuel_flow_lph=22.0,
        vibration_rms_mms=2.3,
        throttle_pct=74.0,
        engine_load_pct=76.0,
        altitude_m=3000.0,
        ambient_temp_c=15.0,
    )
    vf = validator.validate_frame(f)
    exp = ref.estimate_expected(vf)
    calc = ref.calculate_residuals_and_trends(vf, exp)
    pred = empty_pipeline.predict_point(vf, exp, calc)

    assert pred.model_version == "UNAVAILABLE_MODEL_ARTIFACT"
    assert pred.is_valid is False
    assert pred.rul_status == "NOT_ESTIMABLE"
    assert pred.diagnosis_certainty_status == "UNCERTAIN_INSUFFICIENT_EVIDENCE"
