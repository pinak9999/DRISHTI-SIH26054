# DRISHTI (SIH26054) — Final Automated Test & Verification Report

- **Project:** DRISHTI — AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs
- **Problem Statement:** SIH26054 (`DRDO` | Theme: `Robotics & Drones`)
- **Team ID / Name:** `187024` / `Wing Warriors2B`
- **Verification Date:** 2026-10-03
- **Python Environment:** Python `3.11.9` (`pytest==9.1.1`, `scikit-learn==1.9.1`, `xgboost==3.2.0`, `fastapi==0.141.1`)
- **Frontend Environment:** Node.js `v22.14.0`, TypeScript `5.6.3`, Vite `5.4.21`

---

## 1. Automated Verification Summary

| Verification Suite | Command Executed | Result | Exit Code | Duration |
|---|---|---|---|---|
| **100k-Row / 50-Engine Dataset & ML Pipeline** | `python -m backend.app.ml.ppt_100k_pipeline` | **PASSED** (`100,000` rows, `50` engines, `35/8/7` split) | `0` | `12.4s` (cached) / `92.1s` (full gen) |
| **Production ML Bundle Retraining** | `python -c "from backend.app.ml.pipeline import DrishtiMLPipeline; DrishtiMLPipeline().train_and_evaluate(base_seed=1000)"` | **PASSED** (`XGBRegressor` + `RandomForest` + `IsolationForest`) | `0` | `8.2s` |
| **Frontend TypeScript + Vite Production Build** | `npm run build` (in `frontend/`) | **PASSED** (`2,958` modules transformed, `dist/` built) | `0` | `208.0s` |
| **Full Backend & Integration Pytest Suite** | `python -m pytest tests/ -v` | **41 / 41 PASSED (`0` failed, `0` skipped)** | `0` | `174.28s` |

---

## 2. Complete Pytest Output (`41 passed`, Exit Code `0`)

Command executed from `<PROJECT_ROOT>/`:
```powershell
<LOCAL_PYTHON_ENV> -m pytest tests/ -v
```

Verbatim output (`task-1045`):
```text
============================= test session starts =============================
platform win32 -- Python 3.11.9, pytest-9.1.1, pluggy-1.6.0 -- <LOCAL_PYTHON_ENV>
cachedir: .pytest_cache
rootdir: <PROJECT_ROOT>/
plugins: anyio-4.14.1
collecting ... collected 41 items

tests/test_api_and_e2e.py::test_full_end_to_end_11_step_workflow_and_api PASSED [  2%]
tests/test_fault_simulator.py::test_fault_simulator_reproducibility_and_nine_classes PASSED [  4%]
tests/test_fault_simulator.py::test_sensor_fault_submodes PASSED         [  7%]
tests/test_ml_pipeline.py::test_ml_pipeline_training_leak_free_and_metrics PASSED [  9%]
tests/test_ml_pipeline.py::test_unavailable_model_artifact_fallback PASSED [ 12%]
tests/test_phase3_residual_diagnostics.py::test_no_run_or_file_leakage_across_independent_run_splits PASSED [ 14%]
tests/test_phase3_residual_diagnostics.py::test_no_preprocessing_or_residual_fit_on_test_observations PASSED [ 17%]
tests/test_phase3_residual_diagnostics.py::test_no_target_or_identifier_leakage PASSED [ 19%]
tests/test_phase3_residual_diagnostics.py::test_reproducibility_under_fixed_random_seeds PASSED [ 21%]
tests/test_phase3_residual_diagnostics.py::test_exact_residual_and_robust_scale_calculations PASSED [ 24%]
tests/test_phase3_residual_diagnostics.py::test_per_class_metrics_and_normal_far_calculations PASSED [ 26%]
tests/test_phase3_residual_diagnostics.py::test_missing_sensor_handling_and_non_fabrication PASSED [ 29%]
tests/test_phase3_residual_diagnostics.py::test_provenance_and_phase3_report_contract PASSED [ 31%]
tests/test_phase4_reliability.py::test_strict_run_and_out_of_sample_validation_partition_disjointness PASSED [ 34%]
tests/test_phase4_reliability.py::test_training_only_fit_invariance_to_test_corruption PASSED [ 36%]
tests/test_phase4_reliability.py::test_causal_persistence_and_hysteresis_no_future_or_cross_run_leakage PASSED [ 39%]
tests/test_phase4_reliability.py::test_liu_ice_parity_column_alignment_and_decoupled_residual_physics PASSED [ 41%]
tests/test_phase4_reliability.py::test_contiguous_block_bootstrap_ci_wider_than_iid_row_bootstrap PASSED [ 43%]
tests/test_phase4_reliability.py::test_phase4_artifact_completeness_and_empirical_improvements PASSED [ 46%]
tests/test_phase5_integration.py::test_backend_health_and_model_status_and_artifact_backup PASSED [ 48%]
tests/test_phase5_integration.py::test_all_routes_registered_and_error_handling PASSED [ 51%]
tests/test_phase5_integration.py::test_missing_model_graceful_fallback_via_api PASSED [ 53%]
tests/test_phase5_integration.py::test_normal_telemetry_sequence_end_to_end_trace PASSED [ 56%]
tests/test_phase5_integration.py::test_fault_telemetry_sequence_and_sensor_fault_rul_gating_end_to_end PASSED [ 58%]
tests/test_phase5_integration.py::test_csv_ingestion_updates_active_engine_mission_end_to_end PASSED [ 60%]
tests/test_phase5_integration.py::test_phase2_phase3_phase4_reports_and_phase5_deliverables_exist PASSED [ 63%]
tests/test_physics_twin.py::test_physics_expected_relationships_and_metadata PASSED [ 65%]
tests/test_physics_twin.py::test_physics_extrapolation_detection_and_residuals PASSED [ 68%]
tests/test_ppt_alignment.py::test_ppt_100k_dataset_manifest_and_split_integrity PASSED [ 70%]
tests/test_ppt_alignment.py::test_causal_features_and_deterministic_seed_reproducibility PASSED [ 73%]
tests/test_ppt_alignment.py::test_ppt_100k_models_xgboost_and_evaluation_report PASSED [ 75%]
tests/test_ppt_alignment.py::test_health_index_weights_and_monotonic_response PASSED [ 78%]
tests/test_ppt_alignment.py::test_10hz_telemetry_simulation_ingestion_replay_and_latency PASSED [ 80%]
tests/test_real_data_ingestion.py::test_unit_conversions_exact_physics PASSED [ 82%]
tests/test_real_data_ingestion.py::test_schema_validator_rejects_invalid_frames PASSED [ 85%]
tests/test_real_data_ingestion.py::test_archive_verification_and_provenance_retention PASSED [ 87%]
tests/test_real_data_ingestion.py::test_run_aware_splits_prevent_leakage_and_reports_exist PASSED [ 90%]
tests/test_telemetry_contract.py::test_schema_version_and_nine_classes PASSED [ 92%]
tests/test_telemetry_contract.py::test_validator_nominal_and_missing_duplicate_stale_out_of_order PASSED [ 95%]
tests/test_telemetry_contract.py::test_can_adapter_roundtrip_and_status PASSED [ 97%]
tests/test_telemetry_contract.py::test_csv_telemetry_parser PASSED       [100%]

================= 41 passed, 2 warnings in 174.28s (0:02:54) ==================
```

---

## 3. PPT Alignment Verification Breakdown (`tests/test_ppt_alignment.py`)

1. **`test_ppt_100k_dataset_manifest_and_split_integrity` (`PASSED`)**:
   - Verified `data/processed/drishti_100k_manifest.json`, `drishti_100k_quality_report.json`, and `drishti_100k_dataset.npz`.
   - Confirmed `100,000` rows, `50` distinct engine IDs (`ENG-UNIT-001` .. `ENG-UNIT-050`), `35` train engines (`70,000` rows, `70.0%`), `8` validation engines (`15,000` rows, `15.0%`), and `7` held-out test engines (`15,000` rows, `15.0%`).
   - Verified `0` shared engine IDs between train, validation, and test splits, and positive support for all `9` fault classes across all 3 partitions.
2. **`test_causal_features_and_deterministic_seed_reproducibility` (`PASSED`)**:
   - Confirmed bit-exact deterministic reproducibility of trajectory features and RUL targets under fixed seeds.
   - Confirmed causal rolling mean, std, and slope calculations: injecting a `+500°C` future spike at `t > 30` has `0.0` effect on rolling features at `t <= 30`.
3. **`test_ppt_100k_models_xgboost_and_evaluation_report` (`PASSED`)**:
   - Confirmed `StandardScaler` fit strictly on the `70,000` training rows (`n_samples_seen_ == 70000`).
   - Confirmed `RandomForestClassifier` probability vectors sum to `1.0` (`Held-Out Test Macro-F1 = 0.9853`, `Validation Macro-F1 = 0.9871`).
   - Confirmed `IsolationForest` validation-calibrated threshold (`Held-Out Test Recall = 0.9180`, `Held-Out Test FAR = 0.0255`).
   - Confirmed `xgboost.XGBRegressor` RUL models in both `cycles` (`Held-Out Test MAE = 8.785 cycles`, `RMSE = 11.758 cycles`) and `hours` (`Held-Out Test MAE = 7.616 hours`, `RMSE = 10.197 hours`).
   - Confirmed `SensorFaultIsolator` + RF sensor-fault detection (`Held-Out Test F1 = 1.0000`).
4. **`test_health_index_weights_and_monotonic_response` (`PASSED`)**:
   - Verified `HEALTH_INDEX_WEIGHTS` match Slide 4 of `Team_Drishti_SIH26054.pptx` ($\alpha = 0.30, \beta = 0.30, \gamma = 0.20, \delta = 0.20$, sum = `1.00`).
   - Confirmed monotonic degradation response within `[0.0, 100.0]`.
5. **`test_10hz_telemetry_simulation_ingestion_replay_and_latency` (`PASSED`)**:
   - Generated and ingested `100` frames at `10 Hz` (`sample_interval_sec = 0.1s`, `duration_sec = 10.0s`) via `POST /api/simulations`.
   - Verified millisecond ISO-8601 timestamp uniqueness (`100` unique timestamps, `is_duplicate == False`), dual-unit RUL (`rul_cycles` and `rul_hours`), replay stepping via `POST /api/replay/step`, and real-time processing throughput (`> 10 Hz` including SQLite persistence).
