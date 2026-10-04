# DRISHTI — SIH26054 Master Technical Audit, Requirement Traceability, Model Card & Judge Demo Guide

**Problem Statement ID:** SIH26054 | **Organization:** DRDO  
**Title:** AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs  
**Project Name:** DRISHTI | **Team:** Wing Warriors2B (`187024`)  
**Date:** 2026-10-04

---

## 1. Baseline Gap Analysis & Implementation Status

| Section | Official SIH26054 Requirement Area | Pre-Upgrade Status | Final Post-Upgrade Status | Summary of Implementation & Verification |
| :---: | :--- | :---: | :---: | :--- |
| **A** | Digital Twin Core Framework (4-Value State, Residuals, Sync/Freshness, Quality Handling) | `IMPLEMENTED` | **`IMPLEMENTED` (Verified)** | `FourValueDigitalTwinState` (`Actual`, `Expected`, `Calculated`, `Predicted`), sequence/timestamp freshness tracking, `TelemetryValidator` duplicate/stale/out-of-order/range handling, explicit `SYNTHETIC` vs `RECORDED` badges. |
| **B** | Complete Health Monitoring — All 8 Required Parameter Groups | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added `GET /api/engines/{id}/parameter-groups` and the **SIH26054 Complete 8-Group Propulsion Health Monitoring Matrix** + full 11-channel time-series selector (`rpm`, `cht_c`, `egt_c`, `oil_pressure_bar`, `oil_temp_c`, `fuel_flow_lph`, `vibration_rms_mms`, `battery_voltage_v`, `alternator_current_a`, `injection_pulse_ms`, `ignition_advance_deg`) on Screen 3 (`TelemetryExplorerScreen`). |
| **C** | Fault Detection & Predictive Diagnostics — All 8 Intended Categories (`"Coding"` $\rightarrow$ Cooling Degradation) | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added `SIH26054_EIGHT_FAULT_CATEGORY_MAPPING` in `fault_simulator.py`, exposed via `/api/catalog`, and rendered on Screen 4 (`FaultInvestigationScreen`) with explicit engineering rationale for interpreting `"Coding degradation"` as **Cooling degradation**. |
| **D** | AI/ML Predictive Analytics (9-Class RF, IsolationForest, XGBoost RUL, Sensor Fault Isolator) | `IMPLEMENTED` | **`IMPLEMENTED` (Verified)** | Verified zero engine/mission leakage across both the 54-trajectory live-twin suite (`0.9769` Macro-F1, `2.80 h` XGBoost RUL MAE) and the 100k-row / 50-engine benchmark (`0.9853` Macro-F1, `0.9180` Recall at `0.0255` Test FAR / `0.0301` Val FAR, `8.782 cycles` RUL MAE). |
| **E** | Physics-Informed Engine Model (`Rotax914-Simplified-Ref-v1.0`) | `IMPLEMENTED` | **`IMPLEMENTED` (Verified)** | Analytical ISA density ratio $\sigma(h, T_{\text{amb}})$, cooling effectiveness $\eta_{\text{cool}}$, CHT/EGT/Oil-P/Oil-T/Fuel/Vib/Pulse baseline with explicit `is_extrapolated=True` flag above `7,000 m`. |
| **F** | Health Index & Configurable GO / GO WITH PRECAUTION / NO-GO Decisions | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added `GET /api/config/health-policy` and `PUT /api/config/health-policy` plus interactive weight ($\alpha, \beta, \gamma, \delta$) and threshold configurator on Screen 7 (`PredictiveMaintenanceRulScreen`). |
| **G** | Mission Simulation & Historical Replay (7 Profiles, Baseline vs Scenario, Restart Control) | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added **Baseline vs. Post-Scenario Outcome Comparison Table** on Screen 5 (`MissionSimulatorScreen`) and **Restart (`t=0s`)** button on Screen 6 (`HistoricalMissionReplayScreen`). |
| **H** | Real-Time Data Ingestion & Interfaces (REST, CSV, WebSocket, Simulated SocketCAN) | `IMPLEMENTED` | **`IMPLEMENTED` (Verified)** | REST (`/api/predict`, `/api/telemetry/ingest-csv`), WebSocket (`/ws/telemetry`), and 29-bit extended-ID `ModularSocketCANAdapter` (`can0` software codec with explicit no-hardware disclosure). |
| **I** | Premium DRDO-Grade Dashboard & All 11 Required Application Sections | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added Screen 10 (`SystemStatusAndTechDocsScreen`: Data Sources, System Readiness, Data Dictionary, Architecture & Roadmap) so all 11 functional sections are accessible cleanly in the sidebar. |
| **J–N** | Data Integrity, Security (`/ready`, `.env.example`), Docs & 20-Point Acceptance Tests | `PARTIAL` | **`IMPLEMENTED` (Verified)** | Added `/ready` probe, `.env.example`, `tests/test_sih26054_acceptance_suite.py`, and executed the full pytest suite (`46 passed`) and production frontend build (`npm run build`, exit code `0`). |

---

## 2. Complete Problem-Statement Traceability Matrix (Sections A–N)

| Req ID | Requirement Description | Implementation Location | Data Source | API / Model Dependency | Verification Test | Status & Remaining Limitations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A.1** | Four-Value Digital Twin (`Actual`, `Expected`, `Calculated`, `Predicted`) | `backend/app/telemetry/schema.py`, `backend/app/service.py` | SQLite `telemetry_states` & live Simulator | `AeroPistonReferenceModel`, `DrishtiMLPipeline` | `test_six_engine_fleet_seeded_and_all_have_four_value_state` | `IMPLEMENTED` — Operating in deterministic simulation/replay mode without live UAV flight hardware. |
| **A.2** | Synchronization, freshness, and invalid/missing/stale sensor handling | `backend/app/telemetry/validator.py` | Incoming `TelemetryInputFrame` | `TelemetryValidator.validate_frame` | `test_telemetry_contract.py` | `IMPLEMENTED` — Tracks `quality_score`, `is_duplicate`, `is_out_of_order`, `is_stale`, and clamps/flags out-of-range channels. |
| **B.1–B.8** | All 8 Required Parameter Groups (RPM, CHT, EGT, Oil P/T, Fuel, Vib, Batt/Alt, Inj. Timing) | `backend/app/service.py` (`evaluate_engine_parameter_groups`), `FleetAndTwinScreens.tsx` | Live/Seeded Engine Telemetry | `GET /api/engines/{id}/parameter-groups`, `GET /api/catalog` | `test_06_all_eight_parameter_groups_monitored` | `IMPLEMENTED` — Battery/Alternator uses fixed bus nominal (`13.8V / 18.0A`) rather than a dynamic alternator load model. |
| **C.1–C.8** | All 8 Intended Fault Categories + `"Coding"` $\rightarrow$ **Cooling Degradation** interpretation | `backend/app/simulation/fault_simulator.py`, `DiagnosticsAndSimScreens.tsx` | `SIH26054_EIGHT_FAULT_CATEGORY_MAPPING` | `GET /api/catalog`, `RandomForestClassifier`, `SensorFaultIsolator` | `test_07_all_eight_fault_categories_and_cooling_degradation_mapping` | `IMPLEMENTED` — Single-channel CHT/EGT cannot localize faults to cylinder `#1–#4` without per-cylinder probes. |
| **D.1–D.6** | Multiclass RF, IsolationForest Anomaly, XGBoost RUL, Sensor Fault Isolation | `backend/app/ml/pipeline.py`, `backend/app/ml/ppt_100k_pipeline.py` | `drishti_100k_dataset.npz` & 54-Trajectory Suite | `drishti_ml_bundle.joblib`, `ppt_100k_ml_bundle.joblib` | `test_ml_pipeline.py`, `test_ppt_alignment.py` | `IMPLEMENTED` — Evaluated on engine-disjoint splits (`0` shared engines). |
| **E.1** | Physics-Informed Engine Model (`Rotax914-Simplified-Ref-v1.0`) | `backend/app/physics/engine_model.py` | Operating conditions (`rpm`, `load`, `alt`, `amb`) | `AeroPistonReferenceModel.estimate_expected` | `test_physics_twin.py` | `IMPLEMENTED` — Simplified analytical reference equations; flags `altitude_m > 7,000 m` as `is_extrapolated=True`. |
| **F.1** | Configurable Health Index Weights ($\alpha, \beta, \gamma, \delta$) & GO/NO-GO Policy | `backend/app/service.py`, `RulEvalAndReportsScreens.tsx` | `self.health_policy` | `GET/PUT /api/config/health-policy` | `test_09_configurable_health_index_weights_and_readiness_thresholds` | `IMPLEMENTED` — Clearly labeled as a prototype engineering advisory, not airworthiness certification. |
| **G.1–G.7** | Mission Simulator (7 profiles, Baseline vs Scenario) & Historical Replay | `backend/app/simulation/fault_simulator.py`, `replay_manager.py`, `DiagnosticsAndSimScreens.tsx` | SQLite `missions`, `simulations`, `reports` | `POST /api/simulations`, `/api/replay/*`, `/api/reports/{id}` | `test_11_14_18_environmental_profiles_maintenance_and_report_export` | `IMPLEMENTED` — Reproduces stored telemetry in strict chronological sequence. |
| **H.1** | REST, CSV Import, WebSocket & Modular SocketCAN Adapter | `backend/app/main.py`, `backend/app/telemetry/can_adapter.py` | REST JSON, CSV text, WebSocket frames, 29-bit CAN frames | `/api/predict`, `/api/telemetry/ingest-csv`, `/ws/telemetry` | `test_can_bus_29bit_extended_frame_encoding_and_decoding` | `IMPLEMENTED` — CAN adapter operates in `SOFTWARE_CODEC_READY_NO_HARDWARE` mode when no USB-CAN transceiver is attached. |
| **I–L** | 10-Screen Workstation UI, `/ready` Probe, `.env.example` | `frontend/src/App.tsx`, `backend/app/main.py`, `.env.example` | Live FastAPI backend | `/health`, `/ready`, `/api/*` | `test_01_02_startup_health_and_readiness_probes` | `IMPLEMENTED` — Production bundle compiles cleanly via `tsc && vite build`. |

---

## 3. Data Dictionary — All 8 Monitored Propulsion Parameter Groups

| Group # | Parameter Group | Schema Field(s) | Unit | Nominal Cruise Range | Warning Limits | Critical Limits | Physics Baseline |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **1** | **Engine RPM** | `rpm` | `RPM` | `4,400 – 5,500` | `< 1,400` or `> 5,650` | `< 1,100` or `> 5,800` | Speed Reference |
| **2** | **Cylinder Head Temperature (CHT)** | `cht_c` | `°C` | `135.0 – 205.0` | `< 90.0` or `> 220.0` | `< 70.0` or `> 245.0` | Yes (`expected.cht_c`) |
| **3** | **Exhaust Gas Temperature (EGT)** | `egt_c` | `°C` | `740.0 – 860.0` | `< 650.0` or `> 885.0` | `< 580.0` or `> 920.0` | Yes (`expected.egt_c`) |
| **4** | **Oil Pressure & Oil Temperature** | `oil_pressure_bar`, `oil_temp_c` | `bar`, `°C` | `2.5–5.2 bar`, `85–112 °C` | `< 2.2 bar`, `> 122 °C` | `< 1.6 bar`, `> 135 °C` | Yes (`expected.oil_pressure_bar`, `expected.oil_temp_c`) |
| **5** | **Fuel-Flow Rate** | `fuel_flow_lph` | `L/h` | `14.0 – 29.5` | `< 8.0` or `> 33.0` | `< 5.0` or `> 38.0` | Yes (`expected.fuel_flow_lph`) |
| **6** | **Vibration Signatures** | `vibration_rms_mms` | `mm/s RMS` | `1.2 – 3.8` | `< 0.5` or `> 5.5` | `< 0.2` or `> 8.0` | Yes (`expected.vibration_rms_mms`) |
| **7** | **Battery & Alternator Health** | `battery_voltage_v`, `alternator_current_a` | `V`, `A` | `13.2–14.4 V`, `12.0–28.0 A` | `< 12.4 V` or `> 14.8 V` | `< 11.8 V` or `> 15.5 V` | Bus Nominal (`13.8 V / 18.0 A`) |
| **8** | **Injection Timing Parameters** | `injection_pulse_ms`, `ignition_advance_deg` | `ms`, `°BTDC` | `5.5–11.5 ms`, `18–28 °BTDC` | `< 3.5` or `> 13.5 ms` | `< 2.0` or `> 16.0 ms` | Yes (`expected.injection_pulse_ms`) |

---

## 4. Model Card & Verified Evaluation Methodology

- **Model Bundle Version:** `DRISHTI-ML-Ensemble-v1.0` (`backend/artifacts/drishti_ml_bundle.joblib` & `backend/artifacts/ppt_100k_ml_bundle.joblib`)
- **Feature Vector (`17` features, causal window $W=20$):**
  - **7 Instantaneous Physics Residuals:** `cht_residual_c`, `egt_residual_c`, `oil_pressure_residual_bar`, `oil_temp_residual_c`, `fuel_flow_residual_lph`, `vibration_residual_mms`, `injection_pulse_residual_ms`
  - **5 Temporal Rolling Statistics:** `cht_rolling_slope_c_per_s`, `oil_pressure_rolling_slope_bar_per_s`, `vibration_rolling_slope_mms_per_s`, `cht_rolling_std_c`, `vibration_rolling_std_mms`
  - **3 Cross-Channel Physical Ratios:** `thermal_to_egt_ratio`, `oil_press_to_rpm_ratio`, `fuel_to_pulse_ratio`
  - **2 Data-Quality Indicators:** `quality_score`, `invalid_or_missing_channel_count`
- **Verified Benchmark Results (Zero Engine Leakage):**

| Benchmark Dataset | Split Configuration | Classification Macro-F1 (Accuracy / Bal Acc) | Anomaly Recall (False Alarm Rate) | RUL MAE / RMSE (`XGBRegressor`) | Sensor Fault Isolation F1 |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **100k-Row / 50-Engine Corpus** (`DRISHTI-SynthCorpus-100k-v2.0`) | `35` Train (`70k`) / `8` Val (`15k`) / `7` Test (`15k`), `0` shared engines | **`0.9853`** (`0.9825` Acc) | **`0.9180`** (`0.0255` Test FAR / `0.0301` Val FAR) | **`8.782 cycles` (`7.571 h`) MAE** / **`11.732 cycles` (`10.163 h`) RMSE** | **`1.0000`** (`1,551/1,551` TP) |
| **54-Trajectory Live-Twin Suite** (`DRISHTI-SynthCorpus-v1.0`) | `36` Train (`1,296` rows) / `18` Test (`648` rows), `0` shared engines | **`0.9769`** (`0.9738` Acc) | **`0.8875`** (`0.0119` Test FAR) | **`2.800 h` (`XGB`) / `2.805 h` (`RF`) MAE** (`3.859 h` / `4.193 h` RMSE) | **`0.7238`** (rule isolator) / **`0.8411`** (RF class F1) |
| **`Marine-Engine-Fault-v1.0`** (Real 3-cyl 257 kW diesel bench, `114,770` rows, `16` runs) | Strict physical-run split: `9` Train (`70,711` rows) / `7` Test (`44,059` rows), `0` shared runs | **6-Class LR: `0.5742` Macro-F1** (`0.6486` Bal Acc, `0.6164` Acc) | **Schmitt-Trigger Hysteresis (`q99/q95, k=3`): `50.37%` Recall (`0.00%` Normal FAR across all `7/7` runs, `0.7518` Bal Acc)** | `NOT_EVALUATED` (short fault runs, no run-to-failure RUL ground truth) | Masked `5,425` thermocouple `999.0` dropout sentinels |
| **`LiU-ICE-Benchmark-DXC25`** (Real 4-cyl turbo SI bench, `288,623` rows, `8` WLTP runs) | Run-disjoint WLTP split: `4` Train (`125,265` rows) / `4` Test (`125,346` rows; `stride=5` $N=21,657$) | **4-Class Unsigned Residual LR: `0.5874` Macro-F1** (`0.6903` Bal Acc, `0.6170` Acc) | **`0.90%` Normal FAR** (`f_pic` `+10%` opposite-sign recall improved from `0.0000` to **`0.9950`**) | `NOT_EVALUATED` (no RUL ground truth) | Air-path sensor gain faults (`f_pic`, `f_pim`, `f_waf`) |

---

## 5. Local Installation, Execution & Deployment Guide

### 5.1 Prerequisites
- **Python:** `3.11+`
- **Node.js & npm:** `Node 18+` / `npm 9+`

### 5.2 Backend Setup & Startup
```powershell
# From project root: <PROJECT_ROOT>/
python -m pip install -r requirements.txt

# Start the FastAPI + WebSocket backend on port 8000
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
- Note: When `frontend/dist` is built, visiting `http://127.0.0.1:8000` serves the full production 3D workstation UI and API from a single process.

### 5.3 Frontend Development Server & Production Build
```powershell
# From <PROJECT_ROOT>/frontend
npm install
npm run dev      # Starts Vite dev server on http://localhost:5173
npm run build    # Runs TypeScript typecheck (tsc) + Vite production bundle build
```

### 5.4 Running the Automated Verification Test Suite
```powershell
# From project root: <PROJECT_ROOT>/
python -m pytest tests/ -v
```

---

## 6. Judge-Ready 5-Minute Demonstration Sequence

1. **Step 1 — Executive Fleet Overview (`Screen 1: Fleet Command Center`):**
   - Show the 6-UAV MALE fleet (`ENG-MALE-01`..`06`), mission readiness advisories (`MISSION GO`, `CONDITIONAL CHECK`, `NO-GO HOLD`), active vs. acknowledged alerts, and click **Acknowledge** on an alert to demonstrate live SQLite persistence.
2. **Step 2 — Synchronized 3D Digital Twin & 4-Value State (`Screen 2: 3D Engine Digital Twin`):**
   - Select `ENG-MALE-02` (`Cylinder Overheating`), click **Stream via WebSocket**, and show how the 3D cylinder head thermal glow, the 4-value cards (`Actual`, `Expected`, `Calculated`, `Predicted`), and the residual bar chart update in real time.
3. **Step 3 — Complete 8-Group Health Monitoring & CSV Import (`Screen 3: Health Monitoring (8 Groups)`):**
   - Show the **SIH26054 Complete 8-Group Propulsion Health Monitoring Matrix** covering RPM, CHT, EGT, Oil P/T, Fuel Flow, Vibration, Battery/Alternator, and Injection Timing. Click **Validate & Ingest CSV Payload** to ingest custom telemetry frames on the fly.
4. **Step 4 — 8-Mode Fault Diagnostics & Sensor Fault Isolation (`Screen 4: Fault Investigation (8 Modes)`):**
   - Switch to `ENG-MALE-05` (`Sensor Fault`) to show how `SensorFaultIsolator` detects an uncorroborated single-channel CHT spike and gates mechanical RUL as `NOT_ESTIMABLE`. Point out the **SIH26054 8-Fault-Category Matrix** and the documented `"Coding degradation"` $\rightarrow$ **Cooling degradation** engineering note.
5. **Step 5 — What-If Fault Simulator & Baseline Comparison (`Screen 5: Mission Simulator`):**
   - Select a preset (e.g., `Hot-Weather Cooling Baffle Degradation` or `High-Altitude Injector Clogging`), click **Execute Deterministic Simulation**, and inspect the **Baseline vs. Post-Scenario Outcome Comparison Table**.
6. **Step 6 — Historical Mission Replay (`Screen 6: Historical Replay`):**
   - Click **Load & Play Mission**, use **Pause**, **Restart (`t=0s`)**, **Step +1 Frame**, and **2x/4x Speed** to scrub across the fault onset timestamp.
7. **Step 7 — Configurable Health Index & RUL (`Screen 7: Predictive Maint & RUL`):**
   - Show dual-unit RUL (`cycles` and `hours`) with 10th–90th percentile bounds, adjust the $\alpha, \beta, \gamma, \delta$ weights or GO threshold in the **Configurable Health Policy Panel**, and click **Reset SIH26054 Defaults (`0.30 / 0.30 / 0.20 / 0.20`)**.
8. **Step 8 — Leak-Free Model Evaluation & Provenance (`Screens 8, 9 & 10`):**
   - Show the side-by-side 54-Trajectory and 100k-Row / 50-Engine held-out metrics, export a JSON engineering report on Screen 9, and review the Dataset Provenance Register on Screen 10.
