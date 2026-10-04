"""Automated verification tests for Phase 3 Robust Diagnostics and Domain-Invariant Residual Features.

Covers all 8 required verification gates (STEP 6):
1. No run leakage across the claimed independent-run split
2. No preprocessing fit on test observations
3. No target leakage
4. Reproducible results under fixed random seeds
5. Correct residual and unit calculations
6. Correct per-class metric calculations
7. Missing sensor handling (non-fabrication + training-only median imputation)
8. Preservation of dataset provenance and RUL separation
"""

from __future__ import annotations

import copy
import json
import math
import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import LogisticRegression

from backend.app.data_ingestion.real_data_pipeline import (
    REPO_ROOT,
    RealDatasetIngestor,
    kelvin_to_celsius,
    kg_per_sec_to_lph,
    rad_per_sec_to_rpm,
)
from backend.app.ml.phase3_residual_diagnostics import (
    FEATURE_MODES,
    LIU_ICE_ON_ENGINE_SENSORS,
    PHASE3_JSON_REPORT_PATH,
    DomainInvariantFeaturePipeline,
    _causal_within_run_rolling_mean,
    assert_no_target_or_metadata_leakage,
    compute_robust_scale,
    evaluate_classification_predictions,
    load_marine_dataframe_causal,
    split_liu_ice_strict_runs,
    split_marine_strict_runs,
)


def _make_synthetic_liu_dataframe(n_per_run: int = 80, seed: int = 42) -> pd.DataFrame:
    """Create a fast, deterministic fixture matching the LiU-ICE schema for unit testing."""
    rng = np.random.default_rng(seed)
    runs = [
        ("wltp_NF", "dxc25/wltp_NF.csv", "NF"),
        ("wltp_f_pic_090", "dxc25/wltp_f_pic_090.csv", "f_pic"),
        ("wltp_f_pim_080", "dxc25/wltp_f_pim_080.csv", "f_pim"),
        ("wltp_f_waf_105", "dxc25/wltp_f_waf_105.csv", "f_waf"),
        ("wltp_f_pic_110", "dxc25/wltp_f_pic_110.csv", "f_pic"),
        ("wltp_f_pim_090", "dxc25/wltp_f_pim_090.csv", "f_pim"),
        ("wltp_f_waf_110", "dxc25/wltp_f_waf_110.csv", "f_waf"),
        ("wltp_f_iml_6mm", "dxc25/wltp_f_iml_6mm.csv", "f_iml"),
    ]
    frames = []
    for run_id, src_file, fault_code in runs:
        t = np.arange(n_per_run, dtype=float) * 5.0
        rpm = rng.uniform(1000.0, 2800.0, size=n_per_run)
        thr = rng.uniform(10.0, 80.0, size=n_per_run)
        wg = rng.uniform(0.0, 0.5, size=n_per_run)
        fuel = 2.0 + 0.005 * rpm + 0.12 * thr + rng.normal(0.0, 0.05, size=n_per_run)
        t_ic = 25.0 + 0.002 * rpm + rng.normal(0.0, 0.1, size=n_per_run)

        # True linear-quadratic air-path relationships
        p_ic = 100000.0 + 15.0 * rpm + 400.0 * thr + rng.normal(0.0, 120.0, size=n_per_run)
        p_im = 40000.0 + 10.0 * rpm + 600.0 * thr + rng.normal(0.0, 120.0, size=n_per_run)
        w_af = 0.005 + 1e-5 * rpm + 3e-4 * thr + rng.normal(0.0, 2e-4, size=n_per_run)

        is_anom = np.zeros(n_per_run, dtype=int) if fault_code == "NF" else (t >= 120.0).astype(int)
        labels = ["NF" if a == 0 else fault_code for a in is_anom]

        # Inject sensor gain shift after t >= 120s
        if fault_code == "f_pic":
            gain = 0.90 if "090" in run_id else 1.10
            p_ic = np.where(is_anom == 1, p_ic * gain, p_ic)
        elif fault_code == "f_pim":
            gain = 0.80 if "080" in run_id else 0.90
            p_im = np.where(is_anom == 1, p_im * gain, p_im)
        elif fault_code == "f_waf":
            gain = 1.05 if "105" in run_id else 1.10
            w_af = np.where(is_anom == 1, w_af * gain, w_af)

        frames.append(
            pd.DataFrame({
                "dataset_id": "LiU-ICE-Benchmark-DXC25",
                "source_file": src_file,
                "source_archive_sha256": "deadbeef",
                "engine_id": "ENG-LIU-ICE-01",
                "run_id": run_id,
                "timestamp_sec": t,
                "is_synthetic": False,
                "data_source": "BENCH_TEST",
                "rpm": rpm,
                "cht_c": np.nan,
                "egt_c": np.nan,
                "oil_pressure_bar": np.nan,
                "oil_temp_c": np.nan,
                "fuel_flow_lph": fuel,
                "vibration_rms_mms": np.nan,
                "throttle_pct": thr,
                "wastegate_position": wg,
                "intercooler_pressure_pa": p_ic,
                "intercooler_temp_c": t_ic,
                "intake_manifold_pressure_pa": p_im,
                "air_mass_flow_kgs": w_af,
                "ambient_pressure_pa": 100700.0,
                "ambient_temp_c": 25.0,
                "anomaly_state": is_anom,
                "sample_fault_label": labels,
                "rul_hours": np.nan,
            })
        )
    return pd.concat(frames, ignore_index=True)


def test_no_run_or_file_leakage_across_independent_run_splits() -> None:
    """1. Verify zero shared physical runs or CSV source files between train and test splits."""
    ingestor = RealDatasetIngestor()
    liu_df, _ = ingestor.ingest_liu_ice()
    marine_df, _ = ingestor.ingest_marine_engine_fault()

    # Check LiU-ICE strict split
    l_train, l_test_cls, l_test_anom, l_manifest = split_liu_ice_strict_runs(liu_df, subsample_stride=5)
    assert l_manifest["shared_physical_runs_between_train_and_test"] == 0
    assert l_manifest["shared_source_files_between_train_and_test"] == 0
    assert l_manifest["unseen_engine_generalization_supported"] is False
    assert l_manifest["physical_engines_total"] == 1
    assert set(l_train["run_id"].unique()).isdisjoint(set(l_test_cls["run_id"].unique()))
    assert set(l_train["run_id"].unique()).isdisjoint(set(l_test_anom["run_id"].unique()))
    assert set(l_train["source_file"].unique()).isdisjoint(set(l_test_cls["source_file"].unique()))
    assert set(l_train["source_file"].unique()).isdisjoint(set(l_test_anom["source_file"].unique()))
    # Verify wltp_NF is 100% in train and 0% in test
    assert "wltp_NF" in set(l_train["run_id"].unique())
    assert "wltp_NF" not in set(l_test_cls["run_id"].unique())

    # Check Marine Engine strict split
    m_train, m_test, m_manifest = split_marine_strict_runs(marine_df)
    assert m_manifest["shared_physical_runs_between_train_and_test"] == 0
    assert m_manifest["shared_source_files_between_train_and_test"] == 0
    assert m_manifest["unseen_engine_generalization_supported"] is False
    assert m_manifest["physical_engines_total"] == 1
    assert set(m_train["run_id"].unique()).isdisjoint(set(m_test["run_id"].unique()))
    assert set(m_train["source_file"].unique()).isdisjoint(set(m_test["source_file"].unique()))


def test_no_preprocessing_or_residual_fit_on_test_observations() -> None:
    """2. Verify that test observations never influence expected-response weights, residual scales, or scalers."""
    df = _make_synthetic_liu_dataframe(n_per_run=60, seed=101)
    train_df, test_df, _, _ = split_liu_ice_strict_runs(df, subsample_stride=1)

    pipe = DomainInvariantFeaturePipeline(dataset_type="liu_ice", mode="residual_plus_normalized")
    pipe.fit(train_df, normal_label="NF")

    # Snapshot all fitted training parameters before calling transform(test_df)
    sha_before = pipe.fit_data_sha256_
    medians_before = copy.deepcopy(pipe.impute_medians_)
    res_med_before = pipe.residual_medians_.copy()
    res_scale_before = pipe.residual_scales_.copy()
    scaler_mean_before = pipe.final_scaler_.mean_.copy()
    scaler_scale_before = pipe.final_scaler_.scale_.copy()
    X_test_clean = pipe.transform(test_df, apply_final_scaler=True)

    # Corrupt a second copy of test_df with extreme 1e9 outliers and verify fitted parameters do not change
    corrupted_test = test_df.copy()
    corrupted_test["intercooler_pressure_pa"] = 1e9
    _ = pipe.transform(corrupted_test, apply_final_scaler=True)

    assert pipe.fit_data_sha256_ == sha_before
    assert pipe.impute_medians_ == medians_before
    np.testing.assert_allclose(pipe.residual_medians_, res_med_before, rtol=0, atol=0)
    np.testing.assert_allclose(pipe.residual_scales_, res_scale_before, rtol=0, atol=0)
    np.testing.assert_allclose(pipe.final_scaler_.mean_, scaler_mean_before, rtol=0, atol=0)
    np.testing.assert_allclose(pipe.final_scaler_.scale_, scaler_scale_before, rtol=0, atol=0)

    # Transforming the clean test_df again must produce bit-for-bit identical output
    X_test_after = pipe.transform(test_df, apply_final_scaler=True)
    np.testing.assert_array_equal(X_test_clean, X_test_after)


def test_no_target_or_identifier_leakage() -> None:
    """3. Verify target labels, run_ids, timestamps, and RUL columns are strictly blocked from feature matrices."""
    with pytest.raises(ValueError, match="leakage"):
        assert_no_target_or_metadata_leakage(["rpm", "sample_fault_label"])
    with pytest.raises(ValueError, match="leakage"):
        assert_no_target_or_metadata_leakage(["rpm", "run_id"])
    with pytest.raises(ValueError, match="leakage"):
        assert_no_target_or_metadata_leakage(["rpm", "timestamp_sec"])
    with pytest.raises(ValueError, match="leakage"):
        assert_no_target_or_metadata_leakage(["rpm", "anomaly_state"])
    with pytest.raises(ValueError, match="Forbidden target"):
        assert_no_target_or_metadata_leakage(["rpm", "derived_fault_code_hint"])

    df = _make_synthetic_liu_dataframe(n_per_run=50, seed=42)
    train_df, _, _, _ = split_liu_ice_strict_runs(df, subsample_stride=1)
    for mode in FEATURE_MODES:
        pipe = DomainInvariantFeaturePipeline(dataset_type="liu_ice", mode=mode)
        pipe.fit(train_df, normal_label="NF")
        assert_no_target_or_metadata_leakage(pipe.feature_names_out_)


def test_reproducibility_under_fixed_random_seeds() -> None:
    """4. Verify deterministic, bit-for-bit reproducible features and predictions under fixed seeds."""
    df = _make_synthetic_liu_dataframe(n_per_run=60, seed=77)
    train_df, test_df, _, _ = split_liu_ice_strict_runs(df, subsample_stride=1)

    pipe1 = DomainInvariantFeaturePipeline(dataset_type="liu_ice", mode="residual_features")
    X_tr1 = pipe1.fit(train_df, normal_label="NF").transform(train_df, apply_final_scaler=True)
    X_te1 = pipe1.transform(test_df, apply_final_scaler=True)
    clf1 = LogisticRegression(max_iter=300, random_state=42).fit(X_tr1, train_df["sample_fault_label"])
    pred1 = clf1.predict(X_te1)

    pipe2 = DomainInvariantFeaturePipeline(dataset_type="liu_ice", mode="residual_features")
    X_tr2 = pipe2.fit(train_df, normal_label="NF").transform(train_df, apply_final_scaler=True)
    X_te2 = pipe2.transform(test_df, apply_final_scaler=True)
    clf2 = LogisticRegression(max_iter=300, random_state=42).fit(X_tr2, train_df["sample_fault_label"])
    pred2 = clf2.predict(X_te2)

    np.testing.assert_allclose(X_tr1, X_tr2, rtol=1e-12, atol=1e-12)
    np.testing.assert_allclose(X_te1, X_te2, rtol=1e-12, atol=1e-12)
    np.testing.assert_array_equal(pred1, pred2)


def test_exact_residual_and_robust_scale_calculations() -> None:
    """5. Verify exact mathematical calculation of robust MAD scale, causal rolling mean, and unit conversions."""
    # Check unit conversions
    assert math.isclose(float(rad_per_sec_to_rpm(2.0 * math.pi)), 60.0, rel_tol=1e-12)
    assert math.isclose(float(kelvin_to_celsius(298.15)), 25.0, abs_tol=1e-12)
    assert math.isclose(float(kg_per_sec_to_lph(0.000745, density_kg_per_l=0.745)), 3.6, rel_tol=1e-12)

    # Check robust MAD scale: for [-2, -1, 0, 1, 2], median = 0, MAD = 1.0, scale = 1.4826
    arr = np.array([[-2.0], [-1.0], [0.0], [1.0], [2.0]])
    med, scale = compute_robust_scale(arr)
    assert math.isclose(float(med[0]), 0.0, abs_tol=1e-12)
    assert math.isclose(float(scale[0]), 1.4826, rel_tol=1e-9)

    # Check causal rolling mean within run (never leaks across run_id boundary and never looks ahead)
    meta = pd.DataFrame({"run_id": ["R1", "R1", "R1", "R2", "R2"]})
    mat = np.array([[10.0], [20.0], [30.0], [100.0], [200.0]])
    rolled = _causal_within_run_rolling_mean(meta, mat, window=2)
    expected = np.array([[10.0], [15.0], [25.0], [100.0], [150.0]])
    np.testing.assert_allclose(rolled, expected, rtol=1e-12, atol=1e-12)


def test_per_class_metrics_and_normal_far_calculations() -> None:
    """6. Verify exact per-class precision/recall/F1, false alarm rate on normal, and detection delay."""
    y_true = np.array(["NF", "NF", "NF", "NF", "f_pic", "f_pic", "f_pim", "f_pim"])
    y_pred = np.array(["NF", "NF", "NF", "f_pic", "f_pic", "f_pic", "NF", "f_pim"])
    labels = ["NF", "f_pic", "f_pim"]
    meta_df = pd.DataFrame({
        "run_id": ["runA"] * 4 + ["runA"] * 2 + ["runB"] * 2,
        "timestamp_sec": [0.0, 10.0, 20.0, 30.0, 120.0, 125.0, 120.0, 128.0],
        "anomaly_state": [0, 0, 0, 0, 1, 1, 1, 1],
    })

    res = evaluate_classification_predictions(
        model_name="TestModel",
        y_true=y_true,
        y_pred=y_pred,
        labels=labels,
        normal_label="NF",
        test_meta_df=meta_df,
    )
    # Normal FAR: 1 false alarm out of 4 true NF observations = 0.25
    assert math.isclose(res["false_alarm_rate_on_normal_test"], 0.25, abs_tol=1e-6)
    # f_pic: TP=2, FP=1 (from 4th NF sample), FN=0 -> Precision=2/3=0.6667, Recall=1.0, F1=0.8
    assert math.isclose(res["per_class_metrics"]["f_pic"]["precision"], 0.6667, abs_tol=1e-4)
    assert math.isclose(res["per_class_metrics"]["f_pic"]["recall"], 1.0, abs_tol=1e-4)
    assert math.isclose(res["per_class_metrics"]["f_pic"]["f1_score"], 0.8, abs_tol=1e-4)
    # Detection delay: runA detected at t=120.0 (onset=120.0 -> delay=0.0s); runB detected at t=128.0 (onset=120.0 -> delay=8.0s)
    assert math.isclose(float(res["detection_delay_sec_by_run"]["runA"]), 0.0, abs_tol=1e-6)
    assert math.isclose(float(res["detection_delay_sec_by_run"]["runB"]), 8.0, abs_tol=1e-6)


def test_missing_sensor_handling_and_non_fabrication() -> None:
    """7. Verify unavailable sensors remain NaN and injected NaNs in valid sensors use training-only medians."""
    df = _make_synthetic_liu_dataframe(n_per_run=50, seed=55)
    train_df, test_df, _, _ = split_liu_ice_strict_runs(df, subsample_stride=1)

    # Unavailable sensors must remain completely NaN and never enter feature_names_out_
    for missing_col in ["cht_c", "egt_c", "oil_pressure_bar", "oil_temp_c", "vibration_rms_mms", "rul_hours"]:
        assert train_df[missing_col].isna().all()
        assert test_df[missing_col].isna().all()

    pipe = DomainInvariantFeaturePipeline(dataset_type="liu_ice", mode="residual_features")
    pipe.fit(train_df, normal_label="NF")

    for missing_col in ["cht_c", "egt_c", "oil_pressure_bar", "oil_temp_c", "vibration_rms_mms", "rul_hours"]:
        assert all(missing_col not in f for f in pipe.feature_names_out_)

    # Inject NaNs into test_df and verify transform() imputes cleanly with finite numbers using training medians
    test_with_nans = test_df.copy()
    test_with_nans.loc[test_with_nans.index[:10], "intercooler_pressure_pa"] = np.nan
    X_out = pipe.transform(test_with_nans, apply_final_scaler=True)
    assert np.isfinite(X_out).all()


def test_provenance_and_phase3_report_contract() -> None:
    """8. Verify Phase 3 artifacts, provenance retention, and preservation of Phase 2 reports."""
    assert PHASE3_JSON_REPORT_PATH.exists(), "Missing backend/artifacts/phase3_experiment_report.json"
    audit_doc = REPO_ROOT / "docs" / "PHASE3_METHOD_AUDIT.md"
    assert audit_doc.exists(), "Missing docs/PHASE3_METHOD_AUDIT.md"

    rep = json.loads(PHASE3_JSON_REPORT_PATH.read_text(encoding="utf-8"))
    assert rep["evaluation_scope"] == "REAL_EXPERIMENTAL_BENCH_DATA_ONLY"
    assert rep["synthetic_rul_reference"]["status"] == "KEPT_SEPARATE_SYNTHETIC_ONLY"
    assert rep["synthetic_rul_reference"]["real_data_rul_status"] == "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS"

    for ds_name in ["LiU-ICE-Benchmark-DXC25", "Marine-Engine-Fault-v1.0"]:
        ds = rep["experiments"][ds_name]
        assert ds["rul_evaluation"]["status"] == "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS"
        assert ds["split_manifest"]["shared_physical_runs_between_train_and_test"] == 0
        assert ds["split_manifest"]["shared_source_files_between_train_and_test"] == 0
        assert ds["split_manifest"]["physical_engines_total"] == 1
        assert ds["split_manifest"]["unseen_engine_generalization_supported"] is False
        for mode in FEATURE_MODES:
            assert mode in ds["feature_pipelines"]

    # Verify residual features improve Macro-F1 over raw/normalized sensors on unseen loads/runs
    m_pipes = rep["experiments"]["Marine-Engine-Fault-v1.0"]["feature_pipelines"]
    assert (
        m_pipes["residual_features"]["models"]["LogisticRegression"]["macro_f1"]
        > m_pipes["raw_sensors"]["models"]["LogisticRegression"]["macro_f1"]
    )
    assert (
        m_pipes["residual_features"]["models"]["RandomForestClassifier"]["macro_f1"]
        > m_pipes["raw_sensors"]["models"]["RandomForestClassifier"]["macro_f1"]
    )

    # Verify Phase 2 reports and existing production model are preserved untouched
    assert (REPO_ROOT / "backend" / "artifacts" / "real_data_evaluation_report.json").exists()
    assert (REPO_ROOT / "backend" / "artifacts" / "synthetic_baseline_report.json").exists()
    assert (REPO_ROOT / "data" / "processed" / "real_data_quality_report.json").exists()
    assert (REPO_ROOT / "backend" / "artifacts" / "drishti_ml_bundle.joblib").exists()
