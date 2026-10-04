# DRISHTI SIH26054 — Independent Code Audit, Claim Verification & Release Certification

**Problem Statement ID:** `SIH26054` (DRDO)  
**Title:** *AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs*  
**Project Root:** `<PROJECT_ROOT>/`  
**Audit Date:** `2026-10-04`  
**Audit Role:** Independent Senior Software Auditor, ML Validation Engineer, QA Lead & Aerospace Digital Twin Systems Reviewer

---

## 1. Executive Verdict

### **VERDICT: `READY WITH LIMITATIONS`**

- **Why `READY WITH LIMITATIONS` (and not `NOT READY` or unqualified `READY`):**
  1. **Software, Hybrid Digital Twin & Test Suite Readiness (`READY`):** The complete FastAPI + SQLite WAL backend ([backend/app/main.py](backend/app/main.py), [backend/app/service.py](backend/app/service.py), [backend/app/db/database.py](backend/app/db/database.py)), 10-screen React 18 / TypeScript / Three.js / Recharts workstation ([frontend/src/App.tsx](frontend/src/App.tsx)), physics reference model ([backend/app/physics/engine_model.py](backend/app/physics/engine_model.py)), 17-feature ML inference pipeline ([backend/app/ml/pipeline.py](backend/app/ml/pipeline.py)), 100k-row / 50-engine benchmark ([backend/app/ml/ppt_100k_pipeline.py](backend/app/ml/ppt_100k_pipeline.py)), and external experimental dataset evaluators ([backend/app/ml/phase4_reliability.py](backend/app/ml/phase4_reliability.py)) are implemented, integrated, and pass all **46 automated pytest tests (`0` failures)** and the **production TypeScript/Vite frontend build (`npm run build`, exit code `0`)**.
  2. **Defects Caught & Remediated During This Audit:**
     - **Defect 1 (In-Memory Health Policy & Missing Validation):** `self.health_policy` in [backend/app/service.py](backend/app/service.py) was previously held only in RAM and clamped negative weights to `0.0` rather than rejecting invalid weights or inverted readiness thresholds (`precaution_min_health_index >= go_min_health_index`). **Fixed in Phase 5:** Added SQLite `system_config` table persistence in [backend/app/db/database.py](backend/app/db/database.py), strict `HTTP 422` validation, and automatic fleet Health Index recalculation on policy update.
     - **Defect 2 (Discrepancies Between Previous Summary Report & Actual External Dataset Artifacts):** The previous completion summary misquoted external dataset row counts and Macro-F1 scores (`Marine 17,010 rows / 0.9612 F1` and `LiU-ICE 360,337 rows / 0.7857 F1`) and mis-cited several internal module filenames (`physics_model.py`, `train_and_infer.py`, `repository.py`). Inspection of the actual artifacts ([data/processed/real_data_quality_report.json](data/processed/real_data_quality_report.json) and [backend/artifacts/phase4_experiment_report.json](backend/artifacts/phase4_experiment_report.json)) established the true verified external dataset numbers (`Marine-Engine-Fault-v1.0`: `114,770` rows across `16` runs, 6-class LR `Macro-F1 = 0.5742` / `Bal Acc = 0.6486`, Schmitt-trigger hysteresis binary fault detection `0.00%` Normal FAR across `7/7` detected fault runs & `0.7518` Bal Acc; `LiU-ICE-Benchmark-DXC25`: `288,623` rows across `8` WLTP runs, 4-class unsigned residual LR `Macro-F1 = 0.5874` / `Bal Acc = 0.6903`, `0.90%` Normal FAR, `0.9950` opposite-sign `f_pic` recall). **Fixed in Phase 5:** Updated Screen 10 ([frontend/src/screens/RulEvalAndReportsScreens.tsx](frontend/src/screens/RulEvalAndReportsScreens.tsx)) and [docs/SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md](docs/SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md) to match the exact verified artifacts, and fixed `{report.xgboost_status}` rendering on Screen 8.
     - **Defect 3 (Release ZIP Missing Root `requirements.txt` & `data/processed/`):** Repackaged [DRISHTI_SIH26054_VERIFIED.zip](DRISHTI_SIH26054_VERIFIED.zip) to include root [requirements.txt](requirements.txt), [.env.example](.env.example), `data/processed/` manifests/quality reports, and this independent audit report.
  3. **Aerospace & Domain Limitations (`WITH LIMITATIONS`):**
     - No physical MALE UAV Rotax 914 engine or hardware CAN bus transceiver is connected (`ModularSocketCANAdapter` runs in `SOFTWARE_CODEC_READY_NO_HARDWARE` mode).
     - The `0.9853` (`100k` benchmark) and `0.9769` (`54-trajectory` suite) Macro-F1 scores and RUL MAE (`8.782 cycles` / `2.800 hours`) are measured on **100% synthetic physics-informed telemetry**, NOT on real aircraft flight logs.
     - Real experimental engine benchmarks (`LiU-ICE-Benchmark-DXC25` automotive SI bench and `Marine-Engine-Fault-v1.0` marine diesel bench) contain `1` physical engine each and do not include run-to-failure RUL ground truth.

---

## 2. File Inventory & Release ZIP Verification

### 2.1 Verified Project Root & File Inventory (`<PROJECT_ROOT>/`)
- **Real Project Root:** `<PROJECT_ROOT>/` (`106` tracked project files excluding `node_modules`, `dist`, `__pycache__`, `.pytest_cache`).
- **Backend Source Modules (`backend/app/`, `24` Python files):**
  - Entrypoint & API Router: [backend/app/main.py](backend/app/main.py) (`create_app()`, `26` REST/WebSocket/static routes)
  - Core Orchestration Service: [backend/app/service.py](backend/app/service.py) (`DrishtiTwinService`, `FLEET_DEFINITIONS`)
  - SQLite Persistence: [backend/app/db/database.py](backend/app/db/database.py) (`DrishtiDatabase`)
  - Physics Reference Twin: [backend/app/physics/engine_model.py](backend/app/physics/engine_model.py) (`AeroPistonReferenceModel`, version `Rotax914-Simplified-Ref-v1.0`)
  - Telemetry Contract, Validator & CAN Codec: [backend/app/telemetry/schema.py](backend/app/telemetry/schema.py), [backend/app/telemetry/validator.py](backend/app/telemetry/validator.py) (`TelemetryValidator`), [backend/app/telemetry/can_adapter.py](backend/app/telemetry/can_adapter.py) (`ModularSocketCANAdapter`, `parse_csv_telemetry`)
  - Simulation & Replay: [backend/app/simulation/fault_simulator.py](backend/app/simulation/fault_simulator.py) (`DeterministicFaultSimulator`, `SIH26054_EIGHT_FAULT_CATEGORY_MAPPING`, `SIH26054_EIGHT_PARAMETER_GROUPS_SPEC`), [backend/app/simulation/mission_profiles.py](backend/app/simulation/mission_profiles.py), [backend/app/simulation/replay_manager.py](backend/app/simulation/replay_manager.py) (`MissionReplayController`)
  - Explainable Alerts: [backend/app/alerts/alert_engine.py](backend/app/alerts/alert_engine.py) (`ExplainableAlertEngine`)
  - ML & External Data Pipelines: [backend/app/ml/features.py](backend/app/ml/features.py) (`FEATURE_NAMES`, `17` features), [backend/app/ml/pipeline.py](backend/app/ml/pipeline.py) (`DrishtiMLPipeline`), [backend/app/ml/ppt_100k_pipeline.py](backend/app/ml/ppt_100k_pipeline.py), [backend/app/ml/sensor_fault_isolator.py](backend/app/ml/sensor_fault_isolator.py) (`SensorFaultIsolator`), [backend/app/data_ingestion/real_data_pipeline.py](backend/app/data_ingestion/real_data_pipeline.py), [backend/app/ml/real_data_evaluator.py](backend/app/ml/real_data_evaluator.py), [backend/app/ml/phase3_residual_diagnostics.py](backend/app/ml/phase3_residual_diagnostics.py), [backend/app/ml/phase4_reliability.py](backend/app/ml/phase4_reliability.py)
- **Model & Evaluation Artifacts (`backend/artifacts/`):**
  - [backend/artifacts/drishti_ml_bundle.joblib](backend/artifacts/drishti_ml_bundle.joblib) (Live-twin 54-trajectory bundle)
  - [backend/artifacts/ppt_100k_ml_bundle.joblib](backend/artifacts/ppt_100k_ml_bundle.joblib) (100k-row / 50-engine benchmark bundle)
  - [backend/artifacts/evaluation_report.json](backend/artifacts/evaluation_report.json)
  - [backend/artifacts/ppt_100k_evaluation_report.json](backend/artifacts/ppt_100k_evaluation_report.json)
  - [backend/artifacts/real_data_evaluation_report.json](backend/artifacts/real_data_evaluation_report.json)
  - [backend/artifacts/phase3_experiment_report.json](backend/artifacts/phase3_experiment_report.json)
  - [backend/artifacts/phase4_experiment_report.json](backend/artifacts/phase4_experiment_report.json)
  - [backend/artifacts/phase5_release_checklist.json](backend/artifacts/phase5_release_checklist.json)
- **Datasets (`data/`):**
  - Raw external benchmark archives (`data/raw/liu_ice/dxc25liu-ice-main.zip`, `17,814,194` bytes; `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip`, `26,538,633` bytes)
  - Processed synthetic & real quality manifests ([data/processed/drishti_100k_dataset.npz](data/processed/drishti_100k_dataset.npz), [data/processed/drishti_100k_manifest.json](data/processed/drishti_100k_manifest.json), [data/processed/drishti_100k_quality_report.json](data/processed/drishti_100k_quality_report.json), [data/processed/real_data_quality_report.json](data/processed/real_data_quality_report.json))
- **Frontend Source (`frontend/src/`, `9` TypeScript/CSS files):**
  - [frontend/src/App.tsx](frontend/src/App.tsx), [frontend/src/api/client.ts](frontend/src/api/client.ts), [frontend/src/components/Engine3DViewport.tsx](frontend/src/components/Engine3DViewport.tsx), [frontend/src/screens/FleetAndTwinScreens.tsx](frontend/src/screens/FleetAndTwinScreens.tsx), [frontend/src/screens/DiagnosticsAndSimScreens.tsx](frontend/src/screens/DiagnosticsAndSimScreens.tsx), [frontend/src/screens/RulEvalAndReportsScreens.tsx](frontend/src/screens/RulEvalAndReportsScreens.tsx), [frontend/src/types/telemetry.ts](frontend/src/types/telemetry.ts), [frontend/src/styles/workstation.css](frontend/src/styles/workstation.css)
- **Automated Test Suite (`tests/`, `11` pytest files, `46` tests total):**
  - [tests/test_api_and_e2e.py](tests/test_api_and_e2e.py), [tests/test_fault_simulator.py](tests/test_fault_simulator.py), [tests/test_ml_pipeline.py](tests/test_ml_pipeline.py), [tests/test_phase3_residual_diagnostics.py](tests/test_phase3_residual_diagnostics.py), [tests/test_phase4_reliability.py](tests/test_phase4_reliability.py), [tests/test_phase5_integration.py](tests/test_phase5_integration.py), [tests/test_physics_twin.py](tests/test_physics_twin.py), [tests/test_ppt_alignment.py](tests/test_ppt_alignment.py), [tests/test_real_data_ingestion.py](tests/test_real_data_ingestion.py), [tests/test_sih26054_acceptance_suite.py](tests/test_sih26054_acceptance_suite.py), [tests/test_telemetry_contract.py](tests/test_telemetry_contract.py)

---

## 3. Requirement-by-Requirement SIH26054 Traceability Matrix

| Req ID | Official SIH26054 Requirement | Actual Code Location & Symbols | Verification Test | Audit Status |
| :--- | :--- | :--- | :--- | :---: |
| **A** | Target MALE UAV Aero-Piston Engine Digital Twin (`Rotax 914 UL/F` class) | [`AeroPistonReferenceModel`](backend/app/physics/engine_model.py#L46-L245) in [backend/app/physics/engine_model.py](backend/app/physics/engine_model.py) | `tests/test_physics_twin.py` | **PASS** *(Analytical Ref Model)* |
| **B** | All 8 Required Propulsion Parameter Groups (`RPM`, `CHT`, `EGT`, `Oil P/T`, `Fuel`, `Vib`, `Batt/Alt`, `Inj. Timing`) | [`SIH26054_EIGHT_PARAMETER_GROUPS_SPEC`](backend/app/simulation/fault_simulator.py#L228-L362), [`evaluate_engine_parameter_groups()`](backend/app/service.py#L728-L875), `GET /api/engines/{id}/parameter-groups`, [`TelemetryExplorerScreen`](frontend/src/screens/FleetAndTwinScreens.tsx#L304-L535) | `test_06_all_eight_parameter_groups_monitored` | **PASS** |
| **C** | Real-Time 4-Value Twin State (`Actual`, `Expected`, `Calculated`, `Predicted`) | [`FourValueDigitalTwinState`](backend/app/telemetry/schema.py#L180-L195), [`process_telemetry_frame()`](backend/app/service.py#L249-L274), `/ws/telemetry` | `test_six_engine_fleet_seeded_and_all_have_four_value_state` | **PASS** |
| **D** | Hybrid Physics + AI/ML Pipeline (17-feature residual vector, RF, IsolationForest, XGBoost RUL, SensorFaultIsolator) | [`DrishtiMLPipeline`](backend/app/ml/pipeline.py#L55-L591), [backend/app/ml/ppt_100k_pipeline.py](backend/app/ml/ppt_100k_pipeline.py) | `tests/test_ml_pipeline.py`, `tests/test_ppt_alignment.py` | **PASS** |
| **E** | All 8 Intended Fault Categories + `"Coding degradation" -> Cooling degradation` Disclosure + Explainable Alerts | [`SIH26054_EIGHT_FAULT_CATEGORY_MAPPING`](backend/app/simulation/fault_simulator.py#L121-L225), [`ExplainableAlertEngine`](backend/app/alerts/alert_engine.py#L22-L185), [`FaultInvestigationScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L38-L420) | `test_07_all_eight_fault_categories_and_cooling_degradation_mapping` | **PASS** |
| **F** | RUL Estimation (`cycles` & `hours`), Configurable Health Index ($\alpha,\beta,\gamma,\delta$) & `GO / PRECAUTION / NO-GO` Thresholds | [`get_health_policy()`](backend/app/service.py#L629-L633), [`update_health_policy()`](backend/app/service.py#L635-L700), `GET/PUT /api/config/health-policy`, [`PredictiveMaintenanceRulScreen`](frontend/src/screens/RulEvalAndReportsScreens.tsx#L31-L447) | `test_09_configurable_health_index_weights_and_readiness_thresholds` | **PASS** *(Fixed SQLite persistence & 422 validation)* |
| **G** | What-If Mission Simulator (7 profiles, Baseline vs. Post-Scenario Table) & Historical Replay with Restart | [`DeterministicFaultSimulator`](backend/app/simulation/fault_simulator.py#L365-L710), [`MissionReplayController`](backend/app/simulation/replay_manager.py#L13-L144), [`MissionSimulatorScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L425-L935), [`HistoricalMissionReplayScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L940-L1288) | `test_11_14_18_environmental_profiles_maintenance_and_report_export`, `test_replay_controls_with_fault_mission` | **PASS** |
| **H** | Dataset Governance, Engine/Run-Disjoint Splits & Zero Data Leakage | [tests/test_ml_pipeline.py](tests/test_ml_pipeline.py), [tests/test_phase4_reliability.py](tests/test_phase4_reliability.py) | `test_strict_engine_level_split_and_no_leakage` | **PASS** |
| **I–N** | 10-Screen Tactical UI, `/health`, `/ready`, `.env.example`, Provenance Badges | [frontend/src/App.tsx](frontend/src/App.tsx), [backend/app/main.py](backend/app/main.py), [.env.example](.env.example) | `test_01_02_startup_health_and_readiness_probes` | **PASS** |

---

## 4. Phase 2 Report-Claim Verification Matrix

| # | Report Claim Investigated | Initial Audit Status | Final Post-Fix Status | Exact Files, Symbols & Evidence Observed |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **46 automated tests passing** | **PASS** | **PASS** | `11` test files in `tests/` (`5` in `test_api_and_e2e.py`, `4` in `test_fault_simulator.py`, `4` in `test_ml_pipeline.py`, `6` in `test_phase3_residual_diagnostics.py`, `5` in `test_phase4_reliability.py`, `9` in `test_phase5_integration.py`, `3` in `test_physics_twin.py`, `3` in `test_ppt_alignment.py`, `1` in `test_real_data_ingestion.py`, `5` in `test_sih26054_acceptance_suite.py`, `1` in `test_telemetry_contract.py` = **`46` tests**). All `46` pass (`0` failures). |
| **2** | **Frontend production build succeeds** | **PASS** | **PASS** | Executed `npm run build` (`tsc && vite build`) in `frontend/`. Exited with code `0` (`0` TypeScript or Rollup errors), emitting `frontend/dist/index.html` and hashed JS/CSS bundles. |
| **3** | **`/ready` readiness endpoint works correctly** | **PASS** | **PASS** | Implemented at [`readiness_check()`](backend/app/main.py#L81-L101) in [backend/app/main.py](backend/app/main.py). Verified via `GET /ready` in `test_01_02_startup_health_and_readiness_probes` (`status="ready"`, `database_ready=True`, `ml_bundle_ready=True`, `physics_model_ready=True`, `seeded_engine_count=6`, `HTTP 503` if subsystems unready). |
| **4** | **Health-policy GET/PUT APIs persist and validate their settings** | **PARTIAL** *(Defect Found)* | **PASS** *(Fixed & Regression-Tested)* | Initially stored only in RAM (`self.health_policy`) and clamped negative weights via `max(0.0, ...)` without validating threshold ordering. **Fixed in Phase 5:** Added SQLite `system_config` table in [backend/app/db/database.py](backend/app/db/database.py#L118-L122), strict `HTTP 422` validation on negative weights / inverted thresholds in [`update_health_policy()`](backend/app/service.py#L635-L700), and verified persistence across service re-instantiation in `test_09_configurable_health_index_weights_and_readiness_thresholds`. |
| **5** | **All eight required engine parameter groups are implemented** | **PASS** | **PASS** | Defined in [`SIH26054_EIGHT_PARAMETER_GROUPS_SPEC`](backend/app/simulation/fault_simulator.py#L228-L362), evaluated live in [`evaluate_engine_parameter_groups()`](backend/app/service.py#L728-L875), exposed at `GET /api/engines/{engine_id}/parameter-groups`, and rendered on Screen 3 ([`TelemetryExplorerScreen`](frontend/src/screens/FleetAndTwinScreens.tsx#L304-L535)). |
| **6** | **All eight required fault categories map correctly to the problem statement** | **PASS** | **PASS** | Defined in [`SIH26054_EIGHT_FAULT_CATEGORY_MAPPING`](backend/app/simulation/fault_simulator.py#L121-L225) (including explicit mapping of official PS typo `"Coding degradation"` to **Cooling degradation**), exposed via `GET /api/catalog`, and rendered on Screen 4 ([`FaultInvestigationScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L255-L326)). |
| **7** | **Mission baseline-versus-scenario comparison works** | **PASS** | **PASS** | Rendered in [`MissionSimulatorScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L862-L930) comparing baseline physics expected / initial $t=0\text{s}$ Health Index against post-scenario measured CHT, EGT, Oil Pressure, Vibration RMS, and final Health Index. |
| **8** | **Telemetry replay restart controls function correctly** | **PASS** | **PASS** | Implemented in [`HistoricalMissionReplayScreen`](frontend/src/screens/DiagnosticsAndSimScreens.tsx#L1084-L1092) calling `handleLoadAndStart(0, false)` (`POST /api/replay/start` with `start_index=0`) and verified in `test_replay_controls_with_fault_mission`. |
| **9** | **System status and technical documentation screens are connected and usable** | **PARTIAL** *(Hardcoded table mismatch)* | **PASS** *(Fixed)* | [`SystemStatusAndTechDocsScreen`](frontend/src/screens/RulEvalAndReportsScreens.tsx#L1047-L1315) is wired to tab `10. Data Sources & Tech Docs` in [frontend/src/App.tsx](frontend/src/App.tsx#L73-L79). Updated hardcoded row counts and F1 numbers in the Dataset Provenance Register table to match the exact JSON artifacts. |
| **10** | **FastAPI backend and React frontend communicate correctly** | **PASS** | **PASS** | Typed client in [frontend/src/api/client.ts](frontend/src/api/client.ts) matches all FastAPI routes in [backend/app/main.py](backend/app/main.py), including `/ws/telemetry` WebSocket streaming and static serving of `frontend/dist`. |
| **11** | **ML models and scalers load correctly and use the expected feature schema** | **PASS** *(17 features)* | **PASS** | Both `drishti_ml_bundle.joblib` and `ppt_100k_ml_bundle.joblib` load cleanly with `StandardScaler`, `RandomForestClassifier`, `IsolationForest`, `RandomForestRegressor`, and `xgb.XGBRegressor` using the exact **17-feature** schema (`FEATURE_NAMES` in [backend/app/ml/features.py](backend/app/ml/features.py)). *(Note: The previous report text mistakenly wrote "37 features" in one table cell; the actual code and model bundles use 17 features).* |
| **12** | **Synthetic benchmark and external dataset evaluation results are reproducible from supplied artifacts** | **PARTIAL** *(External metrics misquoted in report)* | **PASS** *(Corrected)* | Synthetic `100k` and `54-trajectory` metrics match [ppt_100k_evaluation_report.json](backend/artifacts/ppt_100k_evaluation_report.json) and [evaluation_report.json](backend/artifacts/evaluation_report.json) to 4 decimal places. External `Marine` and `LiU-ICE` numbers in the previous summary report did NOT match [phase4_experiment_report.json](backend/artifacts/phase4_experiment_report.json) and have now been corrected across all docs and UI screens (see Section 6 below). |

---

## 5. Test and Build Commands Executed, Results & Environment Details

### 5.1 Execution Environment
- **OS:** Windows (`win32`)
- **Python:** `Python 3.11.9` (`pytest-9.1.1`, `pluggy-1.6.0`, `xgboost 3.2.0`, `numpy 1.26.4`, `fastapi`, `pydantic v2`)
- **Node / Frontend Tooling:** `TypeScript 5.x`, `Vite 5.4.21`

### 5.2 Executed Commands & Verified Results
1. **Acceptance & Regression Test Suite (`task-1322`):**
   - **Command:** `python -m pytest tests/test_sih26054_acceptance_suite.py -v`
   - **Result:** `5 passed, 1 warning` (Exit Code `0`), verifying `/health`, `/ready`, all 8 parameter groups, all 8 fault categories, SQLite health-policy persistence across service restarts, `HTTP 422` rejection on negative weights and inverted thresholds, environmental profiles, and report exports.
2. **Phase 5 Integration & PPT Alignment Suite (`task-1254`):**
   - **Command:** `python -m pytest tests/test_sih26054_acceptance_suite.py tests/test_phase5_integration.py tests/test_ppt_alignment.py -v`
   - **Result:** `17 passed, 1 warning in 355.18s` (Exit Code `0`).
3. **Full 11-File Repository Test Suite (`46` Tests):**
   - **Command:** `python -m pytest tests/ -v`
   - **Result:** `46 passed` across all 11 test files (Exit Code `0`).
4. **Production Frontend Typecheck & Bundle Build (`task-1323`):**
   - **Command:** `npm run build` (in `<PROJECT_ROOT>/frontend`)
   - **Result:** `tsc && vite build` succeeded with `0` errors (Exit Code `0`).

---

## 6. Phase 3 Honest ML Metric & Leakage Forensic Audit

| Claimed Metric in Previous Report | Audit Status | Actual Verified Value in Repository Artifacts | Forensic Explanation & Leakage Assessment |
| :--- | :---: | :--- | :--- |
| **Synthetic 100k Benchmark (`DRISHTI-SynthCorpus-100k-v2.0`):** Accuracy `0.9825`, Macro-F1 `0.9853` | **PASS (Verified)** | **Accuracy = `0.9825`**<br>**Macro-F1 = `0.9853`**<br>([ppt_100k_evaluation_report.json](backend/artifacts/ppt_100k_evaluation_report.json#L484-L487)) | Evaluated on `15,000` held-out test rows from `7` unseen engines (`ENG-UNIT-044`..`050`), trained on `35` engines (`70,000` rows), validated on `8` engines (`15,000` rows). `StandardScaler` fit strictly on training split. Zero shared engines (`shared_engines_train_test = 0`). **100% synthetic data.** |
| **Synthetic 100k Anomaly Detection:** Recall `0.9180`, False-Alarm Rate `0.0255` | **PASS (Verified)** | **Recall = `0.9180`** (`11,210 / 12,211` TP)<br>**Test FAR = `0.0255`** (`71 / 2,789` FP)<br>**Val FAR = `0.0301`** | `IsolationForest` fit strictly on `Normal` training frames; threshold `-0.0038` calibrated on `Normal` validation frames (`ENG-UNIT-036`..`043`) without touching test labels. |
| **Synthetic 100k RUL (`XGBRegressor`):** MAE `8.782 cycles`, RMSE `11.732 cycles` | **PASS (Verified)** | **MAE = `8.782 cycles` (`7.571 hours`)**<br>**RMSE = `11.732 cycles` (`10.163 hours`)**<br>(`N = 13,449` mechanical test frames) | `Sensor Fault` frames (`1,551` test rows where mechanical RUL is undefined) are properly excluded from RUL training/evaluation (`sensor_fault_excluded_from_rul = true`). Units (`cycles` and `hours`) are consistent via stress factor $\kappa$. |
| **Live-Twin Suite (`DRISHTI-SynthCorpus-v1.0`):** Macro-F1 `0.9769`, Accuracy `0.9738`, Anomaly Recall `0.8875`, RUL MAE `2.8 hours` | **PASS (Metrics Verified; Row Count Corrected)** | **Macro-F1 = `0.9769`**, **Acc = `0.9738`**<br>**Anomaly Recall = `0.8875`**, **FAR = `0.0119`**<br>**XGBoost RUL MAE = `2.800 hours`** (`RF MAE = 2.805 hours`)<br>**Rows:** `1,296` train / `648` test (`1,944` total) | All four performance metrics in [evaluation_report.json](backend/artifacts/evaluation_report.json) match exactly (`36` train trajectories / `18` test trajectories, `0` shared engines). Note: The previous report prose misstated the row counts as `2,175 / 1,095`; actual row counts are `1,296` train and `648` test. |
| **Marine Engine Fault 2024:** `"17,010 rows, 17 runs, macro-F1 0.9612, balanced accuracy 0.9619"` | **FAIL (Misquoted in Previous Report — Corrected)** | **Actual Dataset (`Marine-Engine-Fault-v1.0`):**<br>• **`114,770` total rows** across **`16` runs** (`9` train = `70,711` rows, `7` test = `44,059` rows, `0` shared runs)<br>• **6-Class Supervised LR:** **Macro-F1 = `0.5742`**, **Balanced Accuracy = `0.6486`** (`Acc = 0.6164`)<br>• **Schmitt-Trigger Hysteresis Binary Fault Detector (`q99/q95, k=3`):** **Normal FAR = `0.00%`** across all `7/7` test runs, **Sample Recall = `50.37%`**, **Anomaly F1 = `0.6699`**, **Balanced Accuracy = `0.7518`**, **`0/7` missed fault runs** | Verified in [data/processed/real_data_quality_report.json](data/processed/real_data_quality_report.json#L254-L322) and [docs/PHASE4_EXPERIMENT_REPORT.md](docs/PHASE4_EXPERIMENT_REPORT.md#L149-L168). Under strict physical-run holdout across unseen engine loads (`60%` and `85%`), 6-class Macro-F1 is `0.5742` (`Injection-Valve Nozzle Clogging F1 = 0.9999`, `Normal F1 = 0.7099`, `Cooling-Water Pump Cavitation F1 = 0.6333`), NOT `0.9612`. |
| **LiU-ICE 2025:** `"360,337 rows, four tests, leave-one-condition-out macro-F1 0.7857 and balanced accuracy 0.7681"` | **FAIL (Misquoted in Previous Report — Corrected)** | **Actual Dataset (`LiU-ICE-Benchmark-DXC25`):**<br>• **`288,623` total rows** across **`8` WLTP runs** (`4` train = `125,265` rows, `4` test = `125,346` rows; `1` single-run class `wltp_f_iml_6mm` = `36,012` rows excluded; `stride=5` locked test `N = 21,657`)<br>• **4-Class Phase 4 Unsigned Decoupled Residual LR:** **Macro-F1 = `0.5874`**, **Balanced Accuracy = `0.6903`** (`Acc = 0.6170`), **Normal FAR = `0.90%`**, **`f_pic` (`+10%` opposite-sign gain) Recall = `0.9950` (`F1 = 0.9918`)** | Verified in [data/processed/real_data_quality_report.json](data/processed/real_data_quality_report.json#L19-L58) and [docs/PHASE4_EXPERIMENT_REPORT.md](docs/PHASE4_EXPERIMENT_REPORT.md#L105-L144). Because WLTP idle/deceleration segments have low manifold pressure variation where `-10% p_im` and `+10% W_af` overlap normal variance, point-wise 4-class Macro-F1 is `0.5874` (up from `0.2594` in Phase 3), NOT `0.7857`. |

---

## 7. Security & Configuration Audit

1. **Secrets & Credentials Check (`PASS`):**
   - Inspected all files in `backend/`, `frontend/`, `docs/`, and [.env.example](.env.example). Zero hardcoded API keys, tokens, passwords, or private keys exist in the repository.
2. **SQL Injection & Input Validation (`PASS`):**
   - All SQLite queries in [backend/app/db/database.py](backend/app/db/database.py) use parameterized `?` placeholders (`conn.execute(..., (...))`).
   - All telemetry inputs (`POST /api/predict`, `POST /api/simulations`, `PUT /api/config/health-policy`) enforce strict Pydantic / numerical bounds and return `HTTP 422` on malformed or out-of-range payloads.
3. **CORS & Authentication Disclosure (`PROTOTYPE LIMITATION`):**
   - `CORSMiddleware` in [backend/app/main.py](backend/app/main.py#L46-L52) uses `allow_origins=["*"]` for local hackathon workstation convenience, and REST endpoints do not enforce JWT/mTLS authentication. For operational defence deployment, origin allowlisting and mTLS/RBAC must be enabled.

---

## 8. Summary of Confirmed Defects, Fixes & Regression Tests

| Defect ID | Description | Files Modified | Regression Verification |
| :---: | :--- | :--- | :--- |
| **DEF-01** | `GET/PUT /api/config/health-policy` stored policy only in RAM, clamped negative weights instead of returning `422`, did not validate `precaution_min_health_index < go_min_health_index`, and did not recalculate stored fleet Health Indices. | [backend/app/db/database.py](backend/app/db/database.py), [backend/app/service.py](backend/app/service.py), [tests/test_sih26054_acceptance_suite.py](tests/test_sih26054_acceptance_suite.py) | `test_09_configurable_health_index_weights_and_readiness_thresholds` (`PASSED`) |
| **DEF-02** | Screen 10 Dataset Provenance table and `SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md` contained unverified row counts and Macro-F1 numbers for `Marine` (`0.9612`) and `LiU-ICE` (`0.7857`), and Screen 8 referenced `report.xgboost_fallback_note` instead of `report.xgboost_status`. | [frontend/src/screens/RulEvalAndReportsScreens.tsx](frontend/src/screens/RulEvalAndReportsScreens.tsx), [docs/SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md](docs/SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md) | `npm run build` (`tsc && vite build` exit code `0`) |
| **DEF-03** | `DRISHTI_SIH26054_VERIFIED.zip` omitted root `requirements.txt` and `data/processed/*.json` manifests. | [DRISHTI_SIH26054_VERIFIED.zip](DRISHTI_SIH26054_VERIFIED.zip) | Verified zip archive contents via Python `zipfile` inspection. |

---

## 9. Remaining Blockers & Engineering Limitations

1. **No Physical MALE UAV Hardware or Flight-Test Data:** All Rotax 914 telemetry in the live twin is generated by [`DeterministicFaultSimulator`](backend/app/simulation/fault_simulator.py) (`Rotax914-Simplified-Ref-v1.0` analytical equations).
2. **External Real-Data Domain Gap:** `LiU-ICE-Benchmark-DXC25` (automotive SI engine, `1` physical unit) and `Marine-Engine-Fault-v1.0` (marine 2-stroke/4-stroke diesel testbed, `1` physical unit) validate the residual feature extraction and anomaly/classification mechanics on real noisy sensors, but do not measure CHT, airframe vibration, or altitude density lapse rates of an aircraft piston engine.
3. **Single-Channel Sensor Resolution in Telemetry Schema v1.0.0:** Because `cht_c` and `egt_c` are engine-aggregate channels rather than 4 separate cylinder head thermocouples (`CHT_1`..`CHT_4`), cylinder-specific localization requires per-cylinder harness expansion.

---

## 10. Clean-Machine Setup & Run Instructions

```powershell
# 1. Install Python dependencies from root requirements.txt
cd "<PROJECT_ROOT>/"
python -m pip install -r requirements.txt

# 2. Run the automated verification test suite (46 tests)
python -m pytest tests/ -v

# 3. Build the production frontend (optional if frontend/dist is already built)
cd "<PROJECT_ROOT>/frontend"
npm install
npm run build

# 4. Start the FastAPI + WebSocket backend server (serves API + built UI on port 8000)
cd "<PROJECT_ROOT>/"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

# 5. (Optional) Start Vite dev server on port 5173 for hot-reload development
cd "<PROJECT_ROOT>/frontend"
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 11. Judge Presentation Guide: Safe vs. Unsupported Claims

### Claims Safe & Verified to Make to SIH Judges
- **End-to-End 4-Value Hybrid Digital Twin:** DRISHTI computes `Actual`, `Expected` (ISA altitude/load-compensated physics baseline), `Calculated` (residuals, z-scores, rolling slopes, safety margins), and `Predicted` (9-class fault probabilities, IsolationForest anomaly score, SensorFaultIsolator status, composite Health Index, and dual-unit RUL in `cycles` and `hours` with 10th–90th percentile bounds) in `< 15 ms` per frame.
- **Complete SIH26054 Coverage (8 Parameter Groups & 8 Fault Categories):** Monitors all 8 propulsion parameter groups (`RPM`, `CHT`, `EGT`, `Oil P/T`, `Fuel Flow`, `Vibration`, `Battery/Alternator`, `Injection Timing`) and maps all 8 intended SIH26054 fault categories (including the documented engineering interpretation of `"Coding degradation"` as **Cooling degradation**).
- **Strict Engine-Disjoint Synthetic Benchmark Metrics:**
  - On the **100,000-row / 50-engine synthetic benchmark (`DRISHTI-SynthCorpus-100k-v2.0`, 35 train / 8 val / 7 test engines, 0 shared engines)**: **9-Class RF Macro-F1 = `0.9853`** (`Accuracy = 0.9825`), **IsolationForest Recall = `0.9180`** (`Test FAR = 0.0255`, `Val FAR = 0.0301`), **XGBoost RUL MAE = `8.782 cycles` (`7.571 hours`)**, **RMSE = `11.732 cycles` (`10.163 hours`)**, and **Sensor Fault Isolation F1 = `1.0000`**.
  - On the **54-trajectory live-twin suite (`DRISHTI-SynthCorpus-v1.0`, 36 train / 18 test trajectories, 1,944 frames, 0 shared engines)**: **Macro-F1 = `0.9769`** (`Accuracy = 0.9738`), **Anomaly Recall = `0.8875`** (`FAR = 0.0119`), and **XGBoost RUL MAE = `2.800 hours`**.
- **Rigorous External Real-Engine Bench Testing (With Honest Failure-Mode Analysis):**
  - Evaluated on two real public piston-engine fault datasets under strict run-disjoint splits (`0` shared physical runs):
    - **`LiU-ICE-Benchmark-DXC25` (`288,623` rows, `8` WLTP runs):** Phase 4 unsigned decoupled control-map residuals resolved the opposite-sign intercooler pressure sensor fault (`+10%` test vs `-10%` train), improving `f_pic` recall from `0.0000` to **`0.9950`** (`F1 = 0.9918`), achieving **`0.5874` 4-class Macro-F1**, **`0.6903` Balanced Accuracy**, and **`0.90%` Normal FAR**.
    - **`Marine-Engine-Fault-v1.0` (`114,770` rows, `16` physical runs):** Phase 4 run-balanced residuals with out-of-sample validation calibration and Schmitt-trigger hysteresis (`T_on=q99, T_off=q95, k_on=3`) reduced unseen-load normal false alarms from `57.01%` down to **`0.00%` Normal FAR across all 7 test runs**, detecting **`7 / 7` fault runs** (`50.37%` sample recall, `0.6699` Anomaly F1, `0.7518` Balanced Accuracy), with **`0.5742` 6-class supervised Macro-F1** (`0.6486` Balanced Accuracy).

### Claims That Must NOT Be Made to SIH Judges
- **Do NOT claim** that the `0.9853` or `0.9769` Macro-F1 scores or `8.782 cycles` / `2.800 hours` RUL MAE were measured on real DRDO MALE UAV flight logs or a physical Rotax 914 engine.
- **Do NOT claim** that `Marine-Engine-Fault-v1.0` achieved `0.9612` Macro-F1 or that `LiU-ICE` achieved `0.7857` Macro-F1 (those numbers were unverified summary errors; the true verified Phase 4 run-disjoint multi-class Macro-F1 scores are `0.5742` and `0.5874`, alongside `0.9950` `f_pic` recall on `LiU-ICE` and `0.00%` Normal FAR / `7/7` fault run detection on `Marine`).
- **Do NOT claim** live hardware CAN bus connectivity or airworthiness flight-release certification; `ModularSocketCANAdapter` is a software codec ready for USB-CAN transceiver attachment, and all readiness badges are prototype engineering decision-support advisories.
