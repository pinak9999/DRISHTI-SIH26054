# DRISHTI Phase 5 — Final Evidence Verification & Release Audit

**Project:** SIH26054 — DRISHTI: AI-Enabled Real-Time Digital Twin for Aero Piston Engine Health Monitoring, Fault Prediction and Mission Reliability  
**Audit Date:** 2026-10-03  
**Auditor Role:** Independent QA & ML Reliability Auditor  

---

## 1. Resolution of Contradictory Test Runs (`task-830`, `task-840`, and Full-Suite `task-856`)

All historical task logs were inspected directly without modification:

| Task ID | Command Executed | Exact Exit Code | Summary | Root Cause / Resolution |
| :--- | :--- | :---: | :--- | :--- |
| `task-761` | `python -m pytest tests/ -v --tb=short` (before `test_phase5_integration.py` was added) | `0` | `29 passed, 2 warnings in 169.35s` | Baseline test suite prior to Phase 5 integration test file. |
| `task-830` | `python -m pytest tests/test_phase5_integration.py -v` | **`1`** | **`1 failed, 6 passed, 1 warning in 200.63s`** | `test_phase2_phase3_phase4_reports_and_phase5_deliverables_exist` asserted a non-existent path `data/raw/liu_ice_2025/LiU-ICE Benchmark.zip` (and `data/raw/marine_engine_2024/Archive.zip`) instead of the actual repository paths defined in [`real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py#L29-L35). |
| `task-840` | `python -m pytest tests/test_phase5_integration.py -v` | **`0`** | **`7 passed, 1 warning in 48.01s`** | Updated [`tests/test_phase5_integration.py`](tests/test_phase5_integration.py) to use `RealDatasetIngestor().verify_raw_archives()` and the actual archive paths. |
| **`task-856`** | **`python -m pytest tests/ -v` (Full Suite from Project Root)** | **`0`** | **`36 passed, 0 failed, 2 warnings in 171.26s`** | Complete 9-file test suite verified with explicit path assertions (`data/raw/liu_ice/dxc25liu-ice-main.zip` and `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip`) and SHA-256 verification. |

---

## 2. Resolution of the Missing Archive Assertion

* **Why `data/raw/liu_ice_2025/LiU-ICE Benchmark.zip` Failed in `task-830`:**
  - The raw datasets are **not missing** from the repository. The initial version of `test_phase5_integration.py` in `task-830` used an incorrect directory and filename (`data/raw/liu_ice_2025/LiU-ICE Benchmark.zip` and `data/raw/marine_engine_2024/Archive.zip`).
* **Actual Repository Data Layout (Verified on Disk & Defined in [`backend/app/data_ingestion/real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py#L29-L35)):**
  1. **LiU-ICE Benchmark (`LiU-ICE-Benchmark-DXC25`):**
     - **Path:** `data/raw/liu_ice/dxc25liu-ice-main.zip`
     - **Size:** `17,814,194` bytes
     - **SHA-256:** `2861857c5c9e2d952ea2ad99ddc3699a4435bd17fc4f169265ec4664438b3e24`
     - **MD5:** `04deed4dc73c880da0d4a4eaba3f4356`
  2. **Marine Engine Fault Dataset (`Marine-Engine-Fault-v1.0`):**
     - **Path:** `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip`
     - **Size:** `26,538,633` bytes
     - **SHA-256:** `3fba7aa0c288ae1bc05383fb54bf67cbde209d61b26e3e811d4bc2f22f97442b`
     - **MD5:** `f4d246c1bb46e05b26e56221acc2606c`
  3. **Processed Quality Report:**
     - **Path:** [`data/processed/real_data_quality_report.json`](data/processed/real_data_quality_report.json) (`38,308` bytes)
* **Resolution:** [`tests/test_phase5_integration.py`](tests/test_phase5_integration.py#L361-L390) now explicitly asserts the existence of both `data/raw/liu_ice/dxc25liu-ice-main.zip` and `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip` **and** executes `RealDatasetIngestor().verify_raw_archives()` to verify their cryptographic SHA-256 hashes. No data files were fabricated, recreated, or skipped.

---

## 3. Evidence Separation: Automated Tests vs. Live API vs. Static Build vs. Unverified Scope

### 3.1 Automated Pytest Suite (`task-856`, Exit Code `0`)
Executed `python -m pytest tests/ -v` from `<PROJECT_ROOT>/`:
- **Total Collected:** `36` tests across `9` test files
- **Passed:** `36`
- **Failed:** `0`
- **Warnings:** `2` (`StarletteDeprecationWarning` on `httpx`, and `RuntimeWarning` in `np.where` divide guard in `phase3_residual_diagnostics.py:818`)
- **Duration:** `171.26s`
- **Phase 3 & Phase 4 Reproduction in Test Suite:**
  - [`tests/test_phase3_residual_diagnostics.py`](tests/test_phase3_residual_diagnostics.py) (`8/8` passed) verifies run-disjoint splits, training-only residual fitting, exact residual and MAD scaling, per-class metrics, and [`backend/artifacts/phase3_experiment_report.json`](backend/artifacts/phase3_experiment_report.json) integrity.
  - [`tests/test_phase4_reliability.py`](tests/test_phase4_reliability.py) (`6/6` passed) verifies strict out-of-sample validation threshold calibration (`fit_norm_df` vs `val_norm_df`), causal consecutive-sample persistence and Schmitt-trigger hysteresis, decoupled `LiU-ICE` unsigned residual physics (`f_pic` opposite-sign recall `0.9950` LR / `0.9976` RF vs `0.0000` in Phase 3), Marine false-alarm reduction (`0.00%` normal FAR under supervised hysteresis vs `57.01%` in Phase 3), and moving-block bootstrap CI expansion (`5.20x–7.73x` wider than i.i.d. row bootstrap).

### 3.2 Live HTTP API Checks Against Running Server (`http://127.0.0.1:8000`)
- **Initial Live Batch (`task-759`, `23` requests):** `21` passed, `2` failed:
  1. `POST /api/predict` initially returned HTTP `422` because the scratch script sent `"data_source": "SIMULATION"` instead of the schema enum `"SIMULATOR"` defined in [`DataSourceType`](backend/app/telemetry/schema.py#L25-L30). Re-running with `"data_source": "SIMULATOR"` returned HTTP `200` (`latency_ms=98.107`).
  2. `POST /api/simulations` (Normal mission) initially timed out at `60s` while `task-761` (`pytest`) was concurrently running CPU-intensive ML training. Re-running against the server without concurrent `pytest` training completed in **`4.5s`** (HTTP `200`, `60` frames, `final_class="Normal"`, `final_health_index=100.0`, `alerts=0`, `throughput_fps=16.3`).
- **Integration Fix Applied (`P5-FIX-01`):**
  - [`DrishtiTwinService.ingest_csv_mission`](backend/app/service.py#L406-L517) was updated to call `self.db.upsert_engine(eng_record)` with `active_mission_id = mission_id` so that importing CSV telemetry immediately updates the active mission returned by `GET /api/engines/{id}` and `GET /api/engines/{id}/telemetry`.

### 3.3 Frontend Build & Static Code Inspection (`task-747`, Exit Code `0`)
- Executed `npm run build` (`tsc && vite build`) in [`frontend/`](frontend):
  - **Exit Code:** `0` (`0` TypeScript errors, `2,958` modules transformed in `2m 46s`).
  - **Generated Bundle:** [`frontend/dist/index.html`](frontend/dist/index.html) (`0.46 kB`), `frontend/dist/assets/index-BcbpkqKt.css` (`8.81 kB`), `frontend/dist/assets/index-C_AFOYA_.js` (`1,506.61 kB` / `409.25 kB` gzip).
- Updated [`frontend/src/App.tsx`](frontend/src/App.tsx#L342-L349) so `TelemetryExplorerScreen` refreshes both engine telemetry and global mission lists after CSV ingestion.

### 3.4 Unverified Scope (Explicitly Disclosed)
- **Interactive Browser Click-Through (`NOT VERIFIED`):** No headless browser tool (`Playwright` / `Puppeteer`) was available in this CLI environment. Visual WebGL rendering and live browser console output were not inspected interactively; verification relies on `tsc && vite build` (`exit code 0`), static component-to-API inspection, and `TestClient`/live HTTP tests.
- **Clean-Machine / Fresh Virtualenv Installation (`NOT VERIFIED`):** [`requirements.txt`](requirements.txt) was generated from the active Python `3.11.9` environment (`pip freeze`), but creating a brand-new isolated environment on a second machine was not performed.
- **Physical CAN Hardware & Real UAV Engine Validation (`NOT IMPLEMENTED`):** `ModularSocketCANAdapter` operates in software-codec mode (`hardware_connected=false`), and no real MALE UAV flight or test-cell dataset exists in the repository.

---

## 4. Feature Classification Matrix

| Feature / Subsystem | Status | Verification Basis |
| :--- | :---: | :--- |
| FastAPI Server & 29 Registered Routes ([`main.py`](backend/app/main.py)) | **WORKING** | Live HTTP + `test_all_routes_registered_and_error_handling` |
| SQLite Persistence ([`database.py`](backend/app/db/database.py)) | **WORKING** | Live HTTP + `test_phase5_integration.py` |
| 6-Engine Seeded Fleet (`ENG-MALE-01`..`06`) | **WORKING** | Live HTTP `GET /api/fleet` + `POST /api/fleet/seed` |
| Four-Value Digital Twin (`Actual`, `Expected`, `Calculated`, `Predicted`) | **WORKING** | `test_physics_twin.py` + `test_api_and_e2e.py` |
| 9-Class Synthetic Fault Classifier & Anomaly Detector ([`pipeline.py`](backend/app/ml/pipeline.py)) | **WORKING** | `test_ml_pipeline.py` (`macro_f1=0.9889` on synthetic held-out set) |
| Missing-Model Graceful Fallback (`UNAVAILABLE_MODEL_ARTIFACT`) | **WORKING** | `test_missing_model_graceful_fallback_via_api` |
| Cross-Channel Sensor-Fault Isolator (`SensorFaultIsolator-v1.0`) | **WORKING** | `test_fault_simulator.py::test_sensor_fault_submodes` |
| RUL Estimation & `NOT_ESTIMABLE` Sensor-Fault Gating | **WORKING** | `test_fault_telemetry_sequence_and_sensor_fault_rul_gating_end_to_end` |
| Explainable Alert Engine & Acknowledgment | **WORKING** | Live HTTP + `test_phase5_integration.py` |
| Deterministic 9-Class Fault & Mission Simulator | **WORKING** | Live HTTP + `test_fault_simulator.py` |
| Synchronized Mission Replay (`start`, `stop`, `seek`, `step`, `status`) | **WORKING** | Live HTTP + `test_phase5_integration.py` |
| Historical CSV Telemetry Ingestion (`POST /api/telemetry/ingest-csv`) | **WORKING** | Fixed in Phase 5 (`P5-FIX-01`) + `test_csv_ingestion_updates_active_engine_mission_end_to_end` |
| WebSocket Telemetry Streaming (`/ws/telemetry`) | **WORKING** | `TestClient.websocket_connect` in `test_api_and_e2e.py` |
| Phase 2 Real-Data Ingestion (`LiU-ICE` & `Marine Engine`) | **WORKING** | `test_real_data_ingestion.py` (`4/4` passed, SHA-256 verified) |
| Phase 3 Residual Diagnostics Pipeline | **WORKING** | `test_phase3_residual_diagnostics.py` (`8/8` passed) |
| Phase 4 Reliability, Hysteresis & Block Bootstrap Pipeline | **WORKING** | `test_phase4_reliability.py` (`6/6` passed) |
| React + TypeScript + Three.js Production Build (`frontend/dist`) | **WORKING** | `npm run build` (`exit code 0`, `2,958` modules) |
| Interactive Browser UI Click-Through & WebGL Console Check | **NOT VERIFIED** | Headless browser tool unavailable in CLI environment |
| Clean-Machine `venv` Installation from `requirements.txt` | **NOT VERIFIED** | `requirements.txt` created; clean-machine install not executed |
| Physical CAN / SocketCAN Hardware Transceiver | **NOT IMPLEMENTED** | Software codec only (`hardware_connected=false`) |
| Per-Cylinder Thermocouple Fault Localization (#1–#4) | **NOT IMPLEMENTED** | Aggregate engine CHT/EGT only in schema v1.0.0 |
| Real MALE UAV Engine Test-Cell / Flight Validation | **NOT IMPLEMENTED** | Synthetic twin + automotive/marine benchmark datasets only |

---

## 5. Final Release Decision

* **Exact Full-Suite Test Count, Failures & Exit Code:** **`36 passed, 0 failed, 2 warnings` — Exit Code `0`** (`python -m pytest tests/ -v`, `171.26s`).
* **Local Software Demo Ready:** **YES**
* **Software Release Ready (Local Engineering Demonstrator):** **YES** (with [`requirements.txt`](requirements.txt) pinned and model artifacts backed up in [`backend/artifacts/backups/`](backend/artifacts/backups/)).
* **Interactive Browser Testing Completed:** **NO (`NOT VERIFIED`)** — Verified via `tsc && vite build` (`exit code 0`), static component inspection, and live HTTP API tests; interactive browser click-through must be performed on the presentation machine.
* **Validated for a Real UAV / Flight Ready:** **NO (`NOT ESTABLISHED`)** — Requires independent validation on target MALE UAV aero piston engine test-cell and flight telemetry, physical FADEC CAN hardware-in-the-loop testing, and airworthiness qualification.
