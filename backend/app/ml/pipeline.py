"""Leak-free ML training, evaluation, and inference pipeline for DRISHTI (SIH26054)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_curve,
    precision_recall_fscore_support,
)
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from backend.app.ml.features import (
    FEATURE_NAMES,
    extract_feature_vector,
    feature_dict_to_array,
)
from backend.app.ml.sensor_fault_isolator import SensorFaultIsolator
from backend.app.physics.engine_model import AeroPistonReferenceModel
from backend.app.simulation.mission_profiles import (
    generate_labeled_training_and_test_datasets,
)
from backend.app.telemetry.schema import (
    CalculatedValues,
    ExpectedValues,
    NINE_FAULT_CLASSES,
    PredictedValues,
    SensorDiagnosisResult,
    TelemetryInputFrame,
    ValidatedTelemetryFrame,
)
from backend.app.telemetry.validator import TelemetryValidator

ML_MODEL_VERSION = "DRISHTI-ML-Ensemble-v1.0"
DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "artifacts"

HEALTH_INDEX_WEIGHTS: Dict[str, float] = {
    "thermal_penalty_weight": 0.30,
    "oil_penalty_weight": 0.30,
    "vibration_penalty_weight": 0.20,
    "anomaly_penalty_weight": 0.20,
}


class DrishtiMLPipeline:
    """Manages 9-class classification, anomaly detection, sensor-fault isolation, RUL, and Health Index."""

    def __init__(self, artifact_dir: Optional[Path] = None) -> None:
        self.model_version = ML_MODEL_VERSION
        self.artifact_dir = artifact_dir or DEFAULT_ARTIFACT_DIR
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        self.model_path = self.artifact_dir / "drishti_ml_bundle.joblib"
        self.report_path = self.artifact_dir / "evaluation_report.json"

        self.scaler: Optional[StandardScaler] = None
        self.classifier: Optional[RandomForestClassifier] = None
        self.anomaly_detector: Optional[IsolationForest] = None
        self.rul_regressor: Optional[RandomForestRegressor] = None
        self.xgb_rul_regressor: Optional[xgb.XGBRegressor] = None
        self.anomaly_threshold: float = 0.0
        self.is_loaded: bool = False
        self.evaluation_report: Dict[str, Any] = {}
        self.sensor_isolator = SensorFaultIsolator()

    def load_or_train(self, force_retrain: bool = False) -> Dict[str, Any]:
        if not force_retrain and self.model_path.exists() and self.report_path.exists():
            try:
                bundle = joblib.load(self.model_path)
                self.scaler = bundle["scaler"]
                self.classifier = bundle["classifier"]
                self.anomaly_detector = bundle["anomaly_detector"]
                self.rul_regressor = bundle["rul_regressor"]
                self.xgb_rul_regressor = bundle.get("xgb_rul_regressor")
                self.anomaly_threshold = float(bundle.get("anomaly_threshold", 0.0))
                self.evaluation_report = json.loads(self.report_path.read_text(encoding="utf-8"))
                self.is_loaded = True
                return self.evaluation_report
            except Exception:
                pass
        return self.train_and_evaluate()

    def _featurize_dataset(
        self,
        records: List[Tuple[TelemetryInputFrame, float]],
    ) -> Tuple[np.ndarray, List[str], np.ndarray, List[str], List[str]]:
        validator = TelemetryValidator()
        ref_model = AeroPistonReferenceModel()
        isolator = SensorFaultIsolator()

        X_rows: List[np.ndarray] = []
        y_class: List[str] = []
        y_rul: List[float] = []
        engine_ids: List[str] = []
        isolator_preds: List[str] = []

        for frame, gt_rul in records:
            v_frame = validator.validate_frame(frame)
            exp = ref_model.estimate_expected(v_frame)
            calc = ref_model.calculate_residuals_and_trends(v_frame, exp)
            s_diag = isolator.diagnose(v_frame, exp, calc)
            feat_dict = extract_feature_vector(v_frame, exp, calc)
            X_rows.append(feature_dict_to_array(feat_dict))
            y_class.append(frame.scenario_label or "Normal")
            y_rul.append(gt_rul)
            engine_ids.append(frame.engine_id)
            isolator_preds.append(
                "Sensor Fault" if s_diag.is_sensor_fault_detected else "Not Sensor Fault"
            )

        return (
            np.vstack(X_rows),
            y_class,
            np.asarray(y_rul, dtype=np.float64),
            engine_ids,
            isolator_preds,
        )

    def train_and_evaluate(self, base_seed: int = 1000) -> Dict[str, Any]:
        train_records, test_records, dataset_manifest = (
            generate_labeled_training_and_test_datasets(base_seed=base_seed)
        )

        X_train_raw, y_train_cls, y_train_rul, train_engines, _ = self._featurize_dataset(
            train_records
        )
        X_test_raw, y_test_cls, y_test_rul, test_engines, test_isolator_preds = (
            self._featurize_dataset(test_records)
        )

        # Verify strict engine-level isolation
        overlap_engines = set(train_engines).intersection(set(test_engines))
        if overlap_engines:
            raise RuntimeError(f"Data leakage detected! Shared engines: {overlap_engines}")

        # 1. Fit StandardScaler strictly on training data
        scaler = StandardScaler()
        X_train = scaler.fit_transform(X_train_raw)
        X_test = scaler.transform(X_test_raw)

        # 2. Train 9-Class RandomForestClassifier
        clf = RandomForestClassifier(
            n_estimators=140,
            max_depth=14,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=1,
        )
        clf.fit(X_train, y_train_cls)

        # Evaluate Classifier on held-out test set
        y_pred_cls = clf.predict(X_test)
        prec, rec, f1, supp = precision_recall_fscore_support(
            y_test_cls,
            y_pred_cls,
            labels=NINE_FAULT_CLASSES,
            zero_division=0,
        )
        macro_f1 = float(f1_score(y_test_cls, y_pred_cls, average="macro", zero_division=0))
        overall_acc = float(accuracy_score(y_test_cls, y_pred_cls))
        cm = confusion_matrix(y_test_cls, y_pred_cls, labels=NINE_FAULT_CLASSES).tolist()

        per_class_metrics: Dict[str, Dict[str, float | int]] = {}
        for idx, cls_name in enumerate(NINE_FAULT_CLASSES):
            per_class_metrics[cls_name] = {
                "precision": round(float(prec[idx]), 4),
                "recall": round(float(rec[idx]), 4),
                "f1": round(float(f1[idx]), 4),
                "support": int(supp[idx]),
            }

        # 3. Train Independent IsolationForest on Normal training samples
        normal_train_mask = np.asarray([c == "Normal" for c in y_train_cls], dtype=bool)
        iso = IsolationForest(
            n_estimators=120,
            contamination=0.01,
            random_state=42,
            n_jobs=1,
        )
        iso.fit(X_train[normal_train_mask])

        # Anomaly score: higher means more anomalous (-decision_function)
        train_norm_scores = -iso.decision_function(X_train[normal_train_mask])
        anomaly_threshold = float(np.percentile(train_norm_scores, 96.0))

        test_anom_scores = -iso.decision_function(X_test)
        y_test_is_anom = np.asarray([1 if c != "Normal" else 0 for c in y_test_cls], dtype=int)
        y_pred_is_anom = (test_anom_scores >= anomaly_threshold).astype(int)

        tp_anom = int(np.sum((y_test_is_anom == 1) & (y_pred_is_anom == 1)))
        fn_anom = int(np.sum((y_test_is_anom == 1) & (y_pred_is_anom == 0)))
        fp_anom = int(np.sum((y_test_is_anom == 0) & (y_pred_is_anom == 1)))
        tn_anom = int(np.sum((y_test_is_anom == 0) & (y_pred_is_anom == 0)))

        anomaly_recall = tp_anom / max(1, tp_anom + fn_anom)
        false_alarm_rate = fp_anom / max(1, fp_anom + tn_anom)
        anomaly_precision = tp_anom / max(1, tp_anom + fp_anom)

        pr_prec, pr_rec, pr_thresh = precision_recall_curve(y_test_is_anom, test_anom_scores)
        step_stride = max(1, len(pr_prec) // 15)
        pr_curve_points = [
            {
                "recall": round(float(pr_rec[i]), 4),
                "precision": round(float(pr_prec[i]), 4),
                "threshold": round(float(pr_thresh[min(i, len(pr_thresh) - 1)]), 4)
                if len(pr_thresh) > 0
                else 0.0,
            }
            for i in range(0, len(pr_prec), step_stride)
        ]

        # 4. Sensor-Fault Isolation Dedicated Evaluation
        y_test_sensor = np.asarray([1 if c == "Sensor Fault" else 0 for c in y_test_cls], dtype=int)
        y_pred_sensor = np.asarray(
            [1 if p == "Sensor Fault" else 0 for p in test_isolator_preds], dtype=int
        )
        sf_tp = int(np.sum((y_test_sensor == 1) & (y_pred_sensor == 1)))
        sf_fp = int(np.sum((y_test_sensor == 0) & (y_pred_sensor == 1)))
        sf_fn = int(np.sum((y_test_sensor == 1) & (y_pred_sensor == 0)))
        sf_prec = sf_tp / max(1, sf_tp + sf_fp)
        sf_rec = sf_tp / max(1, sf_tp + sf_fn)

        # 5. Train RUL Regressor on valid mechanical trajectories (exclude Sensor Fault where gt_rul < 0)
        rul_train_mask = y_train_rul > 0.0
        rul_test_mask = y_test_rul > 0.0

        rul_reg = RandomForestRegressor(
            n_estimators=40,
            max_depth=12,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=1,
        )
        rul_reg.fit(X_train[rul_train_mask], y_train_rul[rul_train_mask])

        xgb_reg = xgb.XGBRegressor(
            n_estimators=90,
            max_depth=6,
            learning_rate=0.06,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            n_jobs=1,
        )
        xgb_reg.fit(X_train[rul_train_mask], y_train_rul[rul_train_mask])

        y_pred_rul = rul_reg.predict(X_test[rul_test_mask])
        rul_mae = float(mean_absolute_error(y_test_rul[rul_test_mask], y_pred_rul))
        rul_rmse = float(np.sqrt(mean_squared_error(y_test_rul[rul_test_mask], y_pred_rul)))

        y_pred_xgb_rul = xgb_reg.predict(X_test[rul_test_mask])
        xgb_rul_mae = float(mean_absolute_error(y_test_rul[rul_test_mask], y_pred_xgb_rul))
        xgb_rul_rmse = float(np.sqrt(mean_squared_error(y_test_rul[rul_test_mask], y_pred_xgb_rul)))

        self.scaler = scaler
        self.classifier = clf
        self.anomaly_detector = iso
        self.rul_regressor = rul_reg
        self.xgb_rul_regressor = xgb_reg
        self.anomaly_threshold = round(anomaly_threshold, 4)
        self.is_loaded = True

        feature_importances = {
            FEATURE_NAMES[i]: round(float(clf.feature_importances_[i]), 4)
            for i in range(len(FEATURE_NAMES))
        }

        ppt_100k_summary: Optional[Dict[str, Any]] = None
        ppt_100k_path = self.artifact_dir / "ppt_100k_evaluation_report.json"
        if ppt_100k_path.exists():
            try:
                ppt_100k_full = json.loads(ppt_100k_path.read_text(encoding="utf-8"))
                ppt_100k_summary = {
                    "report_id": ppt_100k_full.get("report_id"),
                    "dataset_manifest": ppt_100k_full.get("dataset_manifest"),
                    "validation_metrics": ppt_100k_full.get("validation_metrics"),
                    "held_out_test_metrics": ppt_100k_full.get("held_out_test_metrics"),
                    "ppt_target_vs_measured_comparison": ppt_100k_full.get(
                        "ppt_target_vs_measured_comparison"
                    ),
                }
            except Exception:
                ppt_100k_summary = None

        sf_f1 = (2.0 * sf_prec * sf_rec) / max(1e-9, sf_prec + sf_rec)

        report: Dict[str, Any] = {
            "model_version": self.model_version,
            "classifier_held_out_macro_f1": round(macro_f1, 4),
            "xgboost_status": (
                f"xgboost=={xgb.__version__} installed and active (XGBRegressor trained for RUL alongside RandomForestRegressor empirical 10th-90th percentile bounds)."
            ),
            "data_provenance_warning": (
                "ALL metrics in this report are evaluated on DRISHTI-SynthCorpus-v1.0 / DRISHTI-SynthCorpus-100k-v2.0 "
                "(100% synthetic data generated by the project's physics-informed fault simulator). "
                "These metrics reflect model performance on synthetic fault trajectories and do NOT "
                "constitute evidence of flight-certified real-engine diagnostic capability. "
                "Validation on real piston-engine telemetry is required before operational deployment."
            ),
            "feature_names": FEATURE_NAMES,
            "feature_importances": feature_importances,
            "dataset_manifest": dataset_manifest,
            "classification_metrics": {
                "overall_accuracy": round(overall_acc, 4),
                "macro_f1": round(macro_f1, 4),
                "classes": NINE_FAULT_CLASSES,
                "per_class": per_class_metrics,
                "confusion_matrix": cm,
            },
            "anomaly_detection_metrics": {
                "model_type": "IsolationForest",
                "calibrated_threshold": self.anomaly_threshold,
                "recall": round(anomaly_recall, 4),
                "false_alarm_rate": round(false_alarm_rate, 4),
                "precision": round(anomaly_precision, 4),
                "pr_curve": pr_curve_points,
            },
            "sensor_fault_isolation_metrics": {
                "isolator_version": self.sensor_isolator.version,
                "precision": round(sf_prec, 4),
                "recall": round(sf_rec, 4),
                "f1": round(sf_f1, 4),
                "true_positives": sf_tp,
                "false_positives": sf_fp,
                "false_negatives": sf_fn,
            },
            "rul_estimation_metrics": {
                "model_type": f"XGBRegressor (v{xgb.__version__}) + RandomForestRegressor (40 trees, empirical 10th-90th percentile uncertainty)",
                "target_unit": "hours",
                "secondary_unit": "cycles",
                "held_out_mae_hours": round(rul_mae, 3),
                "held_out_rmse_hours": round(rul_rmse, 3),
                "xgboost_held_out_mae_hours": round(xgb_rul_mae, 3),
                "xgboost_held_out_rmse_hours": round(xgb_rul_rmse, 3),
                "evaluated_samples": int(np.sum(rul_test_mask)),
            },
            "health_indicator_config": {
                "weights": HEALTH_INDEX_WEIGHTS,
                "ppt_symbol_mapping": {
                    "alpha": HEALTH_INDEX_WEIGHTS["thermal_penalty_weight"],
                    "beta": HEALTH_INDEX_WEIGHTS["oil_penalty_weight"],
                    "gamma": HEALTH_INDEX_WEIGHTS["vibration_penalty_weight"],
                    "delta": HEALTH_INDEX_WEIGHTS["anomaly_penalty_weight"],
                },
                "formula": "HI = clip(100 - (0.30*P_thermal + 0.30*P_oil + 0.20*P_vib + 0.20*P_anom), 0, 100)",
                "disclosure": "Composite engineering health index; not a calibrated probability of failure.",
            },
            "ppt_100k_evaluation": ppt_100k_summary,
        }

        self.evaluation_report = report
        joblib.dump(
            {
                "model_version": self.model_version,
                "scaler": scaler,
                "classifier": clf,
                "anomaly_detector": iso,
                "rul_regressor": rul_reg,
                "xgb_rul_regressor": xgb_reg,
                "anomaly_threshold": self.anomaly_threshold,
                "feature_names": FEATURE_NAMES,
            },
            self.model_path,
        )
        self.report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report

    @staticmethod
    def compute_health_indicator(
        calculated: CalculatedValues,
        anomaly_score: float,
        anomaly_threshold: float,
    ) -> Tuple[float, Dict[str, float]]:
        p_thermal = 100.0 * min(
            1.0,
            max(0.0, (abs(calculated.cht_residual_c) - 6.0) / 40.0)
            + max(0.0, (abs(calculated.egt_residual_c) - 20.0) / 110.0),
        )
        p_oil = 100.0 * min(
            1.0,
            max(0.0, (-calculated.oil_pressure_residual_bar - 0.18) / 1.6)
            + max(0.0, (calculated.oil_temp_residual_c - 5.0) / 30.0),
        )
        p_vib = 100.0 * min(
            1.0,
            max(0.0, (calculated.vibration_residual_mms - 0.35) / 5.0),
        )
        norm_anom = max(0.0, min(1.0, (anomaly_score - (anomaly_threshold - 0.08)) / 0.25))
        p_anom = 100.0 * norm_anom

        weighted_penalty = (
            HEALTH_INDEX_WEIGHTS["thermal_penalty_weight"] * p_thermal
            + HEALTH_INDEX_WEIGHTS["oil_penalty_weight"] * p_oil
            + HEALTH_INDEX_WEIGHTS["vibration_penalty_weight"] * p_vib
            + HEALTH_INDEX_WEIGHTS["anomaly_penalty_weight"] * p_anom
        )
        hi = round(max(0.0, min(100.0, 100.0 - weighted_penalty)), 1)
        breakdown = {
            "thermal_health_subscore": round(100.0 - p_thermal, 1),
            "oil_system_subscore": round(100.0 - p_oil, 1),
            "vibration_mechanical_subscore": round(100.0 - p_vib, 1),
            "anomaly_subscore": round(100.0 - p_anom, 1),
        }
        return hi, breakdown

    def predict_point(
        self,
        actual: ValidatedTelemetryFrame,
        expected: ExpectedValues,
        calculated: CalculatedValues,
    ) -> PredictedValues:
        if not self.is_loaded or self.scaler is None or self.classifier is None:
            # Graceful unavailable-artifact handling
            s_diag = self.sensor_isolator.diagnose(actual, expected, calculated)
            hi, breakdown = self.compute_health_indicator(calculated, 0.0, 0.05)
            return PredictedValues(
                model_version="UNAVAILABLE_MODEL_ARTIFACT",
                timestamp=actual.timestamp,
                source="FALLBACK_RULE_ONLY",
                is_valid=False,
                predicted_fault_class="Sensor Fault"
                if s_diag.is_sensor_fault_detected
                else "Normal",
                diagnosis_certainty_status="UNCERTAIN_INSUFFICIENT_EVIDENCE",
                top_probability=0.0,
                class_probabilities={c: 0.0 for c in NINE_FAULT_CLASSES},
                is_anomaly=False,
                anomaly_score=0.0,
                anomaly_threshold=0.0,
                sensor_diagnosis=s_diag,
                rul_status="NOT_ESTIMABLE",
                rul_hours=None,
                rul_lower_10_hours=None,
                rul_upper_90_hours=None,
                rul_unit="hours",
                rul_cycles=None,
                rul_lower_10_cycles=None,
                rul_upper_90_cycles=None,
                rul_cycle_unit="cycles",
                rul_reason="Trained ML model artifact is not loaded.",
                health_index=hi,
                health_breakdown=breakdown,
            )

        s_diag: SensorDiagnosisResult = self.sensor_isolator.diagnose(
            actual, expected, calculated
        )
        feat_dict = extract_feature_vector(actual, expected, calculated)
        x_arr = feature_dict_to_array(feat_dict).reshape(1, -1)
        x_scaled = self.scaler.transform(x_arr)

        probs_raw = self.classifier.predict_proba(x_scaled)[0]
        classes_list = list(self.classifier.classes_)
        prob_map: Dict[str, float] = {
            c: 0.0 for c in NINE_FAULT_CLASSES
        }
        for c_name, p_val in zip(classes_list, probs_raw):
            prob_map[str(c_name)] = round(float(p_val), 4)

        # Determine top predicted class and certainty status
        sorted_probs = sorted(prob_map.items(), key=lambda kv: kv[1], reverse=True)
        top_class, top_prob = sorted_probs[0]

        certainty_status = "CONFIDENT_DIAGNOSIS"
        if s_diag.is_sensor_fault_detected:
            # Separate sensor-quality diagnosis from engine-condition diagnosis
            top_class = "Sensor Fault"
            top_prob = max(top_prob, s_diag.confidence)
            prob_map["Sensor Fault"] = round(top_prob, 4)
            certainty_status = "SENSOR_FAULT_OVERRIDE"
        elif s_diag.is_ambiguous:
            certainty_status = "UNCERTAIN_INSUFFICIENT_EVIDENCE"
        elif not actual.quality.is_valid or actual.quality.quality_score < 0.65:
            certainty_status = "DEGRADED_INPUT_QUALITY"
        elif top_prob < 0.42:
            certainty_status = "UNCERTAIN_INSUFFICIENT_EVIDENCE"

        # Anomaly detector inference
        assert self.anomaly_detector is not None
        anom_score = float(-self.anomaly_detector.decision_function(x_scaled)[0])
        has_nontrivial_residual = (
            abs(calculated.cht_residual_c) > 7.5
            or abs(calculated.egt_residual_c) > 22.0
            or abs(calculated.oil_pressure_residual_bar) > 0.25
            or abs(calculated.oil_temp_residual_c) > 5.0
            or abs(calculated.vibration_residual_mms) > 0.45
            or abs(calculated.fuel_flow_residual_lph) > 1.4
        )
        is_anomaly = bool(
            (anom_score >= self.anomaly_threshold and has_nontrivial_residual)
            or top_class != "Normal"
            or s_diag.is_sensor_fault_detected
        )

        # RUL Estimation with NOT_ESTIMABLE gating
        rul_status = "ESTIMATED"
        rul_hours: Optional[float] = None
        rul_low: Optional[float] = None
        rul_high: Optional[float] = None
        rul_cycles: Optional[float] = None
        rul_low_cycles: Optional[float] = None
        rul_high_cycles: Optional[float] = None
        rul_reason = "Estimated from XGBoost + ensemble degradation regressor."

        if (
            s_diag.is_sensor_fault_detected
            or s_diag.is_ambiguous
            or len(actual.quality.invalid_sensor_channels) > 0
            or len(actual.quality.missing_fields) > 1
            or actual.quality.is_duplicate
            or actual.quality.is_out_of_order
        ):
            rul_status = "NOT_ESTIMABLE"
            rul_reason = (
                "RUL not estimable due to active sensor fault, ambiguous instrumentation evidence, or invalid telemetry frame."
            )
        else:
            assert self.rul_regressor is not None
            x_f32 = np.ascontiguousarray(x_scaled, dtype=np.float32)
            tree_preds = np.asarray(
                [float(est.tree_.predict(x_f32)[0, 0]) for est in self.rul_regressor.estimators_],
                dtype=np.float64,
            )
            rf_mean_rul = float(np.mean(tree_preds))
            if self.xgb_rul_regressor is not None:
                xgb_pred = float(
                    self.xgb_rul_regressor.get_booster().inplace_predict(x_f32)[0]
                )
                mean_rul = 0.5 * xgb_pred + 0.5 * rf_mean_rul
            else:
                mean_rul = rf_mean_rul
            p10_rul = float(np.percentile(tree_preds, 10.0))
            p90_rul = float(np.percentile(tree_preds, 90.0))

            rul_hours = round(max(0.5, mean_rul), 2)
            rul_low = round(max(0.2, min(rul_hours, p10_rul)), 2)
            rul_high = round(max(rul_hours, p90_rul), 2)

            # Convert hours to mission cycles via thermal-mechanical stress factor kappa
            u_load = max(0.1, min(1.25, actual.engine_load_pct / 100.0))
            kappa = max(0.75, min(1.45, 0.85 + 0.30 * (u_load / 0.75) * (max(80.0, actual.cht_c) / 175.0)))
            rul_cycles = round(rul_hours * kappa, 1)
            rul_low_cycles = round(rul_low * kappa, 1)
            rul_high_cycles = round(rul_high * kappa, 1)

            if top_class == "Normal" and not is_anomaly:
                rul_reason = f"Nominal operation within scheduled TBO horizon (~{rul_cycles} cycles / {rul_hours} hours)."
            else:
                rul_reason = f"Active degradation trajectory ({top_class}); {rul_cycles} cycles ({rul_hours} hrs), 10th-90th interval [{rul_low}, {rul_high}] hours."

        hi, breakdown = self.compute_health_indicator(
            calculated, anom_score, self.anomaly_threshold
        )

        return PredictedValues(
            model_version=self.model_version,
            timestamp=actual.timestamp,
            source="ML_INFERENCE_PIPELINE",
            is_valid=actual.quality.is_valid and not s_diag.is_sensor_fault_detected,
            predicted_fault_class=top_class,
            diagnosis_certainty_status=certainty_status,  # type: ignore[arg-type]
            top_probability=round(float(top_prob), 4),
            class_probabilities=prob_map,
            is_anomaly=is_anomaly,
            anomaly_score=round(anom_score, 4),
            anomaly_threshold=self.anomaly_threshold,
            sensor_diagnosis=s_diag,
            rul_status=rul_status,  # type: ignore[arg-type]
            rul_hours=rul_hours,
            rul_lower_10_hours=rul_low,
            rul_upper_90_hours=rul_high,
            rul_unit="hours",
            rul_cycles=rul_cycles,
            rul_lower_10_cycles=rul_low_cycles,
            rul_upper_90_cycles=rul_high_cycles,
            rul_cycle_unit="cycles",
            rul_reason=rul_reason,
            health_index=hi,
            health_breakdown=breakdown,
        )
