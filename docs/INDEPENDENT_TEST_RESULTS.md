# DRISHTI SIH26054 — Independent Test & Verification Execution Results

**Date:** 2026-10-04  
**Project Root:** `<PROJECT_ROOT>/`  
**Problem Statement:** SIH26054 — DRDO | **Team ID:** 187024 (`Wing Warriors2B`)

---

## 1. Execution Environment & Installed Tooling Versions

| Component / Package | Verified Version | Verification Command |
| --- | --- | --- |
| **Operating System** | Windows 10 / 11 (`AMD64`, `win32`) | `python -c "import platform; print(platform.platform())"` |
| **Python Interpreter** | `Python 3.11.4` | `python --version` |
| **Pytest Runner** | `pytest 9.0.2` (`pluggy-1.6.0`, `anyio-4.12.1`) | `python -m pytest --version` |
| **FastAPI / Starlette / Pydantic** | `fastapi==0.109.2`, `pydantic==2.6.1`, `uvicorn==0.27.1` | `requirements.txt` & runtime import |
| **Machine Learning Stack** | `scikit-learn==1.4.0`, `xgboost==3.2.0`, `numpy==1.26.4`, `scipy==1.12.0`, `joblib==1.3.2` | `python -c "import sklearn, xgboost, numpy; ..."` |
| **Frontend Compiler & Bundler** | `TypeScript 5.x` (`tsc`) + `Vite v5.4.21` (`React 18.2`, `Three.js`, `Recharts`) | `npm run build` |

---

## 2. Automated Backend & ML Verification Suite (`pytest`)

### 2.1 Command & Exit Status
- **Command Executed:**
  ```powershell
  python -m pytest tests/ -v
  ```
- **Working Directory:** `<PROJECT_ROOT>/`
- **Exit Code:** `0`
- **Summary:** **`41 passed, 2 warnings in 174.28s (0:02:54)`**

### 2.2 Complete Test-by-Test Breakdown (`41 / 41 Passed`)

| Test File | Test Function | Result | Progress | What Is Verified |
| --- | --- | :---: | :---: | --- |
| `tests/test_drishti_suite.py` | `test_physics_baseline_altitude_and_load_response` | `PASSED` | `[  2%]` | ISA atmosphere density ratio, turbo boost, CHT/EGT/oil pressure response, and `is_extrapolated=True` above `7,000 m`. |
| `tests/test_drishti_suite.py` | `test_deterministic_simulator_reproducibility` | `PASSED` | `[  4%]` | Identical `random_seed` produces bit-identical telemetry trajectories and fault onset profiles. |
| `tests/test_drishti_suite.py` | `test_ml_pipeline_held_out_evaluation_and_no_leakage` | `PASSED` | `[  7%]` | 54-trajectory suite train/val/test split has zero trajectory leakage (`Macro-F1 = 0.8950`, `RUL MAE = 3.93 h`). |
| `tests/test_drishti_suite.py` | `test_sensor_fault_isolator_detects_spike_and_drift` | `PASSED` | `[  9%]` | `SensorFaultIsolator` distinguishes single-channel sensor faults from multi-channel physical engine faults. |
| `tests/test_drishti_suite.py` | `test_end_to_end_api_and_persistence_flow` | `PASSED` | `[ 12%]` | SQLite WAL persistence, `/api/fleet`, `/api/predict`, `/api/simulations`, `/api/missions`, and `/api/reports`. |
| `tests/test_phase2_real_data.py` | `test_verified_raw_dataset_files_exist` | `PASSED` | `[ 14%]` | Verified raw files for `LiU-ICE` (`2025`) and `Marine Engine Fault` (`2024`) exist on disk with valid SHA-256 hashes. |
| `tests/test_phase2_real_data.py` | `test_canonical_schema_adaptation_and_provenance` | `PASSED` | `[ 17%]` | Real-data ingestion tags every record with `EXTERNAL_BENCHMARK` and dataset provenance. |
| `tests/test_phase2_real_data.py` | `test_quality_checks_and_saved_quality_report` | `PASSED` | `[ 19%]` | Verified row counts (`96,005` LiU-ICE rows; `6,500` Marine rows), missingness (`0`), and sampling rates. |
| `tests/test_phase2_real_data.py` | `test_no_leakage_splits_and_real_data_evaluation` | `PASSED` | `[ 21%]` | Strict physical-run separation (`0` shared runs between train/val/test) on both external datasets. |
| `tests/test_phase2_real_data.py` | `test_saved_evaluation_report_matches_verified_constraints` | `PASSED` | `[ 24%]` | Confirms `rul_evaluated=False` on non-run-to-failure external datasets and checks saved metrics. |
| `tests/test_phase3_diagnostics.py` | `test_split_integrity_and_zero_run_leakage` | `PASSED` | `[ 26%]` | Confirms zero physical-run or speed-condition overlap across Phase 3 generalization splits. |
| `tests/test_phase3_diagnostics.py` | `test_residual_pipeline_fits_strictly_on_training_normal_rows` | `PASSED` | `[ 29%]` | Proves Polynomial Ridge expected-value models are fitted exclusively on `train` normal rows. |
| `tests/test_phase3_diagnostics.py` | `test_residual_consistency_within_numerical_precision` | `PASSED` | `[ 31%]` | Verifies `residual == actual - expected` within `1e-9` across all real-data channels. |
| `tests/test_phase3_diagnostics.py` | `test_validation_threshold_calibration_does_not_use_test_data` | `PASSED` | `[ 34%]` | Confirms anomaly thresholds are calibrated strictly on validation sets. |
| `tests/test_phase3_diagnostics.py` | `test_saved_phase3_report_reproducibility_and_schema` | `PASSED` | `[ 36%]` | Validates `phase3_generalization_report.json` schema and metric reproducibility. |
| `tests/test_phase4_reliability.py` | `test_phase3_exact_reproducibility` | `PASSED` | `[ 39%]` | Independently reproduces Phase 3 baseline metrics before Phase 4 reliability upgrades. |
| `tests/test_phase4_reliability.py` | `test_zero_run_and_window_leakage_across_splits` | `PASSED` | `[ 41%]` | Verifies temporal window extraction (`W=20`) never crosses run boundaries or split boundaries. |
| `tests/test_phase4_reliability.py` | `test_residual_pipeline_and_scaler_fit_strictly_on_train` | `PASSED` | `[ 43%]` | Confirms scalers and baseline regressors fit only on training data. |
| `tests/test_phase4_reliability.py` | `test_validation_only_threshold_and_temperature_calibration` | `PASSED` | `[ 46%]` | Verifies temperature scaling and OOD energy thresholds use only validation data. |
| `tests/test_phase4_reliability.py` | `test_corrupted_sensor_fault_isolation_and_abstain_behavior` | `PASSED` | `[ 48%]` | Confirms OOD/corrupted inputs trigger `ABSTAIN_OOD_OR_CORRUPTED` or `SENSOR_FAULT` isolation. |
| `tests/test_phase4_reliability.py` | `test_marine_holdout_and_liu_loco_improvement_verified` | `PASSED` | `[ 51%]` | Confirms Phase 4 temporal + Physics-Informed features improve Marine (`0.9612` F1) and LiU-ICE LOCO (`0.7857` F1). |
| `tests/test_phase5_integration.py` | `test_backend_health_and_model_loaded` | `PASSED` | `[ 53%]` | `GET /health` and `GET /api/model-status` return `200 OK` with loaded physics and ML bundles. |
| `tests/test_phase5_integration.py` | `test_all_29_routes_registered` | `PASSED` | `[ 56%]` | Confirms all `29` REST + WebSocket routes are registered on the FastAPI app. |
| `tests/test_phase5_integration.py` | `test_six_engine_fleet_seeded_and_all_have_four_value_state` | `PASSED` | `[ 58%]` | Confirms 6-engine fleet (`ENG-MALE-01`..`06`), 4-value twin state, and `cht_residual = actual - expected`. |
| `tests/test_phase5_integration.py` | `test_normal_simulation_e2e_flow` | `PASSED` | `[ 60%]` | Normal mission simulation produces `0` alerts, `Normal` class, and `HI >= 80`. |
| `tests/test_phase5_integration.py` | `test_fault_simulation_and_alert_generation` | `PASSED` | `[ 63%]` | Controlled fault injection (`Cylinder Overheating`) triggers alerts, `is_anomaly=True`, and deterministic replay. |
| `tests/test_phase5_integration.py` | `test_predict_endpoint_with_correct_enum` | `PASSED` | `[ 65%]` | `POST /api/predict` returns 4-value `twin_state` in `< 500 ms` (`~9.5 ms` actual). |
| `tests/test_phase5_integration.py` | `test_replay_controls_with_fault_mission` | `PASSED` | `[ 68%]` | `/api/replay/start`, `/step`, `/seek`, `/status`, `/stop` operate accurately on persisted missions. |
| `tests/test_phase5_integration.py` | `test_websocket_streams_twin_state_frames` | `PASSED` | `[ 70%]` | `/ws/telemetry?engine_id=ENG-MALE-01` streams live `telemetry_frame` JSON payloads. |
| `tests/test_phase5_integration.py` | `test_error_handling_404_and_422` | `PASSED` | `[ 73%]` | Unknown engine/report/simulation IDs return `404`; invalid schema enums return `422`. |
| `tests/test_ppt_alignment.py` | `test_100k_dataset_and_50_engine_integrity` | `PASSED` | `[ 75%]` | Confirms `drishti_100k_dataset.npz` has `100,000` rows, `50` engines, `17` features, `9` classes, `0` NaNs. |
| `tests/test_ppt_alignment.py` | `test_engine_level_70_15_15_split_zero_leakage` | `PASSED` | `[ 78%]` | Confirms `70,000` train (`35` engines), `15,000` val (`8` engines), `15,000` test (`7` engines), `0` overlap. |
| `tests/test_ppt_alignment.py` | `test_ppt_100k_models_and_metrics_verified` | `PASSED` | `[ 80%]` | Verifies `RandomForest`, `IsolationForest` (`3%` val FAR), `XGBRegressor` (cycles & hours), and 9×9 confusion matrix. |
| `tests/test_ppt_alignment.py` | `test_hybrid_health_index_weights_030_030_020_020` | `PASSED` | `[ 82%]` | Confirms `HEALTH_INDEX_WEIGHTS = (0.30, 0.30, 0.20, 0.20)` and exact formula math. |
| `tests/test_ppt_alignment.py` | `test_xgboost_rul_regressor_and_cycles_hours_outputs` | `PASSED` | `[ 85%]` | Confirms live `DrishtiMLPipeline` uses `xgb.XGBRegressor` and outputs both `rul_cycles` and `rul_hours`. |
| `tests/test_ppt_alignment.py` | `test_can_bus_29bit_extended_frame_encoding_and_decoding` | `PASSED` | `[ 87%]` | Confirms 29-bit extended-ID `SocketCAN` binary packing/unpacking round-trip integrity. |
| `tests/test_ppt_alignment.py` | `test_ten_hz_simulation_and_ingestion_support` | `PASSED` | `[ 90%]` | Confirms `10 Hz` (`sample_interval_sec=0.1`) simulation and ingestion (`50` frames for `5.0 s`). |
| `tests/test_ppt_alignment.py` | `test_altitude_sweep_and_isa_extrapolation_flag` | `PASSED` | `[ 92%]` | Confirms `0–10,000 m` (`0–32,808 ft`) sweep and `is_extrapolated` boundary at `7,000 m`. |
| `tests/test_ppt_alignment.py` | `test_mission_readiness_decision_thresholds` | `PASSED` | `[ 95%]` | Verifies `GO`, `GO WITH PRECAUTION`, and `NO-GO / ABORT RECOMMENDED` decision boundaries. |
| `tests/test_ppt_alignment.py` | `test_api_model_status_exposes_ppt_100k_and_health_weights` | `PASSED` | `[ 97%]` | Confirms `/api/model-status` returns `ppt_100k_evaluation_report` and `health_index_weights`. |
| `tests/test_ppt_alignment.py` | `test_four_value_twin_state_includes_rul_cycles_and_breakdown` | `PASSED` | `[100%]` | Confirms `/api/predict` returns `rul_cycles`, `rul_hours`, and `health_breakdown` with `0.30/0.30/0.20/0.20`. |

### 2.3 Non-Fatal Warnings Observed During Pytest
1. `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` (Standard FastAPI `0.109.2` / Starlette `TestClient` notice).
2. `UserWarning: [17:41:28] WARNING: C:\actions-runner\_work\xgboost\xgboost\src\data\iterative_dmatrix.cc:352:Generating SparsePage with single batch.` (Optimized out of single-frame live inference via `Booster.inplace_predict(x_f32)` in `backend/app/ml/pipeline.py`).

---

## 3. Frontend TypeScript & Vite Production Build Verification

- **Command Executed:**
  ```powershell
  npm run build
  ```
- **Working Directory:** `<PROJECT_ROOT>/frontend`
- **Exit Code:** `0`
- **Verbatim Output:**
  ```text
  > drishti-digital-twin-ui@1.0.0 build
  > tsc && vite build

  vite v5.4.21 building for production...
  transforming...
  ✓ 2958 modules transformed.
  rendering chunks...
  computing gzip size...
  dist/index.html                     0.46 kB │ gzip:   0.33 kB
  dist/assets/index-BcbpkqKt.css      8.81 kB │ gzip:   2.31 kB
  dist/assets/index-B9C4fx8H.js   1,508.82 kB │ gzip: 409.74 kB
  ✓ built in 5m 53s
  ```

---

## 4. Independent Dataset & Model Verification Summary

| Verification Target | Verified Artifact | Key Verified Metrics |
| --- | --- | --- |
| **100k-Row / 50-Engine Corpus** | `data/processed/drishti_100k_dataset.npz` (`SHA-256: b3cd16e66fb5be3deee50d8627739df15630a5a8529686f5f949a01f9bd7be1c`) | `100,000` rows, `50` engines (`2,000` rows/engine), `17` features, `9` classes (`49,330` normal, `50,670` fault), `0` NaN/Inf, `0` shared engines across `70,000` / `15,000` / `15,000` splits. |
| **100k-Row Model Evaluation** | `backend/artifacts/ppt_100k_evaluation_report.json` & `ppt_100k_ml_bundle.joblib` | Held-out test (`15,000` rows, `7` unseen engines): **RF Macro-F1 = `0.9853`** (`Accuracy = 0.9866`), **Isolation Forest Recall = `0.9180`** (`Val FAR = 0.0301`, `Test FAR = 0.0255`), **XGBoost RUL MAE = `8.785 cycles` / `4.294 h`**, **RMSE = `11.758 cycles` / `5.752 h`**, **Sensor Fault F1 = `1.0000`**. |
| **54-Trajectory Live-Twin Bundle** | `backend/artifacts/drishti_ml_bundle.joblib` & `ml_evaluation_report.json` | Held-out test (`1,095` frames across `18` trajectories): **RF Macro-F1 = `0.8950`**, **Isolation Forest Recall = `0.8781`**, **XGBoost RUL MAE = `7.86 cycles` / `3.93 h`**, **RMSE = `10.17 cycles` / `5.08 h`**, **Sensor Fault F1 = `0.9600`**. |
| **Live API & Latency Check** | `GET /api/engines/ENG-MALE-01/health` & `POST /api/predict` | Single-frame inference latency **`~9.5 ms`** (`< 100 ms` real-time budget); returns `rul_cycles`, `rul_hours`, `health_breakdown` (`0.30/0.30/0.20/0.20`), and 4-value `twin_state`. |
