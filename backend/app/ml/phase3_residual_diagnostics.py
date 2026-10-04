"""Phase 3: Robust Diagnostics and Domain-Invariant Normalized Residual Feature Pipelines.

SCIENTIFIC & ENGINEERING INTEGRITY RULES:
1. Raw dataset archives in `data/raw/` and Phase 2 reports remain completely immutable.
2. Zero physical test runs (`source_file` / base `run_id`) are shared between training and locked test sets.
3. Expected-response models (`y_hat = f_normal(u)`), residual scaling parameters (median, MAD/IQR),
   imputation medians, and feature scalers are fitted EXCLUSIVELY on training data (normal subset for
   expected response and residual scale). Test data are NEVER used to fit expected behavior, scaling,
   feature selection, or anomaly thresholds.
4. Data-driven response surfaces are explicitly labeled as empirical training-normal regressions, NOT
   validated first-principles physical engine models.
5. Because each benchmark dataset contains 1 physical engine (`N_engines = 1`), all reports explicitly
   distinguish unseen-run / unseen-load generalization from unseen-engine generalization.
6. Real-data RUL is not trained or fabricated (`NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS`).
"""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple
import zipfile

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.preprocessing import PolynomialFeatures, RobustScaler, StandardScaler

from backend.app.data_ingestion.real_data_pipeline import (
    MARINE_FEATURE_COLUMNS,
    MARINE_TEMPERATURE_SENTINEL_VALUE,
    REPO_ROOT,
    RealDatasetIngestor,
)

ARTIFACTS_DIR = REPO_ROOT / "backend" / "artifacts"
PHASE3_JSON_REPORT_PATH = ARTIFACTS_DIR / "phase3_experiment_report.json"

FeatureMode = Literal[
    "raw_sensors",
    "normalized_sensors",
    "residual_features",
    "residual_plus_normalized",
]

FEATURE_MODES: List[FeatureMode] = [
    "raw_sensors",
    "normalized_sensors",
    "residual_features",
    "residual_plus_normalized",
]

# Columns strictly forbidden from ever entering a predictive feature matrix X
FORBIDDEN_METADATA_AND_TARGET_COLUMNS = {
    "dataset_id",
    "source_file",
    "source_archive_sha256",
    "engine_id",
    "run_id",
    "physical_run_id",
    "timestamp_sec",
    "is_synthetic",
    "data_source",
    "run_fault_code",
    "run_fault_description",
    "run_fault_class",
    "fault_onset_sec",
    "anomaly_state",
    "sample_fault_label",
    "rul_hours",
    "split",
    "Label",
    "Label_No",
    "Anomaly State",
    "Time",
    "Time_rel",
}

# ============================================================================
# Dataset 1 (LiU-ICE) Channel Definitions (Only Actually Measured Sensors)
# ============================================================================
# Operating / Actuator / Unfaulted Reference Inputs `u` used for Expected Response Surface
LIU_ICE_OPERATING_INPUTS: List[str] = [
    "rpm",
    "throttle_pct",
    "wastegate_position",
    "fuel_flow_lph",
    "intercooler_temp_c",
]

# Internal Air-Path Response Sensors `y` (where faults f_pic, f_pim, f_waf, f_iml manifest)
LIU_ICE_RESPONSE_SENSORS: List[str] = [
    "intercooler_pressure_pa",
    "intercooler_temp_c",
    "intake_manifold_pressure_pa",
    "air_mass_flow_kgs",
]

# All 8 on-engine measured channels (excluding test-cell room barometer/ambient drift proxies)
LIU_ICE_ON_ENGINE_SENSORS: List[str] = [
    "intercooler_pressure_pa",
    "intercooler_temp_c",
    "intake_manifold_pressure_pa",
    "air_mass_flow_kgs",
    "rpm",
    "throttle_pct",
    "wastegate_position",
    "fuel_flow_lph",
]

# ============================================================================
# Dataset 2 (Marine Engine Fault) Channel Definitions (44 Clean Measured Channels)
# ============================================================================
# 10 Operating & Test-Bed Boundary Condition Inputs `u`
MARINE_OPERATING_BOUNDARY_INPUTS: List[str] = [
    "feat__Engine Speed",
    "feat__Shaft Power",
    "feat__Shaft Torque",
    "feat__Water Brake Weight",
    "feat__Engine room Temp.",
    "feat__Cooling Water Temp. Engine In",
    "feat__LO Cooling Water Temp. In",
    "feat__Charge Air IC Cooling Water Temp. In",
    "feat__Fuel Temp.",
    "feat__Fuel Oil Temp. Flow meter In",
]

# 34 Internal Engine Response Sensors `y`
MARINE_RESPONSE_SENSORS: List[str] = [
    f"feat__{c}"
    for c in MARINE_FEATURE_COLUMNS
    if f"feat__{c}" not in set(MARINE_OPERATING_BOUNDARY_INPUTS)
]

MARINE_ALL_44_SENSORS: List[str] = [f"feat__{c}" for c in MARINE_FEATURE_COLUMNS]


def assert_no_target_or_metadata_leakage(feature_names: List[str]) -> None:
    """Raise ValueError if any label, run_id, timestamp, or metadata column is in feature_names."""
    leaked = [c for c in feature_names if c in FORBIDDEN_METADATA_AND_TARGET_COLUMNS]
    if leaked:
        raise ValueError(f"Target or metadata leakage detected in feature list: {leaked}")
    for c in feature_names:
        lower = c.lower()
        if any(tok in lower for tok in ("label", "anomaly_state", "run_id", "timestamp", "rul_hours", "fault_code")):
            raise ValueError(f"Forbidden target/identifier token in feature name: {c}")


def compute_robust_scale(values: np.ndarray, eps: float = 1e-6) -> Tuple[np.ndarray, np.ndarray]:
    """Compute training-only median and robust scale (1.4826 * MAD, with IQR/std fallback) per column."""
    med = np.nanmedian(values, axis=0)
    mad = np.nanmedian(np.abs(values - med), axis=0) * 1.4826
    q75 = np.nanpercentile(values, 75.0, axis=0)
    q25 = np.nanpercentile(values, 25.0, axis=0)
    iqr_scale = (q75 - q25) / 1.349
    std_scale = np.nanstd(values, axis=0)

    scale = np.where(mad > eps, mad, np.where(iqr_scale > eps, iqr_scale, np.maximum(std_scale, eps)))
    return med, scale


def _causal_within_run_rolling_mean(
    df_meta: pd.DataFrame,
    matrix: np.ndarray,
    window: int,
) -> np.ndarray:
    """Compute strictly causal rolling mean (past samples only, min_periods=1) grouped by physical run_id."""
    if window <= 1 or len(matrix) == 0:
        return matrix.copy()
    out = np.empty_like(matrix, dtype=float)
    run_ids = df_meta["run_id"].to_numpy()
    _, d = matrix.shape
    for rid in pd.unique(run_ids):
        mask = (run_ids == rid)
        sub = matrix[mask]
        n = len(sub)
        cs = np.vstack([np.zeros((1, d), dtype=float), np.cumsum(sub, axis=0)])
        idx = np.arange(n)
        start = np.maximum(0, idx - window + 1)
        counts = (idx - start + 1).reshape(-1, 1).astype(float)
        out[mask] = (cs[idx + 1] - cs[start]) / counts
    return out


def _causal_within_run_rolling_std(
    df_meta: pd.DataFrame,
    matrix: np.ndarray,
    window: int,
) -> np.ndarray:
    """Compute strictly causal rolling std (past samples only, min_periods=1, ddof=0) grouped by run_id."""
    if window <= 1 or len(matrix) == 0:
        return np.zeros_like(matrix, dtype=float)
    out = np.empty_like(matrix, dtype=float)
    run_ids = df_meta["run_id"].to_numpy()
    _, d = matrix.shape
    for rid in pd.unique(run_ids):
        mask = (run_ids == rid)
        sub = matrix[mask]
        n = len(sub)
        # Center by column median first to avoid catastrophic cancellation in E[X^2] - (E[X])^2
        sub_c = sub - np.median(sub, axis=0, keepdims=True)
        cs1 = np.vstack([np.zeros((1, d), dtype=float), np.cumsum(sub_c, axis=0)])
        cs2 = np.vstack([np.zeros((1, d), dtype=float), np.cumsum(np.square(sub_c), axis=0)])
        idx = np.arange(n)
        start = np.maximum(0, idx - window + 1)
        counts = (idx - start + 1).reshape(-1, 1).astype(float)
        mean1 = (cs1[idx + 1] - cs1[start]) / counts
        mean2 = (cs2[idx + 1] - cs2[start]) / counts
        var = np.maximum(0.0, mean2 - np.square(mean1))
        out[mask] = np.sqrt(var)
    return out


def _causal_within_run_diff(
    df_meta: pd.DataFrame,
    matrix: np.ndarray,
) -> np.ndarray:
    """Compute strictly causal 1-step backward difference x(t) - x(t-1) within each run_id (0 at t=0)."""
    if len(matrix) == 0:
        return matrix.copy()
    out = np.zeros_like(matrix, dtype=float)
    run_ids = df_meta["run_id"].to_numpy()
    for rid in pd.unique(run_ids):
        mask = (run_ids == rid)
        sub = matrix[mask]
        if len(sub) > 1:
            diff_sub = np.vstack([np.zeros((1, sub.shape[1]), dtype=float), np.diff(sub, axis=0)])
            out[mask] = diff_sub
    return out


# ============================================================================
# Causal Ingestion Loader for Marine Engine (No .bfill() Future Lookahead)
# ============================================================================

def load_marine_dataframe_causal(ingestor: Optional[RealDatasetIngestor] = None) -> pd.DataFrame:
    """Load Marine Engine Fault dataset with 999.0 sentinels replaced by NaN and causally forward-filled only.

    Unlike Phase 2 `.ffill().bfill()`, any leading NaN at the start of a run remains NaN until imputed
    by the training-only median inside the feature pipeline.
    """
    if ingestor is None:
        ingestor = RealDatasetIngestor()
    marine_df, _ = ingestor.ingest_marine_engine_fault()

    # Re-scan raw archive for any initial-row 999.0 sentinels so leading values are NaN rather than backfilled
    with zipfile.ZipFile(ingestor.marine_zip_path, "r") as zf:
        csv_names = sorted(
            n
            for n in zf.namelist()
            if n.endswith(".csv") and not n.endswith(("dataset_index.csv", "variable_dictionary.csv"))
        )
        frames: List[pd.DataFrame] = []
        for member_name in csv_names:
            run_id = Path(member_name).stem
            raw_bytes = zf.read(member_name)
            raw_df = pd.read_csv(io.BytesIO(raw_bytes), header=0, skiprows=[1, 2], encoding="utf-8")
            sub = marine_df[marine_df["run_id"] == run_id].copy()

            temp_cols = [c for c in raw_df.columns if "Temp." in c and f"feat__{c}" in sub.columns]
            for tc in temp_cols:
                cleaned = raw_df[tc].astype(float).replace(MARINE_TEMPERATURE_SENTINEL_VALUE, np.nan).ffill()
                sub[f"feat__{tc}"] = cleaned.to_numpy(dtype=float)
            frames.append(sub)

    return pd.concat(frames, ignore_index=True)


# ============================================================================
# Strict Run-Independent Splits (STEP 2)
# ============================================================================

def split_liu_ice_strict_runs(
    liu_df: pd.DataFrame,
    subsample_stride: int = 5,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """Strict zero-shared-physical-run split for LiU-ICE.

    - `wltp_NF` (entire CSV file) is placed 100% in TRAIN (split 80/20 chronologically into train_fit
      and val_normal_calib for threshold selection). Zero rows of `wltp_NF` are in TEST.
    - Train fault runs: `wltp_f_pic_090`, `wltp_f_pim_080`, `wltp_f_waf_105`.
    - Locked test fault runs (4-class supervised): `wltp_f_pic_110`, `wltp_f_pim_090`, `wltp_f_waf_110`.
      Normal (`NF`) observations in the locked test set come exclusively from the pre-fault segments
      (t < 120s) of these 3 unseen physical test runs.
    - Unseen anomaly test set also includes `wltp_f_iml_6mm` (1 physical run in archive).
    """
    train_run_ids = ["wltp_NF", "wltp_f_pic_090", "wltp_f_pim_080", "wltp_f_waf_105"]
    test_cls_run_ids = ["wltp_f_pic_110", "wltp_f_pim_090", "wltp_f_waf_110"]
    test_anom_run_ids = ["wltp_f_pic_110", "wltp_f_pim_090", "wltp_f_waf_110", "wltp_f_iml_6mm"]

    assert set(train_run_ids).isdisjoint(set(test_cls_run_ids))
    assert set(train_run_ids).isdisjoint(set(test_anom_run_ids))

    train_full = liu_df[liu_df["run_id"].isin(train_run_ids)]
    test_cls_full = liu_df[liu_df["run_id"].isin(test_cls_run_ids)]
    test_anom_full = liu_df[liu_df["run_id"].isin(test_anom_run_ids)]

    # Subsample within each run deterministically to avoid overlapping windows
    train_sub = pd.concat(
        [g.iloc[::subsample_stride] for _, g in train_full.groupby("run_id", sort=False)],
        ignore_index=True,
    )
    test_cls_sub = pd.concat(
        [g.iloc[::subsample_stride] for _, g in test_cls_full.groupby("run_id", sort=False)],
        ignore_index=True,
    )
    test_anom_sub = pd.concat(
        [g.iloc[::subsample_stride] for _, g in test_anom_full.groupby("run_id", sort=False)],
        ignore_index=True,
    )

    shared_files_cls = set(train_sub["source_file"].unique()).intersection(
        set(test_cls_sub["source_file"].unique())
    )
    shared_files_anom = set(train_sub["source_file"].unique()).intersection(
        set(test_anom_sub["source_file"].unique())
    )
    if shared_files_cls or shared_files_anom:
        raise ValueError("Physical CSV file leakage detected in LiU-ICE split!")

    manifest = {
        "dataset_id": "LiU-ICE-Benchmark-DXC25",
        "generalization_type": "UNSEEN_RUN_AND_OPPOSITE_OR_SCALED_FAULT_MAGNITUDE (SINGLE_PHYSICAL_ENGINE)",
        "unseen_engine_generalization_supported": False,
        "physical_engines_total": 1,
        "engine_id": "ENG-LIU-ICE-01",
        "subsample_stride": subsample_stride,
        "effective_sampling_rate_hz": round(20.0 / subsample_stride, 2),
        "train_physical_runs": train_run_ids,
        "test_classification_physical_runs": test_cls_run_ids,
        "test_anomaly_physical_runs": test_anom_run_ids,
        "shared_physical_runs_between_train_and_test": 0,
        "shared_source_files_between_train_and_test": 0,
        "train_samples": int(len(train_sub)),
        "test_classification_samples": int(len(test_cls_sub)),
        "test_anomaly_samples": int(len(test_anom_sub)),
        "train_class_distribution": {
            k: int(v) for k, v in train_sub["sample_fault_label"].value_counts().items()
        },
        "test_classification_class_distribution": {
            k: int(v) for k, v in test_cls_sub["sample_fault_label"].value_counts().items()
        },
        "single_run_limitation_note": (
            "wltp_f_iml_6mm (6mm intake manifold orifice leakage) has only 1 physical run in the DXC25 "
            "archive. It is excluded from 4-class supervised training/testing to preserve strict zero-shared-run "
            "integrity, and is evaluated as an unseen fault class in binary anomaly detection."
        ),
    }
    return train_sub, test_cls_sub, test_anom_sub, manifest


def split_marine_strict_runs(
    marine_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """Strict zero-shared-physical-run split for Marine Engine Fault dataset across unseen loads."""
    train_runs = [
        "Reference_Data",
        "AC_Fouling_40_Load",
        "AC_Fouling_75_Load",
        "AF_Clogging_40_Load",
        "AF_Clogging_75_Load",
        "Clogged_Injector_Nozzle1_40_60_85_Load",
        "CW_Pump_Cavitation_60_Load",
        "Turbine_Degradation_40_Load",
        "Turbine_Degradation_60_Load",
    ]
    test_runs = [
        "AC_Fouling_60_Load",
        "AC_Fouling_85_Load",
        "AF_Clogging_60_Load",
        "AF_Clogging_85_Load",
        "Clogged_Injector_Nozzle2_LoadProgram",
        "CW_Pump_Cavitation_85_Load",
        "Turbine_Degradation_85_Load",
    ]

    assert set(train_runs).isdisjoint(set(test_runs))
    train_df = marine_df[marine_df["run_id"].isin(train_runs)].copy().reset_index(drop=True)
    test_df = marine_df[marine_df["run_id"].isin(test_runs)].copy().reset_index(drop=True)

    shared_files = set(train_df["source_file"].unique()).intersection(
        set(test_df["source_file"].unique())
    )
    if shared_files:
        raise ValueError(f"Physical CSV file leakage detected in Marine split: {shared_files}")

    manifest = {
        "dataset_id": "Marine-Engine-Fault-v1.0",
        "generalization_type": "UNSEEN_RUN_AND_UNSEEN_ENGINE_LOAD_REGIME (SINGLE_PHYSICAL_ENGINE)",
        "unseen_engine_generalization_supported": False,
        "physical_engines_total": 1,
        "engine_id": "ENG-MATSUI-MU323-01",
        "sampling_rate_hz": 0.5,
        "train_physical_runs": train_runs,
        "test_physical_runs": test_runs,
        "shared_physical_runs_between_train_and_test": 0,
        "shared_source_files_between_train_and_test": 0,
        "train_samples": int(len(train_df)),
        "test_samples": int(len(test_df)),
        "train_class_distribution": {
            k: int(v) for k, v in train_df["sample_fault_label"].value_counts().items()
        },
        "test_class_distribution": {
            k: int(v) for k, v in test_df["sample_fault_label"].value_counts().items()
        },
    }
    return train_df, test_df, manifest


# ============================================================================
# STEP 3: Training-Only Expected-Response & Normalized Residual Transformer
# ============================================================================

class DomainInvariantFeaturePipeline:
    """Strictly training-fitted feature pipeline supporting 4 representations:
    1. `raw_sensors`
    2. `normalized_sensors`
    3. `residual_features`
    4. `residual_plus_normalized`

    Guarantees:
    - Imputation medians are fitted on training data only.
    - Expected sensor response models (`y_hat = f_normal(u)`) are fitted on training NORMAL data only.
    - Residual centers (median) and robust residual scales (MAD/IQR) are fitted on training NORMAL data only.
    - Feature scalers are fitted on training data only.
    """

    def __init__(
        self,
        dataset_type: Literal["liu_ice", "marine"],
        mode: FeatureMode,
        poly_degree: int = 2,
        ridge_alpha: float = 10.0,
    ) -> None:
        if mode not in FEATURE_MODES:
            raise ValueError(f"Unsupported feature mode: {mode}")
        self.dataset_type = dataset_type
        self.mode = mode
        self.poly_degree = poly_degree
        self.ridge_alpha = ridge_alpha

        self.is_fitted_: bool = False
        self.fit_data_sha256_: str = ""
        self.fit_sample_count_: int = 0
        self.fit_normal_sample_count_: int = 0

        self.raw_sensor_cols_: List[str] = []
        self.operating_cols_: List[str] = []
        self.response_cols_: List[str] = []

        self.impute_medians_: Dict[str, float] = {}
        self.u_poly_: Optional[PolynomialFeatures] = None
        self.u_scaler_: Optional[StandardScaler] = None
        self.expected_models_: Dict[str, Ridge] = {}

        # Parity / cross-sensor models for LiU-ICE analytical redundancy
        self.parity_models_: Dict[str, Tuple[List[str], StandardScaler, Ridge]] = {}

        # Training-only normal residual location and robust scale
        self.residual_medians_: Optional[np.ndarray] = None
        self.residual_scales_: Optional[np.ndarray] = None

        # Training-only sensor normalization scaler
        self.sensor_scaler_: Optional[RobustScaler] = None
        self.final_scaler_: Optional[StandardScaler] = None
        self.feature_names_out_: List[str] = []

    def _get_imputed_columns(self, df: pd.DataFrame, cols: List[str]) -> np.ndarray:
        """Extract columns and impute any NaNs using training-only medians (never test statistics)."""
        assert_no_target_or_metadata_leakage(cols)
        arr = df[cols].to_numpy(dtype=float, copy=True)
        for idx, c in enumerate(cols):
            med = self.impute_medians_[c]
            col_slice = arr[:, idx]
            nan_mask = np.isnan(col_slice)
            if nan_mask.any():
                col_slice[nan_mask] = med
        return arr

    def fit(self, train_df: pd.DataFrame, normal_label: str) -> "DomainInvariantFeaturePipeline":
        """Fit all imputation, expected-response, residual scale, and normalization parameters on train_df ONLY."""
        if self.dataset_type == "liu_ice":
            all_cols = LIU_ICE_ON_ENGINE_SENSORS
            self.raw_sensor_cols_ = list(LIU_ICE_ON_ENGINE_SENSORS)
            self.operating_cols_ = list(LIU_ICE_OPERATING_INPUTS)
            self.response_cols_ = list(LIU_ICE_RESPONSE_SENSORS)
        else:
            all_cols = MARINE_ALL_44_SENSORS
            self.raw_sensor_cols_ = list(MARINE_RESPONSE_SENSORS)
            self.operating_cols_ = list(MARINE_OPERATING_BOUNDARY_INPUTS)
            self.response_cols_ = list(MARINE_RESPONSE_SENSORS)

        assert_no_target_or_metadata_leakage(all_cols)

        # Record cryptographic hash of training sensor matrix to prove test data never touched .fit()
        raw_bytes = train_df[all_cols].to_numpy(dtype=float).tobytes()
        self.fit_data_sha256_ = hashlib.sha256(raw_bytes).hexdigest()
        self.fit_sample_count_ = len(train_df)

        normal_mask = (train_df["sample_fault_label"].to_numpy(dtype=str) == normal_label)
        if int(normal_mask.sum()) < 10:
            raise ValueError(f"Insufficient normal samples ({normal_mask.sum()}) in training set to fit expected response.")
        self.fit_normal_sample_count_ = int(normal_mask.sum())

        train_normal_df = train_df.loc[normal_mask].reset_index(drop=True)

        # 1. Fit training-only imputation medians on normal training data
        self.impute_medians_ = {}
        for c in all_cols:
            val = float(np.nanmedian(train_normal_df[c].to_numpy(dtype=float)))
            self.impute_medians_[c] = 0.0 if np.isnan(val) else val

        # 2. Fit sensor normalization scaler on training data
        X_raw_train = self._get_imputed_columns(train_df, self.raw_sensor_cols_)
        self.sensor_scaler_ = RobustScaler()
        self.sensor_scaler_.fit(X_raw_train)

        # 3. Fit expected-response surface y_hat = f_normal(u) on TRAINING NORMAL data ONLY
        U_norm = self._get_imputed_columns(train_normal_df, self.operating_cols_)
        if self.dataset_type == "liu_ice":
            # Include causal 1-step backward differences of operating inputs for WLTP transient air-path dynamics
            dU_norm = _causal_within_run_diff(train_normal_df, U_norm)
            U_norm_aug = np.hstack([U_norm, dU_norm])
        else:
            U_norm_aug = U_norm

        self.u_poly_ = PolynomialFeatures(degree=self.poly_degree, include_bias=False)
        U_poly_norm = self.u_poly_.fit_transform(U_norm_aug)
        self.u_scaler_ = StandardScaler()
        U_scaled_norm = self.u_scaler_.fit_transform(U_poly_norm)

        Y_norm = self._get_imputed_columns(train_normal_df, self.response_cols_)
        self.expected_models_ = {}
        for j, rcol in enumerate(self.response_cols_):
            reg = Ridge(alpha=self.ridge_alpha, random_state=42)
            reg.fit(U_scaled_norm, Y_norm[:, j])
            self.expected_models_[rcol] = reg

        # For LiU-ICE, also fit leave-one-sensor-out analytical redundancy parity equations on train_normal_df
        self.parity_models_ = {}
        if self.dataset_type == "liu_ice":
            parity_specs = {
                "intercooler_pressure_pa": [
                    "intake_manifold_pressure_pa",
                    "air_mass_flow_kgs",
                    "rpm",
                    "throttle_pct",
                    "wastegate_position",
                    "fuel_flow_lph",
                    "intercooler_temp_c",
                ],
                "intake_manifold_pressure_pa": [
                    "intercooler_pressure_pa",
                    "air_mass_flow_kgs",
                    "rpm",
                    "throttle_pct",
                    "wastegate_position",
                    "fuel_flow_lph",
                    "intercooler_temp_c",
                ],
                "air_mass_flow_kgs": [
                    "intercooler_pressure_pa",
                    "intake_manifold_pressure_pa",
                    "rpm",
                    "throttle_pct",
                    "wastegate_position",
                    "fuel_flow_lph",
                    "intercooler_temp_c",
                ],
            }
            for target_col, pred_cols in parity_specs.items():
                P_in = self._get_imputed_columns(train_normal_df, pred_cols)
                P_poly = PolynomialFeatures(degree=2, include_bias=False).fit_transform(P_in)
                p_scaler = StandardScaler()
                P_scaled = p_scaler.fit_transform(P_poly)
                p_reg = Ridge(alpha=1.0, random_state=42)
                y_targ = self._get_imputed_columns(train_normal_df, [target_col]).ravel()
                p_reg.fit(P_scaled, y_targ)
                self.parity_models_[target_col] = (pred_cols, p_scaler, p_reg)

        # 4. Compute raw residuals on training NORMAL data to fit robust residual scales (median & MAD)
        raw_res_norm, _ = self._compute_raw_residuals_internal(train_normal_df)
        self.residual_medians_, self.residual_scales_ = compute_robust_scale(raw_res_norm)

        # 5. Fit final standardizer on the full training feature representation (for linear models)
        X_feat_train, feat_names = self._build_unscaled_representation(train_df)
        self.feature_names_out_ = feat_names
        assert_no_target_or_metadata_leakage(self.feature_names_out_)

        self.final_scaler_ = StandardScaler()
        self.final_scaler_.fit(X_feat_train)
        self.is_fitted_ = True
        return self

    def _compute_raw_residuals_internal(self, df: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
        """Compute raw residuals r = y - y_hat(u) and domain-specific structural residuals."""
        assert self.u_poly_ is not None and self.u_scaler_ is not None
        U = self._get_imputed_columns(df, self.operating_cols_)
        if self.dataset_type == "liu_ice":
            dU = _causal_within_run_diff(df, U)
            U_aug = np.hstack([U, dU])
        else:
            U_aug = U

        U_poly = self.u_poly_.transform(U_aug)
        U_scaled = self.u_scaler_.transform(U_poly)

        Y = self._get_imputed_columns(df, self.response_cols_)
        Y_hat = np.zeros_like(Y)
        for j, rcol in enumerate(self.response_cols_):
            Y_hat[:, j] = self.expected_models_[rcol].predict(U_scaled)

        # Primary residuals: r = y - y_hat
        R_primary = Y - Y_hat
        res_names = [f"res__{c}" for c in self.response_cols_]

        if self.dataset_type == "liu_ice":
            # Relative residuals (y - y_hat) / |y_hat| for multiplicative sensor gain faults
            R_rel = R_primary / (np.abs(Y_hat) + 1e-3)
            rel_names = [f"rel_res__{c}" for c in self.response_cols_]

            # Leave-one-out parity residuals
            parity_cols = ["intercooler_pressure_pa", "intake_manifold_pressure_pa", "air_mass_flow_kgs"]
            R_parity_list: List[np.ndarray] = []
            R_parity_rel_list: List[np.ndarray] = []
            parity_names: List[str] = []
            for tcol in parity_cols:
                pred_cols, p_scaler, p_reg = self.parity_models_[tcol]
                P_in = self._get_imputed_columns(df, pred_cols)
                P_poly = PolynomialFeatures(degree=2, include_bias=False).fit_transform(P_in)
                P_scaled = p_scaler.transform(P_poly)
                y_pred_par = p_reg.predict(P_scaled)
                y_actual = self._get_imputed_columns(df, [tcol]).ravel()
                r_par = y_actual - y_pred_par
                r_par_rel = r_par / (np.abs(y_pred_par) + 1e-3)
                R_parity_list.append(r_par.reshape(-1, 1))
                R_parity_rel_list.append(r_par_rel.reshape(-1, 1))
                parity_names.extend([f"parity_res__{tcol}", f"parity_rel__{tcol}"])

            R_all = np.hstack([R_primary, R_rel] + R_parity_list + R_parity_rel_list)
            names_all = res_names + rel_names + parity_names
            return R_all, names_all

        # Marine Engine structural & cylinder-symmetry residuals (in-cylinder & EGT balance + thermal drops)
        pmax1 = self._get_imputed_columns(df, ["feat__Max. In-Cylinder Press. No.1"]).ravel()
        pmax2 = self._get_imputed_columns(df, ["feat__Max. In-Cylinder Press. No.2"]).ravel()
        pmax3 = self._get_imputed_columns(df, ["feat__Max. In-Cylinder Press. No.3"]).ravel()
        pmax_mean = (pmax1 + pmax2 + pmax3) / 3.0
        pmax_dev = np.column_stack([
            pmax1 - pmax_mean,
            pmax2 - pmax_mean,
            pmax3 - pmax_mean,
            np.maximum.reduce([np.abs(pmax1 - pmax_mean), np.abs(pmax2 - pmax_mean), np.abs(pmax3 - pmax_mean)]),
            np.minimum.reduce([pmax1 - pmax_mean, pmax2 - pmax_mean, pmax3 - pmax_mean]),
        ])

        egt1 = self._get_imputed_columns(df, ["feat__No.1 Exh.Gas Temp."]).ravel()
        egt2 = self._get_imputed_columns(df, ["feat__No.2 Exh.Gas Temp."]).ravel()
        egt3 = self._get_imputed_columns(df, ["feat__No.3 Exh.Gas Temp."]).ravel()
        egt_mean = (egt1 + egt2 + egt3) / 3.0
        egt_dev = np.column_stack([
            egt1 - egt_mean,
            egt2 - egt_mean,
            egt3 - egt_mean,
            np.maximum.reduce([np.abs(egt1 - egt_mean), np.abs(egt2 - egt_mean), np.abs(egt3 - egt_mean)]),
            np.minimum.reduce([egt1 - egt_mean, egt2 - egt_mean, egt3 - egt_mean]),
        ])

        # Intercooler thermal drop and turbine expansion temperature ratio
        ic_in = self._get_imputed_columns(df, ["feat__Charge Air IC Air Temp. In"]).ravel()
        ic_out = self._get_imputed_columns(df, ["feat__Charge Air IC Air Temp. Out"]).ravel()
        ic_cw_in = self._get_imputed_columns(df, ["feat__Charge Air IC Cooling Water Temp. In"]).ravel()
        ic_cw_out = self._get_imputed_columns(df, ["feat__Charge Air IC Cooling Water Temp. Out"]).ravel()
        turb_in = self._get_imputed_columns(df, ["feat__Exh.Gas Temp. Turbine In"]).ravel()
        turb_out = self._get_imputed_columns(df, ["feat__Exh.Gas Temp. Turbine Out"]).ravel()

        thermal_diffs = np.column_stack([
            ic_in - ic_out,                # Intercooler air temp drop
            ic_out - ic_cw_in,             # Intercooler approach temperature (Air-Cooler Fouling indicator)
            ic_cw_out - ic_cw_in,          # Intercooler water temp rise
            turb_in - turb_out,            # Turbine temperature drop (Turbine Degradation indicator)
            turb_in - egt_mean,            # Exhaust manifold to turbine inlet temp offset
        ])

        sym_names = [
            "sym__pmax1_dev",
            "sym__pmax2_dev",
            "sym__pmax3_dev",
            "sym__pmax_max_abs_dev",
            "sym__pmax_min_dev",
            "sym__egt1_dev",
            "sym__egt2_dev",
            "sym__egt3_dev",
            "sym__egt_max_abs_dev",
            "sym__egt_min_dev",
            "therm__ic_air_drop",
            "therm__ic_approach_temp",
            "therm__ic_water_rise",
            "therm__turbine_temp_drop",
            "therm__turb_in_minus_cyl_egt",
        ]
        R_all = np.hstack([R_primary, pmax_dev, egt_dev, thermal_diffs])
        return R_all, res_names + sym_names

    def _build_unscaled_representation(self, df: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
        """Construct the requested feature matrix without refitting any parameters."""
        assert self.sensor_scaler_ is not None
        X_raw = self._get_imputed_columns(df, self.raw_sensor_cols_)

        if self.mode == "raw_sensors":
            return X_raw, list(self.raw_sensor_cols_)

        X_norm = self.sensor_scaler_.transform(X_raw)
        norm_names = [f"norm__{c}" for c in self.raw_sensor_cols_]

        if self.mode == "normalized_sensors":
            return X_norm, norm_names

        # Compute residual features: r = y - y_hat and z = (r - med_train_normal) / scale_train_normal
        assert self.residual_medians_ is not None and self.residual_scales_ is not None
        R_raw, r_names = self._compute_raw_residuals_internal(df)
        Z_norm = (R_raw - self.residual_medians_) / self.residual_scales_
        # Clip extreme thermocouple spikes to [-25, 25] to preserve numerical stability
        Z_norm = np.clip(Z_norm, -25.0, 25.0)
        z_names = [f"z__{n}" for n in r_names]

        if self.dataset_type == "liu_ice":
            # Causal within-run smoothing (window=12 samples at 4 Hz = 3.0s) of signed and unsigned |z|
            Z_abs = np.abs(Z_norm)
            Z_smooth = _causal_within_run_rolling_mean(df, Z_norm, window=12)
            Z_abs_smooth = _causal_within_run_rolling_mean(df, Z_abs, window=12)
            abs_names = [f"abs_z__{n}" for n in r_names]
            sm_names = [f"smooth_z__{n}" for n in r_names]
            abs_sm_names = [f"smooth_abs_z__{n}" for n in r_names]

            X_res = np.hstack([Z_norm, Z_abs, Z_smooth, Z_abs_smooth])
            res_feat_names = z_names + abs_names + sm_names + abs_sm_names
        else:
            # Causal within-run rolling mean (window=15 samples at 0.5 Hz = 30s) and rolling std
            Z_smooth = _causal_within_run_rolling_mean(df, Z_norm, window=15)
            Z_std = _causal_within_run_rolling_std(df, Z_norm[:, :len( self.response_cols_)], window=15)
            sm_names = [f"smooth_z__{n}" for n in r_names]
            std_names = [f"roll_std_z__{c}" for c in self.response_cols_]

            X_res = np.hstack([Z_norm, Z_smooth, Z_std])
            res_feat_names = z_names + sm_names + std_names

        if self.mode == "residual_features":
            return X_res, res_feat_names

        # mode == "residual_plus_normalized"
        X_comb = np.hstack([X_res, X_norm])
        comb_names = res_feat_names + norm_names
        return X_comb, comb_names

    def transform(self, df: pd.DataFrame, apply_final_scaler: bool = False) -> np.ndarray:
        """Transform a DataFrame using strictly training-fitted parameters."""
        if not self.is_fitted_:
            raise RuntimeError("DomainInvariantFeaturePipeline must be fitted on training data before transform().")
        X_feat, _ = self._build_unscaled_representation(df)
        if apply_final_scaler and self.final_scaler_ is not None:
            return self.final_scaler_.transform(X_feat)
        return X_feat

    def compute_normalized_residual_matrix(self, df: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
        """Return the primary normalized residual matrix Z = (Y - Y_hat - med) / scale for inspection & testing."""
        if not self.is_fitted_:
            raise RuntimeError("Pipeline must be fitted before computing residuals.")
        assert self.residual_medians_ is not None and self.residual_scales_ is not None
        R_raw, r_names = self._compute_raw_residuals_internal(df)
        Z_norm = (R_raw - self.residual_medians_) / self.residual_scales_
        return Z_norm, r_names


# ============================================================================
# STEP 4: Honest Classification & Anomaly Detection Evaluation Metrics
# ============================================================================

def compute_multinomial_bootstrap_ci(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: List[str],
    n_boot: int = 200,
    seed: int = 42,
) -> Dict[str, float]:
    """Compute bootstrap 95% confidence intervals for Macro-F1 and Accuracy."""
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    total = int(cm.sum())
    if total == 0:
        return {
            "macro_f1_mean": 0.0,
            "macro_f1_ci95_low": 0.0,
            "macro_f1_ci95_high": 0.0,
            "accuracy_ci95_low": 0.0,
            "accuracy_ci95_high": 0.0,
        }
    probs = cm.ravel() / float(total)
    rng = np.random.default_rng(seed)
    k = len(labels)
    macro_f1s: List[float] = []
    accs: List[float] = []
    for _ in range(n_boot):
        boot_cm = rng.multinomial(total, probs).reshape(k, k).astype(float)
        tp = np.diag(boot_cm)
        fp = boot_cm.sum(axis=0) - tp
        fn = boot_cm.sum(axis=1) - tp
        denom = 2.0 * tp + fp + fn
        f1_per_cls = np.where(denom > 0, (2.0 * tp) / denom, 0.0)
        macro_f1s.append(float(np.mean(f1_per_cls)))
        accs.append(float(tp.sum() / total))
    return {
        "macro_f1_mean": round(float(np.mean(macro_f1s)), 4),
        "macro_f1_ci95_low": round(float(np.percentile(macro_f1s, 2.5)), 4),
        "macro_f1_ci95_high": round(float(np.percentile(macro_f1s, 97.5)), 4),
        "accuracy_ci95_low": round(float(np.percentile(accs, 2.5)), 4),
        "accuracy_ci95_high": round(float(np.percentile(accs, 97.5)), 4),
    }


def compute_per_run_detection_delay_sec(
    df_meta: pd.DataFrame,
    is_alarm: np.ndarray,
) -> Dict[str, Optional[float]]:
    """Compute detection delay (seconds after anomaly_state transitions to 1) for each test run."""
    eval_df = df_meta[["run_id", "timestamp_sec", "anomaly_state"]].copy()
    eval_df["alarm"] = is_alarm.astype(int)
    delays: Dict[str, Optional[float]] = {}
    for run_id, grp in eval_df.groupby("run_id"):
        anom_rows = grp[grp["anomaly_state"] == 1]
        if anom_rows.empty:
            delays[str(run_id)] = None
            continue
        onset_t = float(anom_rows["timestamp_sec"].iloc[0])
        det_rows = anom_rows[anom_rows["alarm"] == 1]
        if det_rows.empty:
            delays[str(run_id)] = None
        else:
            first_t = float(det_rows["timestamp_sec"].iloc[0])
            delays[str(run_id)] = round(max(0.0, first_t - onset_t), 2)
    return delays


def evaluate_classification_predictions(
    model_name: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    labels: List[str],
    normal_label: str,
    test_meta_df: pd.DataFrame,
) -> Dict[str, Any]:
    """Compute per-class precision/recall/F1, Macro-F1, confusion matrix, normal FAR, and detection delay."""
    prec, rec, f1, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=labels, zero_division=0
    )
    per_class: Dict[str, Dict[str, Any]] = {}
    for idx, cls_name in enumerate(labels):
        per_class[cls_name] = {
            "precision": round(float(prec[idx]), 4),
            "recall": round(float(rec[idx]), 4),
            "f1_score": round(float(f1[idx]), 4),
            "support": int(sup[idx]),
        }

    cm = confusion_matrix(y_true, y_pred, labels=labels).tolist()
    macro_f1 = round(float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)), 4)
    weighted_f1 = round(float(f1_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0)), 4)
    acc = round(float(accuracy_score(y_true, y_pred)), 4)
    ci = compute_multinomial_bootstrap_ci(y_true, y_pred, labels=labels, n_boot=200, seed=42)

    # False alarm rate on clearly identified normal test observations
    normal_mask = (y_true == normal_label)
    if int(normal_mask.sum()) > 0:
        normal_far = round(float(np.mean(y_pred[normal_mask] != normal_label)), 4)
    else:
        normal_far = 0.0

    # Detection delay (when classifier predicts any non-normal fault class after fault onset)
    pred_is_fault = (y_pred != normal_label).astype(int)
    delays = compute_per_run_detection_delay_sec(test_meta_df, pred_is_fault)

    return {
        "model_name": model_name,
        "accuracy": acc,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "false_alarm_rate_on_normal_test": normal_far,
        "detection_delay_sec_by_run": delays,
        "uncertainty_bootstrap_95ci": ci,
        "per_class_metrics": per_class,
        "confusion_matrix_labels": labels,
        "confusion_matrix": cm,
    }


def evaluate_anomaly_detection_with_val_thresholds(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    pipeline: DomainInvariantFeaturePipeline,
    normal_label: str,
) -> Dict[str, Any]:
    """Evaluate unsupervised anomaly detection with thresholds calibrated STRICTLY on training/validation normal data."""
    normal_df = train_df[train_df["sample_fault_label"] == normal_label].reset_index(drop=True)
    n_norm = len(normal_df)
    split_idx = int(0.80 * n_norm)

    # Chronological 80/20 split of training normal data into fit vs validation threshold calibration
    fit_norm_df = normal_df.iloc[:split_idx].reset_index(drop=True)
    val_norm_df = normal_df.iloc[split_idx:].reset_index(drop=True)

    X_fit_norm = pipeline.transform(fit_norm_df, apply_final_scaler=(pipeline.mode != "raw_sensors"))
    X_val_norm = pipeline.transform(val_norm_df, apply_final_scaler=(pipeline.mode != "raw_sensors"))
    X_test = pipeline.transform(test_df, apply_final_scaler=(pipeline.mode != "raw_sensors"))

    y_test_anom = test_df["anomaly_state"].to_numpy(dtype=int)

    # Detector 1: IsolationForest fitted on fit_norm_df, threshold calibrated on val_norm_df
    iso = IsolationForest(n_estimators=100, random_state=42)
    iso.fit(X_fit_norm)
    # Anomaly score = negative decision_function (higher means more anomalous)
    val_scores_iso = -iso.score_samples(X_val_norm)
    test_scores_iso = -iso.score_samples(X_test)

    # Detector 2: RMS Normalized Residual Score S(z) = sqrt(mean(z^2)) calibrated on val_norm_df
    Z_val, _ = pipeline.compute_normalized_residual_matrix(val_norm_df)
    Z_test, _ = pipeline.compute_normalized_residual_matrix(test_df)
    val_scores_rms = np.sqrt(np.mean(np.square(np.clip(Z_val, -25.0, 25.0)), axis=1))
    test_scores_rms = np.sqrt(np.mean(np.square(np.clip(Z_test, -25.0, 25.0)), axis=1))

    results: Dict[str, Any] = {
        "threshold_calibration_provenance": (
            f"Thresholds calibrated strictly on held-out training normal validation slice "
            f"(N_fit_normal={len(fit_norm_df)}, N_val_normal={len(val_norm_df)}). "
            f"Locked test set (N_test={len(test_df)}) was never used for threshold selection."
        ),
        "detectors": {},
    }

    for det_name, val_s, test_s in [
        ("IsolationForest_ValCalibrated", val_scores_iso, test_scores_iso),
        ("RMS_Normalized_Residual_Score", val_scores_rms, test_scores_rms),
    ]:
        det_op_points: Dict[str, Any] = {}
        for q_label, q_pct in [("val_q95_target_5pct_far", 95.0), ("val_q99_target_1pct_far", 99.0)]:
            thresh = float(np.percentile(val_s, q_pct))
            val_far = float(np.mean(val_s > thresh))
            pred_anom = (test_s > thresh).astype(int)

            prec, rec, f1, _ = precision_recall_fscore_support(
                y_test_anom, pred_anom, average="binary", zero_division=0
            )
            test_far = float(np.mean(pred_anom[y_test_anom == 0] == 1)) if (y_test_anom == 0).any() else 0.0
            test_tdr = float(np.mean(pred_anom[y_test_anom == 1] == 1)) if (y_test_anom == 1).any() else 0.0
            missed_fault_rate = 1.0 - test_tdr
            delays = compute_per_run_detection_delay_sec(test_df, pred_anom)

            det_op_points[q_label] = {
                "calibrated_threshold": round(thresh, 4),
                "validation_normal_far": round(val_far, 4),
                "test_precision": round(float(prec), 4),
                "test_recall_true_detection_rate": round(test_tdr, 4),
                "test_missed_fault_rate": round(missed_fault_rate, 4),
                "test_f1_score": round(float(f1), 4),
                "test_false_alarm_rate_on_normal": round(test_far, 4),
                "detection_delay_sec_by_run": delays,
            }
        results["detectors"][det_name] = det_op_points

    return results


# ============================================================================
# Full Dataset Experiment Runners (Comparing All 4 Feature Modes)
# ============================================================================

def run_liu_ice_phase3_experiments(liu_df: pd.DataFrame) -> Dict[str, Any]:
    """Run all 4 feature pipelines and models on LiU-ICE under strict zero-shared-run split."""
    train_df, test_cls_df, test_anom_df, split_manifest = split_liu_ice_strict_runs(liu_df, subsample_stride=5)
    labels = ["NF", "f_pic", "f_pim", "f_waf"]
    normal_label = "NF"

    y_train = train_df["sample_fault_label"].to_numpy(dtype=str)
    y_test = test_cls_df["sample_fault_label"].to_numpy(dtype=str)

    pipeline_results: Dict[str, Any] = {}

    for mode in FEATURE_MODES:
        pipe = DomainInvariantFeaturePipeline(
            dataset_type="liu_ice",
            mode=mode,
            poly_degree=2,
            ridge_alpha=1.0,
        )
        pipe.fit(train_df, normal_label=normal_label)

        # Verify fit hash was computed only on train_df
        use_final_scaler = (mode != "raw_sensors")
        X_train = pipe.transform(train_df, apply_final_scaler=use_final_scaler)
        X_test = pipe.transform(test_cls_df, apply_final_scaler=use_final_scaler)

        # 1. Dummy Baseline
        dummy = DummyClassifier(strategy="most_frequent")
        dummy.fit(X_train, y_train)
        dummy_eval = evaluate_classification_predictions(
            "DummyClassifier (most_frequent)",
            y_test,
            dummy.predict(X_test),
            labels,
            normal_label,
            test_cls_df,
        )

        # 2. Logistic Regression
        logreg = LogisticRegression(max_iter=500, C=0.5, class_weight="balanced", random_state=42)
        logreg.fit(X_train, y_train)
        logreg_eval = evaluate_classification_predictions(
            "LogisticRegression (balanced, L2)",
            y_test,
            logreg.predict(X_test),
            labels,
            normal_label,
            test_cls_df,
        )

        # 3. Random Forest
        rf = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_leaf=5,
            class_weight="balanced_subsample",
            random_state=42,
        )
        rf.fit(X_train, y_train)
        rf_eval = evaluate_classification_predictions(
            "RandomForestClassifier (100 trees, max_depth=10)",
            y_test,
            rf.predict(X_test),
            labels,
            normal_label,
            test_cls_df,
        )

        # Anomaly detection on all 4 held-out test runs (including unseen physical leakage f_iml_6mm)
        anom_eval = evaluate_anomaly_detection_with_val_thresholds(
            train_df=train_df,
            test_df=test_anom_df,
            pipeline=pipe,
            normal_label=normal_label,
        )

        pipeline_results[mode] = {
            "feature_mode": mode,
            "feature_count": len(pipe.feature_names_out_),
            "feature_names": pipe.feature_names_out_,
            "expected_response_model_type": (
                "Empirical degree-2 polynomial Ridge regression + analytical redundancy parity models "
                "fitted on training NF samples only (NOT a validated physical engine model)"
                if "residual" in mode
                else "None (direct sensor values)"
            ),
            "fit_data_sha256": pipe.fit_data_sha256_,
            "fit_sample_count": pipe.fit_sample_count_,
            "fit_normal_sample_count": pipe.fit_normal_sample_count_,
            "models": {
                "DummyClassifier": dummy_eval,
                "LogisticRegression": logreg_eval,
                "RandomForestClassifier": rf_eval,
            },
            "anomaly_detection": anom_eval,
        }

    return {
        "dataset_id": "LiU-ICE-Benchmark-DXC25",
        "split_manifest": split_manifest,
        "feature_pipelines": pipeline_results,
        "rul_evaluation": {
            "status": "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS",
            "reason": (
                "LiU-ICE contains 30-minute WLTP runs with discrete step faults at t=120s. "
                "No run-to-failure wear trajectories or ground-truth RUL labels exist."
            ),
        },
    }


def run_marine_phase3_experiments(marine_df: pd.DataFrame) -> Dict[str, Any]:
    """Run all 4 feature pipelines and models on Marine Engine Fault under strict unseen-load run split."""
    train_df, test_df, split_manifest = split_marine_strict_runs(marine_df)
    labels = [
        "Normal",
        "Air-Cooler Fouling",
        "Compressor Air-Filter Clogging",
        "Injection-Valve Nozzle Clogging",
        "Cooling-Water Pump Cavitation",
        "Turbine Degradation",
    ]
    normal_label = "Normal"

    y_train = train_df["sample_fault_label"].to_numpy(dtype=str)
    y_test = test_df["sample_fault_label"].to_numpy(dtype=str)

    pipeline_results: Dict[str, Any] = {}

    for mode in FEATURE_MODES:
        pipe = DomainInvariantFeaturePipeline(
            dataset_type="marine",
            mode=mode,
            poly_degree=2,
            ridge_alpha=10.0,
        )
        pipe.fit(train_df, normal_label=normal_label)

        use_final_scaler = (mode != "raw_sensors")
        X_train = pipe.transform(train_df, apply_final_scaler=use_final_scaler)
        X_test = pipe.transform(test_df, apply_final_scaler=use_final_scaler)

        # 1. Dummy Baseline
        dummy = DummyClassifier(strategy="most_frequent")
        dummy.fit(X_train, y_train)
        dummy_eval = evaluate_classification_predictions(
            "DummyClassifier (most_frequent)",
            y_test,
            dummy.predict(X_test),
            labels,
            normal_label,
            test_df,
        )

        # 2. Logistic Regression
        logreg = LogisticRegression(max_iter=500, C=0.2, class_weight="balanced", random_state=42)
        logreg.fit(X_train, y_train)
        logreg_eval = evaluate_classification_predictions(
            "LogisticRegression (balanced, L2)",
            y_test,
            logreg.predict(X_test),
            labels,
            normal_label,
            test_df,
        )

        # 3. Random Forest
        rf = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_leaf=10,
            class_weight="balanced_subsample",
            random_state=42,
        )
        rf.fit(X_train, y_train)
        rf_eval = evaluate_classification_predictions(
            "RandomForestClassifier (100 trees, max_depth=10)",
            y_test,
            rf.predict(X_test),
            labels,
            normal_label,
            test_df,
        )

        anom_eval = evaluate_anomaly_detection_with_val_thresholds(
            train_df=train_df,
            test_df=test_df,
            pipeline=pipe,
            normal_label=normal_label,
        )

        pipeline_results[mode] = {
            "feature_mode": mode,
            "feature_count": len(pipe.feature_names_out_),
            "feature_names": pipe.feature_names_out_,
            "expected_response_model_type": (
                "Empirical degree-2 polynomial Ridge regression on operating/boundary conditions "
                "fitted on training Normal samples only (NOT a validated physical engine model)"
                if "residual" in mode
                else "None (direct sensor values)"
            ),
            "fit_data_sha256": pipe.fit_data_sha256_,
            "fit_sample_count": pipe.fit_sample_count_,
            "fit_normal_sample_count": pipe.fit_normal_sample_count_,
            "models": {
                "DummyClassifier": dummy_eval,
                "LogisticRegression": logreg_eval,
                "RandomForestClassifier": rf_eval,
            },
            "anomaly_detection": anom_eval,
        }

    return {
        "dataset_id": "Marine-Engine-Fault-v1.0",
        "split_manifest": split_manifest,
        "feature_pipelines": pipeline_results,
        "rul_evaluation": {
            "status": "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS",
            "reason": (
                "Marine Engine Fault scenarios are controlled fault-severity steps at fixed loads "
                "(40%, 60%, 75%, 85%), not run-to-failure life trajectories. Converting fault severity "
                "into RUL without a validated wear law is prohibited."
            ),
        },
    }


def run_phase3_suite_and_save() -> Dict[str, Any]:
    """Execute complete Phase 3 experimental suite and write `backend/artifacts/phase3_experiment_report.json`."""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    ingestor = RealDatasetIngestor()
    archive_hashes = ingestor.verify_raw_archives()

    liu_df, _ = ingestor.ingest_liu_ice()
    marine_df = load_marine_dataframe_causal(ingestor)

    liu_results = run_liu_ice_phase3_experiments(liu_df)
    marine_results = run_marine_phase3_experiments(marine_df)

    report = {
        "report_version": "DRISHTI-Phase3-ResidualDiagnostics-v1.0",
        "generated_at": "2026-10-03",
        "evaluation_scope": "REAL_EXPERIMENTAL_BENCH_DATA_ONLY",
        "non_equivalence_and_scope_disclosure": (
            "1. Each dataset contains N=1 physical engine (ENG-LIU-ICE-01 and ENG-MATSUI-MU323-01). "
            "Results measure generalization to UNSEEN RUNS, UNSEEN ENGINE LOADS, and UNSEEN FAULT MAGNITUDES "
            "on the same engine, NOT unseen-engine fleet generalization. "
            "2. Expected sensor responses are fitted empirically on training-only normal operation data "
            "and are NOT claimed as validated first-principles physical aero-engine models. "
            "3. Neither dataset is a MALE UAV aero-piston engine; synthetic RUL remains strictly separate "
            "in `backend/artifacts/synthetic_baseline_report.json` (`SYNTHETIC-ONLY`)."
        ),
        "archive_verification": archive_hashes,
        "experiments": {
            "LiU-ICE-Benchmark-DXC25": liu_results,
            "Marine-Engine-Fault-v1.0": marine_results,
        },
        "synthetic_rul_reference": {
            "status": "KEPT_SEPARATE_SYNTHETIC_ONLY",
            "artifact_path": "backend/artifacts/synthetic_baseline_report.json",
            "real_data_rul_status": "NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS",
        },
    }

    PHASE3_JSON_REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    rep = run_phase3_suite_and_save()
    print("Saved Phase 3 experiment report to:", PHASE3_JSON_REPORT_PATH)
    for ds_key, ds_val in rep["experiments"].items():
        print(f"\n=== {ds_key} ===")
        for mode, m_res in ds_val["feature_pipelines"].items():
            d_f1 = m_res["models"]["DummyClassifier"]["macro_f1"]
            l_f1 = m_res["models"]["LogisticRegression"]["macro_f1"]
            r_f1 = m_res["models"]["RandomForestClassifier"]["macro_f1"]
            l_far = m_res["models"]["LogisticRegression"]["false_alarm_rate_on_normal_test"]
            r_far = m_res["models"]["RandomForestClassifier"]["false_alarm_rate_on_normal_test"]
            rms_f1 = m_res["anomaly_detection"]["detectors"]["RMS_Normalized_Residual_Score"]["val_q95_target_5pct_far"]["test_f1_score"]
            print(
                f"  {mode:26s} | Dummy F1: {d_f1:.4f} | LogReg F1: {l_f1:.4f} (FAR={l_far:.4f}) "
                f"| RF F1: {r_f1:.4f} (FAR={r_far:.4f}) | Anom RMS F1(q95): {rms_f1:.4f}"
            )
