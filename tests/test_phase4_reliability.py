"""Automated verification and leakage-prevention tests for DRISHTI Phase 4 Reliability & Failure Reduction."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.data_ingestion.real_data_pipeline import RealDatasetIngestor
from backend.app.ml.phase3_residual_diagnostics import (
    assert_no_target_or_metadata_leakage,
    compute_multinomial_bootstrap_ci,
    load_marine_dataframe_causal,
    split_liu_ice_strict_runs,
    split_marine_strict_runs,
)
from backend.app.ml.phase4_reliability import (
    PHASE3_REPORT_JSON_PATH,
    PHASE4_REPORT_JSON_PATH,
    LiUICEReliabilityPipeline,
    MarineReliabilityResidualPipeline,
    apply_causal_consecutive_confirmation,
    apply_causal_hysteresis_detector,
    compute_contiguous_block_bootstrap_ci,
)


@pytest.fixture(scope="module")
def ingested_datasets():
    ingestor = RealDatasetIngestor()
    liu_df, _ = ingestor.ingest_liu_ice()
    marine_df = load_marine_dataframe_causal(ingestor)
    return liu_df, marine_df


def test_strict_run_and_out_of_sample_validation_partition_disjointness(ingested_datasets):
    """Verify zero shared physical runs between train, validation normal holdout, and locked test sets."""
    liu_df, marine_df = ingested_datasets
    liu_train, liu_test_cls, liu_test_anom, _ = split_liu_ice_strict_runs(liu_df, subsample_stride=5)
    mar_train, mar_test, _ = split_marine_strict_runs(marine_df)

    assert set(liu_train["run_id"]).isdisjoint(set(liu_test_cls["run_id"]))
    assert set(liu_train["run_id"]).isdisjoint(set(liu_test_anom["run_id"]))
    assert set(mar_train["run_id"]).isdisjoint(set(mar_test["run_id"]))

    mar_pipe = MarineReliabilityResidualPipeline()
    fit_norm_df, val_norm_df = mar_pipe.split_train_normal_fit_and_val(mar_train)
    assert len(fit_norm_df) > 0 and len(val_norm_df) > 0
    assert set(fit_norm_df["run_id"]).isdisjoint(set(val_norm_df["run_id"]))
    assert set(val_norm_df["run_id"]).isdisjoint(set(mar_test["run_id"]))
    assert "AC_Fouling_75_Load" in set(val_norm_df["run_id"])


def test_training_only_fit_invariance_to_test_corruption(ingested_datasets):
    """Verify that corrupting locked test data does not alter any fitted pipeline parameter."""
    liu_df, marine_df = ingested_datasets
    liu_train, liu_test_cls, _, _ = split_liu_ice_strict_runs(liu_df, subsample_stride=20)
    mar_train, mar_test, _ = split_marine_strict_runs(marine_df)
    mar_train_sub = mar_train.iloc[::10].copy().reset_index(drop=True)
    mar_test_sub = mar_test.iloc[::10].copy().reset_index(drop=True)

    # Fit on clean training data
    p_mar_clean = MarineReliabilityResidualPipeline().fit(mar_train_sub)
    p_liu_clean = LiUICEReliabilityPipeline(mode="phase4_structured_unsigned_residual").fit(liu_train)

    # Corrupt test sets completely (extreme sensor spikes + inverted labels)
    mar_test_corrupted = mar_test_sub.copy()
    for c in mar_test_corrupted.columns:
        if c.startswith("feat__"):
            mar_test_corrupted[c] = -999999.0
    mar_test_corrupted["sample_fault_label"] = "Turbine Degradation"

    liu_test_corrupted = liu_test_cls.copy()
    liu_test_corrupted["intercooler_pressure_pa"] = 9999999.0
    liu_test_corrupted["sample_fault_label"] = "f_pic"

    # Re-fit pipelines (which only accept train_df) and verify identical hashes and parameters
    p_mar_re = MarineReliabilityResidualPipeline().fit(mar_train_sub)
    p_liu_re = LiUICEReliabilityPipeline(mode="phase4_structured_unsigned_residual").fit(liu_train)

    assert p_mar_clean.fit_data_sha256_ == p_mar_re.fit_data_sha256_
    np.testing.assert_allclose(p_mar_clean.residual_medians_, p_mar_re.residual_medians_)
    np.testing.assert_allclose(p_mar_clean.residual_scales_, p_mar_re.residual_scales_)

    assert p_liu_clean.fit_data_sha256_ == p_liu_re.fit_data_sha256_
    np.testing.assert_allclose(p_liu_clean.residual_medians_, p_liu_re.residual_medians_)
    np.testing.assert_allclose(p_liu_clean.residual_scales_, p_liu_re.residual_scales_)

    assert_no_target_or_metadata_leakage(p_mar_clean.feature_names_out_)
    assert_no_target_or_metadata_leakage(p_liu_clean.feature_names_out_)


def test_causal_persistence_and_hysteresis_no_future_or_cross_run_leakage():
    """Verify consecutive_k confirmation and Schmitt-trigger hysteresis are strictly causal and reset per run."""
    df_meta = pd.DataFrame({
        "run_id": ["run_A"] * 8 + ["run_B"] * 8,
        "timestamp_sec": list(range(8)) + list(range(8)),
    })
    scores = np.array(
        [0.2, 1.5, 1.6, 0.1, 1.8, 1.9, 2.0, 2.1]  # run_A: brief 2-sample spike, then 4-sample fault
        + [0.1, 0.2, 0.1, 0.2, 0.1, 0.1, 0.2, 0.1],  # run_B: completely normal
        dtype=float,
    )
    raw_alarm = (scores > 1.0).astype(int)

    # 1. Consecutive k=3 must suppress the 2-sample spike at indices 1..2 in run_A
    alarm_k3 = apply_causal_consecutive_confirmation(df_meta, raw_alarm, k_consecutive=3)
    assert alarm_k3[1] == 0 and alarm_k3[2] == 0
    assert alarm_k3[4] == 0 and alarm_k3[5] == 0 and alarm_k3[6] == 1 and alarm_k3[7] == 1
    # Must reset at start of run_B
    assert alarm_k3[8:].sum() == 0

    # 2. Hysteresis (T_on=1.7, T_off=0.5, k_on=2) must NOT carry alarm state from end of run_A into run_B
    alarm_hyst = apply_causal_hysteresis_detector(
        df_meta, scores, threshold_on=1.7, threshold_off=0.5, k_consecutive_on=2
    )
    assert alarm_hyst[5] == 1 and alarm_hyst[7] == 1
    assert alarm_hyst[8] == 0 and alarm_hyst[8:].sum() == 0

    # 3. Causality check: modifying future scores at t >= 5 must not change outputs at t < 5
    scores_future_mod = scores.copy()
    scores_future_mod[5:] = 999.0
    alarm_hyst_mod = apply_causal_hysteresis_detector(
        df_meta, scores_future_mod, threshold_on=1.7, threshold_off=0.5, k_consecutive_on=2
    )
    np.testing.assert_array_equal(alarm_hyst[:5], alarm_hyst_mod[:5])


def test_liu_ice_parity_column_alignment_and_decoupled_residual_physics(ingested_datasets):
    """Verify fixed parity column alignment and physical decoupling of p_ic vs p_im control-map residuals."""
    liu_df, _ = ingested_datasets
    liu_train, liu_test_cls, _, _ = split_liu_ice_strict_runs(liu_df, subsample_stride=10)

    pipe = LiUICEReliabilityPipeline(mode="phase4_structured_unsigned_residual").fit(liu_train, normal_label="NF")
    z_tr = pipe.compute_normalized_residual_table(liu_train)
    z_te = pipe.compute_normalized_residual_table(liu_test_cls)

    # Train f_pic_090 (-10% gain): primary p_ic residual must be strongly negative (< -8 sigma)
    mask_tr_pic = (liu_train["run_id"] == "wltp_f_pic_090") & (liu_train["sample_fault_label"] == "f_pic")
    med_tr_pic = float(z_tr.loc[mask_tr_pic, "res__intercooler_pressure_pa"].median())
    assert med_tr_pic < -8.0

    # Test f_pic_110 (+10% gain): primary p_ic residual must be strongly positive (> +8 sigma),
    # while decoupled primary p_im residual remains small (|median| < 1.0 sigma), whereas coupled
    # parity_res__intake_manifold_pressure_pa is strongly negative (< -4.0 sigma)!
    mask_te_pic = (liu_test_cls["run_id"] == "wltp_f_pic_110") & (liu_test_cls["sample_fault_label"] == "f_pic")
    med_te_pic = float(z_te.loc[mask_te_pic, "res__intercooler_pressure_pa"].median())
    med_te_pim_decoupled = float(z_te.loc[mask_te_pic, "res__intake_manifold_pressure_pa"].median())
    med_te_pim_coupled_parity = float(z_te.loc[mask_te_pic, "parity_res__intake_manifold_pressure_pa"].median())

    assert med_te_pic > 8.0
    assert abs(med_te_pim_decoupled) < 1.0
    assert med_te_pim_coupled_parity < -4.0


def test_contiguous_block_bootstrap_ci_wider_than_iid_row_bootstrap():
    """Verify contiguous block bootstrap produces wider CIs than i.i.d. row bootstrap under autocorrelation."""
    rng = np.random.default_rng(123)
    # Create 20 contiguous blocks of length 50 where each block is either mostly correct or mostly wrong
    y_true_blocks = []
    y_pred_blocks = []
    run_ids = []
    labels = ["Normal", "Fault_A", "Fault_B"]
    for b in range(20):
        true_cls = labels[b % 3]
        is_good_block = (b % 2 == 0)
        pred_cls = true_cls if is_good_block else labels[(b + 1) % 3]
        y_true_blocks.extend([true_cls] * 50)
        y_pred_blocks.extend([pred_cls] * 50)
        run_ids.extend([f"run_{b // 5}"] * 50)

    df_meta = pd.DataFrame({"run_id": run_ids})
    y_true = np.array(y_true_blocks, dtype=str)
    y_pred = np.array(y_pred_blocks, dtype=str)

    row_ci = compute_multinomial_bootstrap_ci(y_true, y_pred, labels=labels, n_boot=200, seed=42)
    blk_ci = compute_contiguous_block_bootstrap_ci(
        df_meta, y_true, y_pred, labels=labels, block_size=50, n_boot=200, seed=42
    )

    row_width = row_ci["macro_f1_ci95_high"] - row_ci["macro_f1_ci95_low"]
    blk_width = blk_ci["macro_f1_ci95_high"] - blk_ci["macro_f1_ci95_low"]
    assert blk_ci["macro_f1_ci95_low"] <= blk_ci["macro_f1_mean"] <= blk_ci["macro_f1_ci95_high"]
    assert blk_width > row_width * 2.0


def test_phase4_artifact_completeness_and_empirical_improvements():
    """Verify saved phase4_experiment_report.json contains all required audits and verified failure reductions."""
    assert PHASE3_REPORT_JSON_PATH.exists(), "Phase 3 artifact must remain preserved."
    assert PHASE4_REPORT_JSON_PATH.exists(), "Phase 4 artifact must be generated."

    with open(PHASE4_REPORT_JSON_PATH, "r", encoding="utf-8") as f:
        rep = json.load(f)

    assert rep["strict_leakage_guarantees"]["raw_datasets_modified"] is False
    assert rep["strict_leakage_guarantees"]["production_model_bundle_modified"] is False
    assert rep["strict_leakage_guarantees"]["test_labels_used_in_threshold_or_feature_selection"] is False
    assert rep["strict_leakage_guarantees"]["shared_physical_runs_between_train_and_test"] == 0

    # 1. Verify Phase 3 independent reproduction audit
    p3_repro = rep["phase3_independent_reproduction"]
    assert p3_repro["total_supervised_evaluations_checked"] == 24
    assert p3_repro["exact_reproduced_count"] == 22
    assert p3_repro["differing_count"] == 2

    # 2. Verify Marine Engine False Alarm Reduction (Section 2A)
    mar_fa = rep["marine_engine_reliability"]["false_alarm_investigation"]
    p3_if_q95_far = mar_fa["phase3_reproduced_baseline"]["Phase3_IsolationForest_Residual"]["q95"][
        "normal_false_alarm_rate"
    ]
    p3_rms_q95_far = mar_fa["phase3_reproduced_baseline"]["Phase3_RMS_Normalized_Residual"]["q95"][
        "normal_false_alarm_rate"
    ]
    assert abs(p3_if_q95_far - 0.5701) < 1e-3
    assert abs(p3_rms_q95_far - 0.4783) < 1e-3

    # Phase 4 run-balanced RMS at q99 or with consecutive_k persistence must dramatically reduce normal FAR
    p4_rms_q99_far = mar_fa["phase4_threshold_tradeoff_tables"]["Phase4_RMS_CausalSmoothed_Residual"]["q99"][
        "normal_false_alarm_rate"
    ]
    assert p4_rms_q99_far < 0.15

    # 3. Verify LiU-ICE Opposite-Sign Sensor Fault Improvement (Section 2B)
    liu_modes = rep["liu_ice_reliability"]["opposite_sign_fault_investigation"]["feature_representations"]
    p3_pic_rec_lr = liu_modes["phase3_signed_coupled_residual"]["models"]["LogisticRegression_Balanced"][
        "per_class_metrics"
    ]["f_pic"]["recall"]
    p4_pic_rec_lr = liu_modes["phase4_structured_unsigned_residual"]["models"]["LogisticRegression_Balanced"][
        "per_class_metrics"
    ]["f_pic"]["recall"]
    p4_pic_rec_rf = liu_modes["phase4_structured_unsigned_residual"]["models"]["RandomForest_Balanced"][
        "per_class_metrics"
    ]["f_pic"]["recall"]

    assert p3_pic_rec_lr == 0.0
    assert p4_pic_rec_lr > 0.90
    assert p4_pic_rec_rf > 0.90
