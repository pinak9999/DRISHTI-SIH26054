# DRISHTI SIH26054 — Final Forensic Verification Summary

**Date:** 2026-10-04  
**Project:** DRISHTI — AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs  
**Problem Statement:** SIH26054 — DRDO | **Team ID:** 187024 (`Wing Warriors2B`)  
**Audited Presentation Versions:**
- `Team_Drishti_SIH26054 (1).pptx` (6 slides, `2026-09-29 22:09`) & `Team_Drishti_SIH26054.pptx` (5 slides, `2026-09-29 14:15`)
- `Drishti-DT_SIH26054 (1) (1).pptx` (6 slides, `2026-10-02 05:17` — latest timestamp), `Drishti-DT_SIH26054_v2.pptx`, `Drishti-DT_SIH2026.pptx`

---

## 1. Executive Final Verdict

**Overall Project Readiness & Verification Verdict:** **SUBSTANTIALLY VERIFIED AS A REPRODUCIBLE, EVIDENCE-BACKED SIH26054 ENGINEERING DEMONSTRATOR (`34/50` total claims `VERIFIED`, `4/50` `PARTIALLY VERIFIED`, `6/50` numerical metric `MISMATCHES` documented honestly without data tampering, `2/50` stack/protocol claims `NOT IMPLEMENTED`, and `4/50` physical field/business impact claims `NOT VERIFIABLE` in software).**

The DRISHTI repository (`<PROJECT_ROOT>/`) is a functioning, deterministic, end-to-end aerospace digital-twin software platform comprising:
- **FastAPI Backend (`29` registered routes + WebSocket `/ws/telemetry`)** backed by **SQLite WAL persistence (`drishti_twin.db`)**.
- **Thermodynamic & Mechanical Reference Baseline (`Rotax914-Simplified-Ref-v1.0`)** computing physics-expected CHT, EGT, oil pressure/temperature, fuel flow, vibration, manifold pressure, and battery voltage across altitude/ambient/load regimes.
- **Four-Value Digital Twin State (`Actual`, `Expected`, `Calculated`, `Predicted`)** persisted per telemetry frame and rendered across all **8 React/TypeScript/Three.js engineering screens**.
- **Dual ML Evaluation Benchmarks (Persisted & Reproducible):**
  1. **100k-Row / 50-Engine PPT Benchmark (`drishti_100k_dataset.npz`, `ppt_100k_ml_bundle.joblib`, `ppt_100k_evaluation_report.json`):** `100,000` rows across `50` engine units (`35` train = `70,000` rows, `8` val = `15,000` rows, `7` test = `15,000` rows, `0` shared engine IDs), using `RandomForestClassifier`, `IsolationForest` (calibrated at `3%` normal validation FAR), and `XGBRegressor` (dual-unit RUL in `cycles` and `hours`).
  2. **54-Trajectory Live-Twin Suite (`drishti_ml_bundle.joblib`, `ml_evaluation_report.json`):** `3,270` rows across `54` trajectories (`100,000 + 3,270 = 103,270` total synthetic rows, matching the `~103k synthetic rows` claim in `Drishti-DT_SIH26054 (1) (1).pptx`).
- **Verified Automated Test & Build Suite:**
  - `python -m pytest tests/ -v`: **`41 passed` (`0` failed)**
  - `npm run build` (`tsc && vite build`): **Succeeded (`0` TypeScript/Vite errors)**

---

## 2. Summary of Audited Claims by Status

### 2.1 Numerical Claims (`32` Audited in `docs/PPT_NUMERIC_VERIFICATION.csv`)

| Status | Count | Summary of Claims |
| --- | :---: | --- |
| **`VERIFIED`** | **19** | `SIH26054`, Team ID `187024`, `92%` schematic HI example (`[0..100]` scale), `30+ hr` endurance profile (`endurance_30hr_degradation`), `45°C+` hot-weather profile (`hot_weather_high_temp`), `5` core telemetry parameters, `8` full sensor channels (RPM, CHT, EGT, Oil P/T, Fuel flow, Vibration, Batt/Alt, Inj. timing), `8` fault modes (`9` classes including `Normal`), `4`-value twin (`Actual`, `Expected`, `Calculated`, `Predicted`), `0–100` Health Index range, `100,000` rows, `~103k` total synthetic rows (`103,270`), `50` engine units, `17` engineered features, `70%` train (`70,000` rows / `35` engines), `15%` validation (`15,000` rows / `8` engines), `15%` test (`15,000` rows / `7` engines), `0` engine overlap across splits, Isolation Forest `FAR = 0.03` (`0.0301` val / `0.0255` test), Hybrid Health Index weights `α=0.30, β=0.30, γ=0.20, δ=0.20`, and `₹0` open-source software cost. |
| **`MISMATCH`** | **6** | Honest empirical test metrics vs. static PPT slide values (no test labels or model outputs were falsified):<br>1. **Random Forest Macro-F1:** `0.9853` (100k test) / `0.8950` (54-traj test) vs. PPT `0.92`<br>2. **Isolation Forest Recall:** `0.9180` (100k test) / `0.8781` (54-traj test) vs. PPT `0.94`<br>3. **XGBoost RUL MAE:** `8.785 cycles` (`4.294 h` on 100k test) vs. PPT `18.6 cycles` (`18.6` was also reused on Slide 2 of `Drishti-DT` as "Fault detection lead time")<br>4. **XGBoost RUL RMSE:** `11.758 cycles` (`5.752 h` on 100k test) vs. PPT `27.4 cycles`<br>5. **Sensor Fault F1:** `1.0000` (100k test) / `0.9600` (54-traj test) via `SensorFaultIsolator + RandomForest` vs. PPT `0.91` (`Isolation Forest`)<br>6. **9×9 Confusion Matrix Cells:** Actual 100k test matrix achieves `0.955–1.000` diagonal recall across all 9 classes vs. illustrative PPT matrix (`0.89–0.95` diagonal). |
| **`PARTIALLY VERIFIED`** | **3** | 1. **Operating Altitude `10,000–30,000 ft` (`3,048–9,144 m`):** Physics model computes up to `10,000 m` (`32,808 ft`), flagging `altitude_m > 7,000 m` (`22,965 ft`) with `is_extrapolated=True`.<br>2. **`10 Hz` Sampling Frequency:** Supported by `TelemetryInputFrame` (`dt_sec=0.1`), `SimulationScenarioConfig`, and `test_ten_hz_simulation_and_ingestion_support`, whereas default seeded fleet demos use `1 Hz` (`sample_interval_sec=1.0`).<br>3. **`4 UAVs` Fleet Scenario:** Live seeded fleet has `6 UAVs` (`ENG-MALE-01`..`06`) and the 100k corpus has `50` engine units (`> 4`). |
| **`NOT VERIFIABLE`** | **4** | Business/field-trial projections on Slide 5 (`40%` fewer unplanned groundings, `25%` lower maintenance cost, `+15%` engine operational life) and project roadmap/video placeholder (`6-month` physical bench test roadmap, `60s` YouTube placeholder link). |

### 2.2 Architectural, Feature & Tech-Stack Claims (`18` Audited)

- **`VERIFIED` (`15`):**
  1. Physics-informed residual generation (`Actual - Expected`) across all primary channels.
  2. Sliding-window temporal feature extraction (`17` features over `W=20` frames).
  3. 9-class Random Forest fault classification (`Normal` + 8 fault modes).
  4. Unsupervised Isolation Forest anomaly detection calibrated on validation normal frames.
  5. XGBoost (`xgboost==3.2.0`) RUL regression in both `cycles` and `hours` with 10th–90th percentile uncertainty intervals.
  6. Dedicated Sensor Fault Isolation (`SensorFaultIsolator`) separating sensor drift/spike/dropout from physical engine degradation.
  7. Weighted Hybrid Health Index (`0.30, 0.30, 0.20, 0.20`) with explicit `health_breakdown` telemetry payload.
  8. Automated Pre-Flight / In-Flight Mission Readiness Recommendation (`GO`, `GO WITH PRECAUTION`, `NO-GO / ABORT RECOMMENDED`).
  9. Real-time WebSocket streaming (`/ws/telemetry`) + REST API (`29` routes).
  10. Interactive 3D Engine Digital Twin (`EngineTwinViewport3D.tsx`, React Three Fiber) with subsystem thermal/fault highlighting.
  11. What-If Fault Injection Simulator (`/simulator`, `POST /api/simulations`) with deterministic seeded scenarios.
  12. Historical Mission Replay (`/replay`, `/api/replay/*`) with play/pause/step/seek.
  13. Exportable JSON & Print/PDF Engineering Reports (`/reports`, `/api/reports/{id}`).
  14. Verified Public Real-World Piston-Engine Benchmarks (`LiU-ICE` 4-cylinder SI benchmark + `Marine 2-Stroke Diesel` fault dataset) evaluated with zero leakage in Phases 2–4.
  15. Simulated `SocketCAN` 29-bit extended-ID frame encoder/decoder (`backend/app/telemetry/can_adapter.py`).
- **`PARTIALLY VERIFIED` (`1`):**
  - **CAN Bus Ingestion:** Frame-level `SocketCAN` packing/unpacking is implemented and unit-tested, but runs in software simulation mode without physical USB-CAN hardware attached.
- **`NOT IMPLEMENTED` (`2`):**
  1. **MQTT Broker Ingestion (`paho-mqtt` / Mosquitto):** Not implemented; ingestion uses WebSocket, REST, CSV upload, and simulated `SocketCAN`.
  2. **Secondary Slide 3 Tech-Stack Buzzwords (`Drishti-DT` family):** `Node.js/Express`, `PyTorch`, `PostgreSQL`, `Docker`, `Socket.IO`, `Tailwind CSS`, `TLS/SSL`, and `Federated learning` are not used because the project is built on **FastAPI + SQLite + scikit-learn/XGBoost + React/Vite/Three.js/Recharts + native WebSocket**.

---

## 3. Defects Fixed During This Forensic Verification

1. **Added Cycle-Unit RUL Trajectory Fields to `GET /api/engines/{engine_id}/health` ([main.py](backend/app/main.py#L162-L180)):**
   - Included `rul_cycles`, `rul_lower_10_cycles`, and `rul_upper_90_cycles` alongside `rul_hours` in every `degradation_trajectory` point.
2. **Persisted the Trained 100k-Row / 50-Engine Model Bundle ([ppt_100k_pipeline.py](backend/app/ml/ppt_100k_pipeline.py#L868-L905)):**
   - Saved `backend/artifacts/ppt_100k_ml_bundle.joblib` (`scaler`, `iso_scaler`, `classifier`, `anomaly_detector`, `xgb_rul_cycles`, `xgb_rul_hours`, `anomaly_threshold`) so the 100k benchmark models can be reloaded and verified directly without retraining.
3. **Separated Live-Twin vs. 100k-Row PPT Benchmark KPIs on `/evaluation` ([RulEvalAndReportsScreens.tsx](frontend/src/screens/RulEvalAndReportsScreens.tsx#L325-L418)):**
   - Clearly labeled the **54-Trajectory Live-Twin Suite (`1,095` test frames)** and the **100k-Row / 50-Engine PPT Benchmark (`15,000` test rows)** on the Model Evaluation screen so reviewers can inspect both benchmarks side-by-side without ambiguity.

---

## 4. Index of Forensic Verification Deliverables

1. [docs/PPT_VS_CODE_FORENSIC_AUDIT.md](docs/PPT_VS_CODE_FORENSIC_AUDIT.md) — Slide-by-slide forensic audit across all PPT versions.
2. [docs/PPT_NUMERIC_VERIFICATION.csv](docs/PPT_NUMERIC_VERIFICATION.csv) — 32-row numerical verification ledger with units, target/actual values, and statuses.
3. [docs/SIH26054_REQUIREMENT_TRACEABILITY.md](docs/SIH26054_REQUIREMENT_TRACEABILITY.md) — Traceability matrix for Problem Statement SIH26054 (Sections A–G).
4. [docs/DASHBOARD_DATA_SOURCE_AUDIT.md](docs/DASHBOARD_DATA_SOURCE_AUDIT.md) — Every frontend screen and widget traced to its exact API endpoint and backend calculation.
5. [docs/REMAINING_GAPS.md](docs/REMAINING_GAPS.md) — Complete register of metric discrepancies, unimplemented stack claims, and non-verifiable field projections.
6. [docs/INDEPENDENT_TEST_RESULTS.md](docs/INDEPENDENT_TEST_RESULTS.md) — Commands, environment versions, exit codes, and test/build logs.
7. [DRISHTI_SIH26054_VERIFIED.zip](DRISHTI_SIH26054_VERIFIED.zip) — Clean, verified project archive.
