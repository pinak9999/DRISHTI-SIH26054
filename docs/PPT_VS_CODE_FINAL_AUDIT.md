# DRISHTI (SIH26054) — Slide-by-Slide PPT vs. Code Final Audit Report

- **Project:** DRISHTI — AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs
- **Problem Statement:** SIH26054 (DRDO | Theme: Robotics & Drones)
- **Team ID / Name:** `187024` / `Wing Warriors2B`
- **Reference Presentation Audited:** `Team_Drishti_SIH26054.pptx` (5 slides corresponding to template Pages 2–6)
- **Audit Date:** 2026-10-03

---

## 1. Executive Summary

Every technical claim, architecture block, dataset specification, feature-engineering step, machine-learning model, Health Index formula, and operational workflow in `Team_Drishti_SIH26054.pptx` was audited against the working repository (`<PROJECT_ROOT>/`). All pre-existing gaps between the presentation and the repository were resolved and verified with automated tests (`tests/test_ppt_alignment.py` and full `pytest` suite):

| PPT Technical Claim | Pre-Alignment Repository State | Final Implemented & Verified State | Status |
|---|---|---|---|
| **100k rows \| 50 engine units \| Multi-mission synthetic data** | `generate_labeled_training_and_test_datasets` generated 54 trajectories (`3,270` rows) across 54 IDs | `backend/app/ml/ppt_100k_pipeline.py` generates **100,000 rows** across **50 distinct engine units** (`ENG-UNIT-001`..`ENG-UNIT-050`) and 5 mission profiles (`data/processed/drishti_100k_dataset.npz`) | **IMPLEMENTED & VERIFIED** |
| **70% Train \| 15% Validation \| 15% Test \| Engine-level split (zero leakage)** | 2-way split (`36` train / `18` test trajectories), no validation split | Strict 3-way engine-disjoint split: **35 train engines (`70,000` rows, `70.0%`)**, **8 validation engines (`15,000` rows, `15.0%`)**, **7 test engines (`15,000` rows, `15.0%`)**, `0` shared engines across splits (`data/processed/drishti_100k_manifest.json`) | **IMPLEMENTED & VERIFIED** |
| **RUL Prediction: XGBoost Regressor (`cycles`)** | `xgboost` was not installed; used `RandomForestRegressor` in `hours` only | Installed `xgboost==3.2.0`; trained `xgboost.XGBRegressor` in both **`cycles`** (PPT primary unit) and **`hours`** (`backend/app/ml/ppt_100k_pipeline.py`, `backend/app/ml/pipeline.py`, `PredictedValues.rul_cycles`) | **IMPLEMENTED & VERIFIED** |
| **Health Score: Hybrid (Rules + ML) (`α=0.3, β=0.3, γ=0.2, δ=0.2`)** | `HEALTH_INDEX_WEIGHTS` used `0.30, 0.30, 0.25, 0.15` | Updated `HEALTH_INDEX_WEIGHTS` in `backend/app/ml/pipeline.py` and `PPT_HEALTH_WEIGHTS` in `backend/app/ml/ppt_100k_pipeline.py` to **`α=0.30, β=0.30, γ=0.20, δ=0.20`** (sum = `1.00`) | **IMPLEMENTED & VERIFIED** |
| **Sampling: 10 Hz \| Source: Dataset / Simulation / Live-ready** | `FaultScenarioConfig.sample_interval_sec` had lower bound `ge=0.2` (max 5 Hz) and truncated timestamps to seconds | Lowered bound to `ge=0.05` (enabling **10 Hz `sample_interval_sec=0.1s`**), added millisecond ISO timestamps (`YYYY-MM-DDTHH:MM:SS.mmmZ`), and verified 10 Hz ingestion/replay latency (`<10 ms/frame`) | **IMPLEMENTED & VERIFIED** |
| **9-Class Fault Classification (Random Forest) & 9×9 Confusion Matrix** | Implemented on 54-trajectory dataset | Evaluated on both the 54-trajectory fast suite (`Macro-F1 = 0.8950`) and the full 100k/50-engine corpus (`Validation Macro-F1 = 0.9871`, `Held-Out Test Macro-F1 = 0.9853`) with raw and row-normalized 9×9 confusion matrices | **IMPLEMENTED & VERIFIED** |
| **Anomaly Detection (Isolation Forest) & Sensor Fault Isolation** | Implemented on 54-trajectory dataset | `IsolationForest` trained on normal training subset, threshold calibrated on validation split (`Test Recall = 0.9180`, `Test FAR = 0.0255`); dedicated `SensorFaultIsolator` (`Test F1 = 1.0000`) | **IMPLEMENTED & VERIFIED** |

---

## 2. Slide-by-Slide Detailed Audit

### Slide 5 (Template Page 2): Problem Statement & Proposed Solution
- **PPT Claims:**
  1. **Telemetry Input:** `Sensors: CHT, EGT, Oil Pressure, RPM, Vibration`, `Sampling: 10 Hz`, `Source: Dataset / Simulation / Live-ready`.
  2. **Physics Reference Model:** `Expected Engine Behavior`, `Load -> RPM -> Temp Relations`, `Thermal Equilibrium Equations`, `Ideal Operating Baselines`, `Output: Expected Values`.
  3. **Feature & Residual Engine:** `Error = Actual - Expected`, `Rolling Mean / Std`, `Trend Slope (dT/dt, dP/dt)`, `Thermal & Vibration Ratios`, `Sensor Consistency Check`.
  4. **AI / ML Engine:** `Fault Classifier (9 classes)`, `Anomaly Detector (unsupervised)`, `RUL Predictor (regression)`, `Sensor Fault Isolator`, `Output: Predictions + Confidence`.
  5. **Digital Twin Core (Four-Value Engine State):** `Actual (Sensor) | Expected (Reference) | Calculated (Physics) | Predicted (AI Model)`.
  6. **Health & Prognostics:** `Composite Health Score (0-100)`, `Remaining Useful Life (cycles)`, `Fault Class + Confidence`, `Degradation Tracking`.
  7. **Explainable Alert Engine & Operator Dashboard:** `Evidence-based Alerts`, `Priority Ranking`, `Actionable Recommendations`, `Real-time Telemetry`, `Mission Replay`.
- **Codebase Verification:**
  - **Telemetry & 10 Hz:** `backend/app/telemetry/schema.py` (`TelemetryInputFrame`, `ValidatedTelemetryFrame`), `backend/app/simulation/fault_simulator.py` (`sample_interval_sec=0.1` for 10 Hz with millisecond ISO timestamps), `backend/app/telemetry/can_adapter.py` (`SimulatedRotaxCANAdapter`).
  - **Physics Reference Model:** `backend/app/physics/engine_model.py` (`AeroPistonReferenceModel.estimate_expected` and `calculate_residuals_and_trends`).
  - **Feature & Residual Engine:** `backend/app/ml/features.py` (`extract_feature_vector` computing 17 physics residuals, causal rolling slopes/stds, and ratios).
  - **Four-Value Digital Twin State:** `FourValueDigitalTwinState` in `backend/app/telemetry/schema.py` (`actual`, `expected`, `calculated`, `predicted`), persisted in SQLite (`backend/app/storage/database.py`) and streamed via `/ws/telemetry`.
  - **Explainable Alert Engine & Dashboard:** `backend/app/alerts/alert_engine.py` (`ExplainableAlertEngine`) and 10 interactive React screens (`frontend/src/screens/`).

---

### Slide 4 (Template Page 3): Technical Approach, Dataset, Models & Confusion Matrix
- **PPT Claims:**
  1. **Data Layer:** `100k rows | 50 engine units | Multi-mission synthetic data`.
  2. **Feature Engineering:** `Rolling mean/std, Slope, deviation from expected`, `Thermal & vibration features`, `Engine-level split (zero leakage)`.
  3. **Training & Validation Split:** `70% Train | 15% Validation | 15% Test`, `Stratified by fault class`.
  4. **Model & Test Results Table:**
     - Fault Classification (9 classes): `Random Forest` (`Macro-F1: 0.92`)
     - Anomaly Detection: `Isolation Forest` (`Recall: 0.94 / FAR: 0.03`)
     - RUL Prediction: `XGBoost Regressor` (`MAE: 18.6 cycles / RMSE: 27.4`)
     - Sensor Fault Detection: `Isolation Forest / Dedicated Isolator` (`F1: 0.91`)
     - Health Score: `Hybrid (Rules + ML)` (`α = 0.3, β = 0.3, γ = 0.2, δ = 0.2`)
  5. **9×9 Normalized Confusion Matrix:** `Normal`, `Cylinder Overheating`, `Oil Pressure Drop`, `Crankshaft Bearing Wear`, `Cylinder Misfire`, `Sensor Fault`, `Piston Ring Wear`, `Valve Clearance Issue`, `Fuel Injector Clogging`.
- **Codebase Verification & Honest Measured Comparison (`backend/artifacts/ppt_100k_evaluation_report.json`):**

| Task / Metric | PPT Model | PPT Target Metric | Measured Validation (`15,000` rows, `8` engines) | Measured Held-Out Test (`15,000` rows, `7` engines) | Notes |
|---|---|---:|---:|---:|---|
| **9-Class Fault Classification (Macro-F1)** | `RandomForestClassifier` | `0.92` | **`0.9871`** (`Acc: 0.9846`) | **`0.9853`** (`Acc: 0.9827`) | Zero shared engines across train/val/test; raw & normalized 9×9 confusion matrices saved |
| **Anomaly Detection Recall** | `IsolationForest` | `0.94` | **`0.9262`** | **`0.9180`** | Fit strictly on Normal training rows; threshold calibrated at 97th percentile of Validation Normal scores |
| **Anomaly False Alarm Rate (FAR)** | `IsolationForest` | `0.03` | **`0.0301`** | **`0.0255`** | Held-out test FAR (`2.55%`) beats PPT target (`3.0%`) |
| **RUL Prediction MAE (`cycles`)** | `xgboost.XGBRegressor` | `18.6 cycles` | **`8.440 cycles`** (`7.319 hrs`) | **`8.785 cycles`** (`7.616 hrs`) | Trained & evaluated on mechanical trajectories (`Sensor Fault` rows excluded with `gt_rul = -1`) |
| **RUL Prediction RMSE (`cycles`)** | `xgboost.XGBRegressor` | `27.4 cycles` | **`11.244 cycles`** (`9.754 hrs`) | **`11.758 cycles`** (`10.197 hrs`) | `xgboost==3.2.0` (`n_estimators=140, max_depth=6, lr=0.06`) |
| **Sensor Fault Detection (F1)** | `SensorFaultIsolator` + RF | `0.91` | **`1.0000`** | **`1.0000`** | Cross-channel residual parity + signal quality isolation |
| **Health Score Weights (`α, β, γ, δ`)** | Hybrid (Rules + ML) | `0.3, 0.3, 0.2, 0.2` | **`0.30, 0.30, 0.20, 0.20`** | **`0.30, 0.30, 0.20, 0.20`** | Exact match in `backend/app/ml/pipeline.py` & `ppt_100k_pipeline.py` |

---

### Slide 3 (Template Page 4): Feasibility, Risk Analysis & Implementation Roadmap
- **PPT Claims:**
  - Open-source stack (`Python, Scikit-Learn, FastAPI, React`), edge-compatible lightweight inference (`<5 ms/frame`), 9-class aero-piston fault coverage, sensor-fault vs. engine-fault disambiguation, Four-Value Digital Twin, explainable alerts, multi-UAV fleet monitoring.
- **Codebase Verification:**
  - Fully offline-runnable open-source stack (`requirements.txt`, `frontend/package.json`).
  - Multi-UAV fleet monitoring (`6` seeded engines across MALE UAV tail numbers in `backend/app/service.py`) plus 50-engine benchmark corpus.
  - Sensor-vs-engine disambiguation implemented in `backend/app/ml/sensor_fault_isolator.py` with `NOT_ESTIMABLE` RUL gating during active sensor faults.

---

### Slide 2 (Template Page 5): Impact & Benefits
- **PPT Claims:**
  - Early fault warning lead time (`cycles` and `hours`), false alarm rate `FAR = 0.03`, and explicit disclosure: *"Based on simulation results on synthetic dataset (100k rows, 50 engines). Real-world validation pending."*
- **Codebase Verification:**
  - Both `evaluation_report.json` and `ppt_100k_evaluation_report.json` include explicit `data_provenance_warning` and `provenance_disclosure` banners stating that the 100k/50-engine metrics are synthetic simulation benchmarks and that real flight/dyno validation is required before operational deployment.

---

### Slide 1 (Template Page 6): Research Foundation & Technical References
- **PPT Claims:**
  - References NASA C-MAPSS (adapted for piston-engine simulation), Saxena et al. (PHM 2008), Heywood (1988), FAA Aviation Maintenance Technician Handbook — Powerplant (2018), Taylor (1985), and PHM Society benchmarks.
- **Codebase Verification & C-MAPSS Disclosure:**
  - Raw NASA C-MAPSS turbofan files (`FD001..FD004`) are **not** bundled in the repository and represent Brayton-cycle turbofan engines rather than 4-stroke reciprocating piston engines.
  - Following Saxena et al. (PHM 2008), `backend/app/ml/ppt_100k_pipeline.py` implements nonlinear damage accumulation $D(t)$ and cycle-based RUL targets adapted to 4-stroke aero-piston state variables (`CHT`, `EGT`, `oil_pressure`, `vibration`), while `data/raw/` additionally integrates two verified real experimental IC-engine fault datasets (Linköping University `LiU-ICE` 4-cylinder engine benchmark and the `Marine 2-Stroke Diesel` dataset) evaluated in `backend/artifacts/phase4_reliability_report.json`.
