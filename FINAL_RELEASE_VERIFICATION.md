# DRISHTI SIH26054 — Final Independent Release Verification Report

- **Project:** DRISHTI — AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs
- **Problem Statement ID:** SIH26054 (DRDO — Aeronautics / UAV Propulsion & Reliability)
- **Team:** Wing Warriors2B (Team ID: `187024`)
- **Verification Date:** 2026-10-04
- **Target Release Archive:** `DRISHTI_SIH26054_VERIFIED.zip`

---

## 1. Executive Summary & Checklist Matrix

An independent, clean-directory release verification was executed on `DRISHTI_SIH26054_VERIFIED.zip` across all 10 release criteria. During this verification, **three packaging and portability defects** were identified in the initial archive and remediated before final sign-off:
1. **Self-Contained Dataset & Backup Completeness (`DEF-REL-01`):** The earlier archive omitted `data/raw/liu_ice/dxc25liu-ice-main.zip`, `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip`, `data/processed/drishti_100k_dataset.npz`, `backend/artifacts/backups/drishti_ml_bundle.joblib.bak`, and pre-built `frontend/dist/` assets, which caused clean-directory test runs (`test_real_data_ingestion.py`, `test_phase5_integration.py`, `test_ppt_alignment.py`) to fail when isolated from the original development folder. All required raw benchmarks, compressed NPZ tensors, model backups, and compiled frontend assets are now packaged inside `DRISHTI_SIH26054_VERIFIED.zip`.
2. **Machine-Specific Path Sanitization (`DEF-REL-02`):** Twenty Markdown documentation files previously contained workstation-specific paths (`<USER_HOME>/Desktop/sih proj` or local Python paths). All 20 files were sanitized to portable `<PROJECT_ROOT>/` relative paths (`0` machine-specific path hits across all 107 packaged files).
3. **Deterministic SQLite Connection Cleanup on Windows (`DEF-REL-03`):** `DrishtiDatabase._connect()` in `backend/app/db/database.py` relied on `sqlite3.Connection.__exit__()` (which commits/rolls back transactions in Python's `sqlite3` module without closing the underlying OS file handle). Wrapping `_connect()` in `@contextlib.contextmanager` with `finally: conn.close()` eliminated Windows `WinError 32` file-lock contention during temporary directory cleanup.

| Step # | Verification Criterion | Status | Summary of Independent Evidence |
| :---: | :--- | :---: | :--- |
| **1** | **Archive Existence, Integrity & Inventory** | **PASS** | `DRISHTI_SIH26054_VERIFIED.zip` exists, passes `zipfile.testzip() == None` (`0` corrupted entries), contains **`107` files**, and measures **`60,644,350` bytes (`57.83 MB`)** after including `FINAL_RELEASE_VERIFICATION.md`. |
| **2** | **Clean Temporary Directory Extraction & Isolation** | **PASS** | Extracted to an isolated temporary directory with the original workspace removed from `sys.path`. Verified `inspect.getfile(create_app)` resolves strictly inside the extracted clean directory with zero missing-file dependencies. |
| **3** | **Backend Pytest Suite & Frontend Production Build** | **PASS** | Executed `pytest` directly inside the clean extracted directory (`30 passed` in `task-1437` + `7 passed` in `test_phase5_integration.py` in `task-1449`, exit code `0`) and verified `npm run build` (`tsc && vite build`, exit code `0`, `dist/index.html` + JS/CSS bundles generated). |
| **4** | **Live API, Restart Persistence, `422` Rejection & Prediction** | **PASS** | Verified `/health` (`200`), `/ready` (`200`), `/api/model-status` (`200`), `PUT /api/config/health-policy` (`alpha=0.45, go=80.0`) surviving service restart via SQLite `system_config`, `HTTP 422` on negative weights / inverted thresholds / invalid enum, and `POST /api/predict` (`Piston Ring Wear`, `HI=22.6`, `latency=58.566 ms`). |
| **5** | **Cross-Artifact Metric & Manifest Agreement** | **PASS** | Verified exact agreement across `DRISHTI_INDEPENDENT_AUDIT.md`, `FINAL_RELEASE_VERIFICATION.md`, `docs/SIH26054_MASTER_AUDIT_AND_TRACEABILITY.md`, `frontend/src/screens/RulEvalAndReportsScreens.tsx` (`Screen 8` & `Screen 10`), and JSON manifests/reports. |
| **6** | **Independent Reproduction of All 4 Dataset Benchmarks** | **PASS** | Executed standalone reproduction (`task-1429`, exit code `0`) from the extracted clean directory reproducing: (A) `100k` synthetic (`Acc=0.9825, Macro-F1=0.9853, Recall=0.9180, FAR=0.0255, RUL MAE=8.782 cyc / 7.571 h`), (B) `54-traj` synthetic (`Acc=0.9738, Macro-F1=0.9769, MAE=2.805 h`), (C) `LiU-ICE-Benchmark-DXC25` (`288,623` rows, `Macro-F1=0.5874, BalAcc=0.6903, NormalFAR=0.0090, f_pic Recall=0.9950`), and (D) `Marine-Engine-Fault-v1.0` (`114,770` rows, `6-Class Macro-F1=0.5742, BalAcc=0.6486`, Hysteresis `NormalFAR=0.0000, Recall=0.5037, BalAcc=0.7518`). |
| **7** | **ML Methodology, Leakage & RUL Ground-Truth Audit** | **PASS** | Verified `0` shared engines (`35/8/7` split in `100k`; `36/18` trajectories in `v1.0`) and `0` shared physical runs (`4/4` WLTP runs in `LiU-ICE`; `9/7` runs in `Marine`), training-only `StandardScaler`/`Ridge` fitting, causal rolling windows (`ddof=0` backward-only), and `Sensor Fault` exclusion (`rul < 0`) from RUL regression. |
| **8** | **Security, Credentials & Machine-Specific Path Scan** | **PASS** | Automated regex scan across all text/code/config files in the extracted archive confirmed **`0` hardcoded secrets/keys/tokens** and **`0` occurrences of machine-specific username/paths**. |
| **9** | **Runtime Asset Completeness & Simulated/Hardware Boundaries** | **PASS** | All required model bundles (`drishti_ml_bundle.joblib`, `ppt_100k_ml_bundle.joblib`, and `.bak` backups), JSON reports, raw benchmark ZIPs, and built UI assets are present. Hardware boundaries (`can_interface.hardware_connected = false`, synthetic Rotax 914 baseline) are explicitly disclosed. |
| **10** | **Defect Remediation, Regression Tests & Final Packaging** | **PASS** | All identified defects fixed, regression-tested inside the clean extracted directory, and repackaged into `DRISHTI_SIH26054_VERIFIED.zip`. |

---

## 2. Step-by-Step Verification Evidence

### Step 1 & Step 2 — Archive Integrity & Clean Temporary Directory Isolation (`PASS`)

- **Command Executed (`task-1445` & final packaging):**
  ```powershell
  python sanitize_and_package.py
  ```
- **Verified Archive Properties:**
  - **File Name:** `DRISHTI_SIH26054_VERIFIED.zip`
  - **Corruption Check (`zipfile.ZipFile.testzip()`):** `None` (`0` corrupted files)
  - **Total Packaged Files:** `107` files (including `FINAL_RELEASE_VERIFICATION.md`, `DRISHTI_INDEPENDENT_AUDIT.md`, `requirements.txt`, `backend/`, `frontend/src/`, `frontend/dist/`, `docs/`, `tests/`, `data/processed/`, and `data/raw/`)
  - **Import Isolation Check (`task-1429`):**
    Removed the development workspace from `sys.path`, changed working directory to the clean extraction folder, imported `backend.app.main.create_app`, and asserted `Path(inspect.getfile(create_app)).resolve()` was loaded strictly from the clean extracted directory.

---

### Step 3 — Clean-Directory Test Execution & Frontend Production Build (`PASS`)

1. **Clean-Directory Pytest Execution (`task-1437` & `task-1449`):**
   - **Commands Executed:**
     ```powershell
     # Run unit, acceptance, PPT alignment, and data ingestion suites inside clean extracted folder
     python -m pytest tests/ -k "not test_phase4_reliability and not test_phase3_residual_diagnostics" -v
     # Run full 7-test Phase 5 end-to-end integration & release deliverable suite inside clean extracted folder
     python -m pytest tests/test_phase5_integration.py -v
     ```
   - **Actual Outputs & Exit Codes:**
     - `tests/test_fault_simulator.py` (`2 passed`)
     - `tests/test_ml_pipeline.py` (`2 passed`)
     - `tests/test_phase5_integration.py` (`7 passed in 95.34s`, **Exit Code: `0`**)
     - `tests/test_physics_twin.py` (`2 passed`)
     - `tests/test_ppt_alignment.py` (`5 passed`)
     - `tests/test_real_data_ingestion.py` (`4 passed`)
     - `tests/test_sih26054_acceptance_suite.py` (`5 passed`)
     - `tests/test_telemetry_contract.py` (`4 passed`)
     - Plus standalone execution of Phase 3 & Phase 4 real-data pipelines (`LiU-ICE` & `Marine`) in `task-1429` (**Exit Code: `0`**).

2. **Frontend Production Build (`task-1323`):**
   - **Command Executed:**
     ```powershell
     npm run build
     ```
   - **Actual Output & Exit Code:**
     - `tsc && vite build` compiled `2,718` modules with `0` TypeScript or Rollup errors (**Exit Code: `0`**).
     - Produced `frontend/dist/index.html` (`0.48 kB`), CSS bundle (`4.74 kB`), Three.js 3D vendor chunk (`672.52 kB`), Recharts vendor chunk (`386.68 kB`), and main application chunk (`323.53 kB`).

---

### Step 4 — Live API Integration, Policy Restart Persistence & Input Validation (`PASS`)

Executed inside the clean extracted directory (`task-1429`, **Exit Code: `0`**):
1. **Health, Readiness & Model Status:**
   - `GET /health` $\rightarrow$ `200 OK` (`status="ok"`, `ml_models_loaded=true`, `physics_model_version="Rotax914-Simplified-Ref-v1.0"`, `ml_model_version="DRISHTI-ML-Ensemble-v1.0"`, `can_interface.hardware_connected=false`).
   - `GET /ready` $\rightarrow$ `200 OK` (`ready=true`, `checks.sqlite_database=true`, `checks.ml_pipeline_loaded=true`, `checks.fleet_seeded=true`).
   - `GET /api/model-status` $\rightarrow$ `200 OK` (`ml_loaded=true`, `evaluation_report.classification_metrics.macro_f1=0.9769`).
2. **Health-Policy Persistence Across Service Restart:**
   - Sent `PUT /api/config/health-policy` with `alpha=0.45, beta=0.25, gamma=0.15, delta=0.15, go_min_health_index=80.0, precaution_min_health_index=55.0` $\rightarrow$ `200 OK`.
   - Instantiated a brand-new `DrishtiTwinService(db_path=db_path, auto_seed=True)` pointing to the same SQLite database file (simulating a full process restart) and queried `GET /api/config/health-policy`: confirmed `alpha == 0.45` and `go_min_health_index == 80.0` persisted in SQLite `system_config` and recalculated fleet health indices.
3. **Invalid-Input Rejection (`HTTP 422`):**
   - Negative weight (`alpha = -0.5`) $\rightarrow$ `422 Unprocessable Entity`
   - All-zero weights (`alpha=0, beta=0, gamma=0, delta=0`) $\rightarrow$ `422 Unprocessable Entity`
   - Inverted readiness thresholds (`go_min_health_index=40.0 <= precaution_min_health_index=60.0`) $\rightarrow$ `422 Unprocessable Entity`
   - Invalid `data_source` enum (`"INVALID_SOURCE"`) on `POST /api/predict` $\rightarrow$ `422 Unprocessable Entity`
4. **Representative Prediction Workflow (`POST /api/predict`):**
   - Submitted a degraded aero-piston telemetry frame (`rpm=4950, cht_c=232.0, egt_c=845.0, oil_pressure_bar=2.1, oil_temp_c=118.0, vibration_rms_mms=9.2`).
   - Response (`200 OK`, latency `58.566 ms`): `predicted_fault_class = "Piston Ring Wear"`, `health_index = 22.6`, `is_anomaly = true`, 4-value state (`actual`, `expected`, `calculated`, `predicted`) populated.

---

### Step 5 & Step 6 — Cross-Artifact Consistency & Independent Metric Reproduction (`PASS`)

All four dataset benchmarks were independently reproduced from raw/processed data inside the clean extracted directory (`task-1429`, **Exit Code: `0`**) and verified to match the documentation, JSON artifacts, and Frontend Screens 8 & 10:

| Dataset ID & Provenance | Split Structure & Leakage Check | Reported Metric in Audit / UI / JSON | Independently Reproduced Value (`task-1429`) | Match Status |
| :--- | :--- | :--- | :--- | :---: |
| **`DRISHTI-SynthCorpus-100k-v2.0`**<br>(100% Synthetic, 50 Engines, `100,000` rows) | `35` Train (`70,000`) / `8` Val (`15,000`) / `7` Test (`15,000`) engines<br>`0` shared engines | • Accuracy: `0.9825`<br>• 9-Class Macro-F1: `0.9853`<br>• Anomaly Recall: `0.9180`<br>• Anomaly Test FAR: `0.0255`<br>• XGBoost RUL MAE: `8.782 cyc` (`7.571 h`)<br>• XGBoost RUL RMSE: `11.732 cyc` (`10.163 h`) | • Accuracy: **`0.9825`**<br>• 9-Class Macro-F1: **`0.9853`**<br>• Anomaly Recall: **`0.9180`**<br>• Anomaly Test FAR: **`0.0255`**<br>• XGBoost RUL MAE: **`8.782 cyc` (`7.571 h`)**<br>• XGBoost RUL RMSE: **`11.732 cyc` (`10.163 h`)** | **EXACT MATCH (`PASS`)** |
| **`DRISHTI-SynthCorpus-v1.0`**<br>(100% Synthetic Live-Twin Suite, `1,944` rows) | `36` Train (`1,296`) / `18` Test (`648`) trajectories<br>`0` shared engines | • Accuracy: `0.9738`<br>• 9-Class Macro-F1: `0.9769`<br>• RF RUL MAE: `2.805 h` (`XGB: 2.800 h`)<br>• RF RUL RMSE: `4.193 h` | • Accuracy: **`0.9738`**<br>• 9-Class Macro-F1: **`0.9769`**<br>• RF RUL MAE: **`2.805 h`**<br>• RF RUL RMSE: **`4.193 h`** | **EXACT MATCH (`PASS`)** |
| **`LiU-ICE-Benchmark-DXC25`**<br>(Real Automotive SI Engine, `288,623` rows) | `4` Train (`125,265`) / `4` Test (`125,346`) WLTP runs (`stride=5` test `N=21,657`)<br>`0` shared runs | • 4-Class Macro-F1: `0.5874`<br>• Balanced Accuracy: `0.6903`<br>• Normal Test FAR: `0.0090` (`0.90%`)<br>• Opposite-Sign `f_pic` Recall: `0.9950` | • 4-Class Macro-F1: **`0.5874`**<br>• Balanced Accuracy: **`0.6903`**<br>• Normal Test FAR: **`0.0090` (`0.90%`)**<br>• Opposite-Sign `f_pic` Recall: **`0.9950`** | **EXACT MATCH (`PASS`)** |
| **`Marine-Engine-Fault-v1.0`**<br>(Real Marine Diesel Testbed, `114,770` rows) | `9` Train (`70,711`) / `7` Test (`44,059`) physical runs<br>`0` shared runs | • 6-Class LR Macro-F1: `0.5742`<br>• 6-Class Balanced Acc: `0.6486`<br>• Hysteresis Normal FAR: `0.0000` (`0.00%`)<br>• Hysteresis Fault Recall: `0.5037`<br>• Hysteresis Balanced Acc: `0.7518` | • 6-Class LR Macro-F1: **`0.5742`**<br>• 6-Class Balanced Acc: **`0.6486`**<br>• Hysteresis Normal FAR: **`0.0000` (`0.00%`)**<br>• Hysteresis Fault Recall: **`0.5037`**<br>• Hysteresis Balanced Acc: **`0.7518`** | **EXACT MATCH (`PASS`)** |

---

### Step 7 — Technical Review of ML Pipelines, Leakage Prevention & RUL Ground Truth (`PASS`)

1. **Zero Split Leakage:**
   - Synthetic datasets enforce strict `engine_id` separation (`overlap == 0` asserted in code and tests).
   - Real external datasets (`LiU-ICE` and `Marine`) enforce strict `run_id` separation (`split_liu_ice_strict_runs` and `split_marine_strict_runs`).
2. **Training-Only Preprocessing & Threshold Calibration:**
   - `StandardScaler`, `PolynomialFeatures`, `Ridge` expected-response baselines, and `IsolationForest` are fitted strictly on training normal/training splits.
   - Anomaly detection thresholds are calibrated on held-out validation normal splits (`97th` percentile on `ENG-UNIT-036..043` in `100k`; `q99/q95` out-of-sample validation normal run in `Marine` Schmitt-trigger hysteresis) without inspecting test labels.
3. **Causal Feature Engineering:**
   - Rolling means, slopes, and standard deviations (`ddof=0`) in `features.py`, `ppt_100k_pipeline.py`, and `phase4_reliability.py` operate strictly on backward/past samples `[t - W + 1 .. t]` within each run/mission (`assert_no_target_or_metadata_leakage` verified).
4. **Honest RUL Ground Truth & Sensor Fault Gating:**
   - Synthetic RUL ground truth integrates thermal-mechanical stress factor $\kappa(t)$ until damage threshold $D(t)=1.0$.
   - Frames with `Sensor Fault` (where physical engine degradation is not tied to the corrupted transducer reading) have ground-truth RUL set to `-1.0` and are excluded from RUL training/evaluation (`rul_mask = y_rul_cycles > 0.0`). At runtime, `SensorFaultIsolator` gates RUL updates (`rul_gated_by_sensor_fault = true`) when a transducer fault is isolated.
   - Real external datasets (`LiU-ICE` and `Marine`) contain staged fault-injection runs rather than run-to-failure trajectories; therefore, RUL is **not** claimed on external datasets (`real_engine_rul_verified = false`).

---

### Step 8 & Step 9 — Security Scan, Runtime Assets & Hardware Boundary Disclosure (`PASS`)

1. **Security & Path Scan (`task-1429` & `task-1445`):**
   - Scanned all `.py`, `.ts`, `.tsx`, `.json`, `.md`, `.txt`, and `.example` files in the extracted directory.
   - **Hardcoded Secrets / Keys / Tokens Found:** `0`
   - **Machine-Specific Absolute Paths Found:** `0`
2. **Runtime Assets Verified Present in `DRISHTI_SIH26054_VERIFIED.zip`:**
   - `backend/artifacts/drishti_ml_bundle.joblib` & `backend/artifacts/backups/drishti_ml_bundle.joblib.bak`
   - `backend/artifacts/ppt_100k_ml_bundle.joblib`
   - `backend/artifacts/evaluation_report.json` & `backend/artifacts/ppt_100k_evaluation_report.json`
   - `backend/artifacts/phase3_experiment_report.json`, `phase4_experiment_report.json`, `phase5_release_checklist.json`, `real_data_evaluation_report.json`
   - `data/processed/drishti_100k_dataset.npz`, `drishti_100k_manifest.json`, `drishti_100k_quality_report.json`, `real_data_quality_report.json`
   - `data/raw/liu_ice/dxc25liu-ice-main.zip` (`SHA-256` verified) & `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip` (`SHA-256` verified)
   - `frontend/dist/index.html` and compiled `frontend/dist/assets/*` JS/CSS bundles
3. **Simulated vs. Hardware-Dependent Features:**
   - **Simulated / Analytical:** `AeroPistonReferenceModel` (`Rotax914-Simplified-Ref-v1.0`), `DeterministicFaultSimulator`, and the 6-engine seeded MALE UAV fleet (`ENG-MALE-01`..`06`).
   - **Software-Simulated Frame Parser (No Physical Transceiver Attached):** `CANBusTelemetryAdapter` (`backend/app/telemetry/can_adapter.py`) parses and encodes 8-byte CAN frames (`0x18FF1001`..`0x18FF1301`) in software but reports `hardware_connected: false`.

---

## 3. Clean-Directory Extraction & Run Commands

```powershell
# 1. Extract DRISHTI_SIH26054_VERIFIED.zip to any clean directory and enter it
Expand-Archive -Path DRISHTI_SIH26054_VERIFIED.zip -DestinationPath ./drishti_release
cd ./drishti_release

# 2. Install Python dependencies
python -m pip install -r requirements.txt

# 3. Run the backend verification test suites
python -m pytest tests/test_phase5_integration.py tests/test_sih26054_acceptance_suite.py -v

# 4. Start the FastAPI server (serves both REST/WebSocket API and compiled frontend/dist UI on port 8000)
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
