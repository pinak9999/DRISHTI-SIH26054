# DRISHTI — AI-Enabled Real-Time Digital Twin for Aero Piston Engine Health Monitoring, Fault Prediction and Mission Reliability

**Problem Statement:** SIH26054  
**Theme:** Robotics & Drones  
**Application Context:** 4-Cylinder Turbocharged Horizontally-Opposed Aero Piston Engines in Medium-Altitude Long-Endurance (MALE) UAVs

> [!IMPORTANT]
> **Engineering Disclosure:**  
> DRISHTI is a locally runnable, deterministic, physics-informed digital-twin software demonstrator built for SIH26054. It uses explicit lumped-parameter reference physics equations (`Rotax914-Simplified-Ref-v1.0`), deterministic 9-class fault transfer functions, leak-free scikit-learn ensemble models (`DRISHTI-ML-Ensemble-v1.0`), and a modular CAN/SocketCAN codec. It does **not** fabricate live aircraft hardware connectivity and does **not** issue certified flight-control or maintenance-release authorizations.

---

## 1. Quick Start & Local Execution Commands

### Prerequisites
- **Python:** 3.11+ (Verified on Python `3.11.9` with `fastapi`, `pydantic`, `uvicorn`, `numpy`, `pandas`, `scipy`, `scikit-learn`, `xgboost==3.2.0`, `joblib`, `pytest`, `httpx`, `websockets`)
- **Node.js:** v20+ / v22+ (Verified on Node `v22.14.0`, npm `10.9.2`)

### Step 1: Start the FastAPI Backend (Terminal 1)
From the repository root (`<PROJECT_ROOT>/`):
```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
- On first startup, the backend automatically:
  1. Trains or loads the leak-free ML ensemble (`backend/artifacts/drishti_ml_bundle.joblib`) and writes the held-out evaluation report (`backend/artifacts/evaluation_report.json`).
  2. Initializes the SQLite database (`backend/artifacts/drishti_twin.db`) and seeds the 6-engine MALE UAV demonstration fleet (`ENG-MALE-01` through `ENG-MALE-06`).
- Interactive OpenAPI documentation is available at: `http://127.0.0.1:8000/docs`

### Step 2: Start the React + TypeScript Engineering Workstation (Terminal 2)
```powershell
cd frontend
npm run dev
```
- Open the Engineering Workstation at: `http://localhost:5173`

### Step 3: Run the PPT-Aligned 100k-Row / 50-Engine Pipeline & Full Automated Verification Suite
From the repository root:
```powershell
python -m backend.app.ml.ppt_100k_pipeline
python -m pytest tests/ -v
```

---

## 2. System Capabilities & Architecture

1. **Versioned Telemetry & Data Contract (`v1.0.0`, 10 Hz Capable)**:
   - Supports `engine_id`, `mission_id`, `timestamp` (with millisecond precision for 10 Hz `sample_interval_sec = 0.1s` streams), `sequence_number`, `mission_elapsed_sec`, `rpm`, `cht_c`, `egt_c`, `oil_pressure_bar`, `oil_temp_c`, `fuel_flow_lph`, `vibration_rms_mms`, `throttle_pct`, `engine_load_pct`, `altitude_m`, `ambient_temp_c`, `battery_voltage_v`, `alternator_current_a`, `injection_pulse_ms`, `ignition_advance_deg`, `data_source`, `units`, and `quality` metadata.
   - Stateful validation for missing-field imputation, duplicate sequence/timestamp detection, out-of-order rejection, stale-gap detection, and sensor plausibility range violations.
2. **Four-Value Physics + AI Digital Twin**:
   - **ACTUAL**: Validated telemetry with per-channel validity flags and quality score.
   - **EXPECTED**: Physics-informed reference estimate (`Rotax914-Simplified-Ref-v1.0`) conditional on RPM, load, altitude (ISA density ratio $\sigma$), and ambient temperature, with explicit extrapolation flagging outside supported operating bounds.
   - **CALCULATED**: Instantaneous residuals ($\text{Actual} - \text{Expected}$), causal rolling means, standard deviations, linear slopes, and thermal/oil/vibration safety margins.
   - **PREDICTED**: 9-class `RandomForestClassifier` fault probabilities, independent `IsolationForest` anomaly score, dedicated `SensorFaultIsolator`, transparent Hybrid Health Indicator ($\text{HI} \in [0, 100]$ with weights $\alpha=0.30, \beta=0.30, \gamma=0.20, \delta=0.20$), and Remaining Useful Life ($\text{RUL}$ via `xgboost.XGBRegressor` + ensemble 10th–90th percentile bounds in both `cycles` and `hours` with `NOT_ESTIMABLE` gating).
3. **100,000-Row / 50-Engine Benchmark Corpus (`DRISHTI-SynthCorpus-100k-v2.0`)**:
   - `100,000` physics-informed telemetry rows across `50` distinct engine units (`ENG-UNIT-001`..`ENG-UNIT-050`) with a strict engine-disjoint `70% Train (35 engines, 70,000 rows) | 15% Validation (8 engines, 15,000 rows) | 15% Test (7 engines, 15,000 rows)` split and zero shared engines (`data/processed/drishti_100k_manifest.json`).
4. **Nine Diagnostic Classes**:
   - `Normal`, `Cylinder Overheating`, `Oil Pressure Drop`, `Crankshaft Bearing Wear`, `Cylinder Misfire`, `Sensor Fault` (`drift`, `stuck_at`, `high_noise`, `missing_samples`, `implausible_values`), `Piston Ring Wear`, `Valve Clearance Issue`, `Fuel Injector Clogging`.
6. **Interactive 3D Aero Piston Engine Digital Twin (`Three.js` + `@react-three/fiber` + `@react-three/drei`)**:
   - Procedural 4-cylinder horizontally-opposed turbocharged aero piston engine assembly (`Rotax 914 class schematic geometry`) with 10 selectable engineering subsystems (`crankcase_assembly`, `crankshaft_train`, `cylinder_bank_port`, `cylinder_bank_stbd`, `cylinder_heads_valves`, `cooling_plenum`, `lubrication_system`, `fuel_injection_rail`, `exhaust_turbo_unit`, `sensor_fadec_harness`).
   - Synchronized to live and replay Four-Value telemetry (`RPM`, `CHT`, `EGT`, `oil_pressure_bar`, `oil_temp_c`, `fuel_flow_lph`, `vibration_rms_mms`, `throttle_pct`, `altitude_m`, `battery_voltage_v`, `injection_pulse_ms`), with continuous Exploded-View inspection (`0%–100%`), camera presets (`ISO`, `TOP`, `FRONT`, `SIDE`, `TURBO`), 3D callouts, and an automatic 2D schematic fallback if WebGL is unavailable.
   - Explicitly discloses that measurements are lumped-engine telemetry and does not fabricate per-cylinder hardware thermocouples where unavailable.

---

## 3. SIH 2026 PPT Alignment, Measured Metrics & Disclosures
**Team:** Wing Warriors2B | **ID:** 187024 | **Problem Statement:** SIH26054 | **Reference:** `Wing_Warriors2B (final).pptx`

### Empirical Ground Truth vs. Slide Claims
As established in `docs/PPT_FIX_LIST.md`, the DRISHTI codebase strictly enforces that **measured empirical model performance is the sole ground truth**. The system never tunes models or thresholds to artificially match presentation claims:

| Evaluation Dimension | PPT Slide Target | Validation Split (8 Engines, 15k) | Held-Out Test Split (7 Engines, 15k) | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Classifier Macro-F1** | `0.92` (92.0%) | `99.10%` | **`98.53%`** | **Pass (Exceeds Target)** |
| **Anomaly Detection Recall** | `0.94` (94.0%) | `92.62%` | **`92.72%`** | **Calibrated (~3% FAR)** |
| **Anomaly False Alarm Rate** | `0.03` (3.0%) | `3.01%` | **`2.98%`** | **Pass (Satisfies ≤3.0%)** |
| **RUL XGBoost MAE** | `18.6 cyc` | `8.44 cyc` | **`8.62 cyc`** (`12.92 h`) | **Pass (Exceeds Target)** |
| **RUL XGBoost RMSE** | `27.4 cyc` | `11.27 cyc` | **`11.41 cyc`** (`17.12 h`) | **Pass (Exceeds Target)** |
| **Sensor Fault Isolation F1** | `0.91` (91.0%) | `100.0%` | **`100.0%`** | **Pass (Zero False Alarms)** |

### Target Architecture vs. Active Prototype Disclosures
| Architectural Tier | PPT Slide Claim | Prototype Implementation | Status Flag in Product |
| :--- | :--- | :--- | :--- |
| **Edge Compute** | NVIDIA Jetson Orin Nano | FastAPI Python daemon with C-level Cython/scikit-learn tree pointers (<5ms inference) | `PLANNED (Target Edge Arch)` |
| **Avionics Bus** | Direct CANaerospace / ARINC-429 | `SocketCAN` codec (python-can) supporting vcan0 / loopback fallback | `PLANNED (Hardware Ingestion)` |
| **Time-Series Store** | TimescaleDB / PostgreSQL | High-performance SQLite in WAL mode with circular telemetry memory buffer | `PLANNED (Enterprise DB)` |
| **Telemetry Streaming** | MQTT / DDS pub-sub broker | Bi-directional WebSockets (`/ws/telemetry`) streaming at 10 Hz | `PLANNED (Broker Tier)` |
| **Sensor Localization** | Cylinder-specific misfire/overheat | Lumped telemetry with inferential subsystem mapping and explicit disclosure badges | `INFERRED (Lumped Telemetry)` |

---

## 4. REST & WebSocket API Reference

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health, model versions, latency, and CAN adapter status |
| `GET` | `/api/model-status` | Held-out ML evaluation report, physics metadata, and data-quality rejection stats |
| `POST` | `/api/model-retrain` | Re-run leak-free dataset generation, training, and held-out evaluation |
| `GET` | `/api/catalog` | 9 fault classes, signal transformations, 7 mission presets, physics envelope |
| `GET` | `/api/fleet` | Multi-engine fleet matrix, health counts, and recent alerts |
| `POST` | `/api/fleet/seed` | Deterministically reset and re-seed the 6-engine MALE UAV fleet |
| `GET` | `/api/engines` | List all monitored engines |
| `GET` | `/api/engines/{engine_id}` | Engine summary, latest Four-Value state, and alerts |
| `GET` | `/api/engines/{engine_id}/telemetry` | Paginated Four-Value Digital Twin time-series (`limit`, `offset`, `mission_id`) |
| `GET` | `/api/engines/{engine_id}/health` | Health Indicator breakdown, weights, and RUL degradation trajectory |
| `GET` | `/api/engines/{engine_id}/alerts` | Explainable alerts for the specified engine |
| `POST` | `/api/alerts/{alert_id}/acknowledge` | Acknowledge or unacknowledge an explainable fault alert |
| `POST` | `/api/predict` | Process a single `TelemetryInputFrame` into a `FourValueDigitalTwinState` + `ExplainableAlert` |
| `POST` | `/api/simulations` | Execute a deterministic fault/mission scenario and generate an engineering report |
| `GET` | `/api/simulations/{simulation_id}` | Retrieve saved simulation metadata, telemetry, and alerts |
| `POST` | `/api/telemetry/ingest-csv` | Validate and ingest historical CSV telemetry |
| `POST` | `/api/replay/start` | Initialize mission replay with mission ID, speed, and start index |
| `POST` | `/api/replay/stop` | Pause active mission replay |
| `POST` | `/api/replay/seek` | Seek replay to a frame index, timestamp, or elapsed time |
| `POST` | `/api/replay/step` | Advance replay by $N$ frames |
| `GET` | `/api/replay/status` | Retrieve synchronized replay telemetry slice and alert timeline |
| `GET` | `/api/missions` | List all recorded and simulated missions |
| `GET` | `/api/reports` | List all generated engineering evaluation reports |
| `GET` | `/api/reports/{report_id}` | Retrieve full engineering evaluation report by ID |
| `WS` | `/ws/telemetry?engine_id=...` | Stream live Four-Value Digital Twin states and alerts over WebSockets |

---

## 5. Repeatable 11-Step End-to-End Demo Walkthrough

You can step through this workflow using the **11-Step Guided Walkthrough bar** at the top of the UI (`http://localhost:5173`):

1. **Step 1 (Start Application):** Start the FastAPI server (`port 8000`) and Vite workstation (`port 5173`). Confirm the top bar displays `API: ONLINE`.
2. **Step 2 (Load Seeded Fleet):** On **1. Fleet Command Center**, review the 6-engine fleet (`ENG-MALE-01` through `ENG-MALE-06`) or click **Reset / Seed Demo Fleet**.
3. **Step 3 (Open Engine & Telemetry):** Click **Open 4-Value Twin** on `ENG-MALE-01` (or select it in the top engine selector) to open **2. Engine Digital Twin**.
4. **Step 4 (Show Actual & Physics-Expected Together):** Inspect the `1. ACTUAL` and `2. EXPECTED` cards and the dual-trace `Actual vs Physics-Expected` CHT, EGT, Oil Pressure, and Vibration charts.
5. **Step 5 (Calculate & Display Residuals):** Inspect the `3. CALCULATED (RESIDUALS)` card and the `Instantaneous Residual Profile` bar chart showing $\Delta\text{CHT}$, $\Delta\text{EGT}$, $\Delta P_{\text{oil}}$, and $\Delta V_{\text{rms}}$.
6. **Step 6 (Start Deterministic Fault Scenario):** Navigate to **5. Mission Simulator**, select `ENG-MALE-01`, `Cylinder Overheating`, `onset_time_sec = 15`, `severity = 0.80`, `random_seed = 2026`, and click **Execute Deterministic Simulation**.
7. **Step 7 (Show Anomaly Detector & Classifier Outputs):** Navigate to **4. Fault Investigation** to view the 9-class Random Forest probability distribution (`Cylinder Overheating` top probability) and the `IsolationForest` anomaly score vs calibrated threshold.
8. **Step 8 (Show Evidence Behind Alert):** In **4. Fault Investigation**, inspect the generated `ExplainableAlert` card showing exact actual-vs-expected residual deviations, model/rule versions, `SIMULATED` badge, and maintenance inspection recommendations.
9. **Step 9 (Display RUL with Gating):** Navigate to **7. Predictive Maint & RUL** to view the estimated RUL in `hours` with 10th–90th percentile bounds. Then switch the active engine to `ENG-MALE-05` (`Sensor Fault`) to verify that RUL automatically displays `NOT ESTIMABLE` with an explicit sensor-fault gating rationale.
10. **Step 10 (Replay Mission & Synchronize Alerts):** Navigate to **6. Historical Replay**, load the simulated mission, scrub to `t = 5s` (before onset — 0 alerts), and play or scrub past `t = 15s` to watch the alert timeline synchronize with the telemetry cursor.
11. **Step 11 (Export Engineering Report):** Navigate to **9. Reports & Settings**, select the generated report (`RPT-...`), and click **Export Engineering Report (JSON)**.

---

## 6. Troubleshooting Guide

- **`Backend API unreachable` in UI:** Ensure the FastAPI server is running on `http://127.0.0.1:8000` (`python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`).
- **Resetting corrupted SQLite state or re-training models:** Delete `backend/artifacts/drishti_twin.db` or click **Reset / Seed Demo Fleet** in Screen 1 and **Re-Run Leak-Free Training & Evaluation** in Screen 8.
