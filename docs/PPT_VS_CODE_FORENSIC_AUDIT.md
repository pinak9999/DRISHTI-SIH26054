# DRISHTI (SIH26054) — Complete PPT vs. Project Forensic Verification Report

- **Project:** DRISHTI — AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs
- **Problem Statement:** SIH26054 (`DRDO` | Theme: `Robotics & Drones`)
- **Team ID / Name:** `187024` / `Wing Warriors2B` (`Team Drishti`)
- **Forensic Audit Date:** 2026-10-03 / 2026-10-04
- **Audited Workspace Root:** [`<PROJECT_ROOT>/`](file:///<PROJECT_ROOT>/)

---

## Phase 1: Identification of Authoritative Presentation Sources

Per Phase 1 (*"If multiple PPTs or reports exist, list them and identify which version is being audited. Never silently choose a version if the authoritative final PPT is ambiguous"*), all presentation files in `<LOCAL_PYTHON_ENV>` were located and extracted (`<LOCAL_PYTHON_ENV>`):

| File Name | Size (Bytes) | Last Modified (Local) | Slides | Variant Family & Role in Audit |
|---|---:|---|---:|---|
| `Team_Drishti_SIH26054.pptx` | `1,843,035` | `2026-10-01 19:44:35` | `5` (Template Pages 2–6) | **Primary Authoritative Deck (Family A1):** Explicitly specified in the project alignment prompt; contains the 100k/50-engine dataset spec, 70/15/15 split, 9×9 Normalized Confusion Matrix, and 5-row Model Performance table. |
| `Team_Drishti_SIH26054 (1).pptx` | `1,645,396` | `2026-10-01 20:03:28` | `6` (Pages 1–6) | **Primary Authoritative Deck with Title Slide (Family A2):** Identical technical content to `Team_Drishti_SIH26054.pptx` (`Slides 2–6`) plus `Slide 1` Title Page (`Team Id – 187024`, `Team Name – Wing Warriors2B`). |
| `Drishti-DT_SIH26054 (1) (1).pptx` | `1,717,145` | `2026-10-02 05:17:11` | `6` (Pages 1–6) | **Secondary Redesigned Deck (Family B — Latest Timestamp):** Same core ML test-set table (`Macro-F1 0.92`, `Recall 0.94, FAR 0.03`, `XGBoost MAE 18.6, RMSE 27.4 cycles`, `Sensor fault F1 0.91`, `α=0.3, β=0.3, γ=0.2, δ=0.2`), plus explicit 8-sensor (`RPM, CHT, EGT, Oil P & T, Fuel flow, Vibration, Batt/Alt, Inj. timing`) and 8-fault mapping table on Slide 2, `~103k synthetic rows`, and expanded tech-stack labels on Slide 3. |
| `Drishti-DT_SIH26054_v2.pptx`, `Drishti-DT_SIH26054 (1).pptx`, `Drishti-DT_SIH26054.pptx`, `Drishti-DT_SIH2026.pptx`, `Drishti-DT_SIH26054 (1) 1.pptx` | `686,388` – `784,499` | `2026-10-02 04:34–05:11` | `2`–`6` | Earlier iterations of Family B (`Drishti-DT`). |

> [!IMPORTANT]
> **Audit Resolution Policy:**  
> To ensure zero ambiguity, this forensic audit evaluates the **complete union of all technical and numerical claims across both Family A (`Team_Drishti_SIH26054 (1).pptx` / `Team_Drishti_SIH26054.pptx`) and Family B (`Drishti-DT_SIH26054 (1) (1).pptx`)**. Every claim is assigned a unique ledger ID (`PPT-S1-*` through `PPT-S6-*`).

---

## Phase 2: Complete Slide-by-Slide Claims & Numerical Verification Ledger

*(See also machine-readable [`docs/PPT_NUMERIC_VERIFICATION.csv`](docs/PPT_NUMERIC_VERIFICATION.csv) for all 32 quantitative claims.)*

### Slide 1 (Title Page — `Team_Drishti (1)` S1 & `Drishti-DT` S1)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S1-ID-01` | Problem Statement ID: `SIH26054`, Org: `DRDO`, Theme: `Robotics & Drones`, Category: `Software`, Team ID: `187024`, Team Name: `Wing Warriors2B` / `Team Drishti` | [`README.md`](README.md#L1-L5), [`backend/app/main.py`](backend/app/main.py#L92) | Exact match across backend metadata, UI headers, and documentation. | **VERIFIED** |

---

### Slide 2 (Problem Statement & Proposed Solution — `Team_Drishti` S5 [Page 2] & `Drishti-DT` S2)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S2-ENV-01` | Long-endurance missions (`30+ hours`, `10,000–30,000 ft` altitude) | [`mission_profiles.py`](backend/app/simulation/mission_profiles.py#L27-L53), [`engine_model.py`](backend/app/physics/engine_model.py#L16-L30) | `long_endurance` and `high_altitude` profiles implemented; RUL tracks `100.0 hr` TBO window. Physics model nominal envelope covers `[-100, 7000] m` (`-328` to `22,965 ft`); `7000–9144 m` (`22,965–30,000 ft`) is computed via ISA equations with `is_extrapolated = True`. | **PARTIALLY VERIFIED** |
| `PPT-S2-SENS-01` | 5 core sensors (`CHT, EGT, Oil Pressure, RPM, Vibration` on `Team_Drishti` S5) & all 8 required parameter groups (`RPM, CHT, EGT, Oil P & T, Fuel flow, Vibration, Batt/Alt, Inj. timing` on `Drishti-DT` S2) | [`TelemetryInputFrame`](backend/app/telemetry/schema.py#L46-L90) in `backend/app/telemetry/schema.py` | All 8 parameter groups (`rpm`, `cht_c`, `egt_c`, `oil_pressure_bar`, `oil_temp_c`, `fuel_flow_lph`, `vibration_rms_mms`, `battery_voltage_v`, `alternator_current_a`, `injection_pulse_ms`, `ignition_advance_deg`) are validated and processed in the Four-Value Twin. | **VERIFIED** |
| `PPT-S2-RATE-01` | `Sampling: 10 Hz` \| `Source: Dataset / Simulation / Live-ready` | [`FaultScenarioConfig`](backend/app/simulation/fault_simulator.py#L38-L82), [`test_ppt_alignment.py`](tests/test_ppt_alignment.py#L221-L283) | `FaultScenarioConfig` supports `sample_interval_sec = 0.1s` (`10 Hz`) with millisecond ISO timestamps (`YYYY-MM-DDTHH:MM:SS.mmmZ`) and verified `> 10 Hz` end-to-end throughput (`< 3 ms` ML inference, `~25–85 ms` with SQLite writes). Default seeded missions and 100k training corpus use `dt = 1.0s` (`1 Hz`). | **PARTIALLY VERIFIED** |
| `PPT-S2-TWIN-01` | `Four-Value Twin: Actual (Sensor) | Expected (Reference) | Calculated (Physics) | Predicted (AI Model)` — every value labeled by source | [`FourValueDigitalTwinState`](backend/app/telemetry/schema.py#L219-L234) | Every frame produces `actual`, `expected`, `calculated`, and `predicted` sub-objects with explicit `source`, `model_version`, and `units`. | **VERIFIED** |
| `PPT-S2-OUT-01` | Outputs: `Composite Health Score (0-100)`, `Remaining Useful Life (cycles)`, `Fault Class + Confidence`, `Evidence-based Alerts`, `Priority Ranking`, `Actionable Recommendations` | [`PredictedValues`](backend/app/telemetry/schema.py#L183-L216), [`ExplainableAlert`](backend/app/telemetry/schema.py#L237-L263) | `health_index` $\in [0, 100]$, `rul_cycles` & `rul_hours`, `predicted_fault_class` + `top_probability`, and `ExplainableAlert` with `severity` (`ADVISORY`, `CAUTION`, `WARNING`, `CRITICAL`), `supporting_evidence`, and `recommended_action`. | **VERIFIED** |

---

### Slide 3 (Technical Approach, Dataset, Models & Metrics — `Team_Drishti` S4 [Page 3] & `Drishti-DT` S3)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S3-DATA-01` | `100k rows | 50 engine units | Multi-mission synthetic data` (`~103k synthetic rows` in `Drishti-DT` S3) | [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py), [`drishti_100k_dataset.npz`](data/processed/drishti_100k_dataset.npz), [`mission_profiles.py`](backend/app/simulation/mission_profiles.py) | `drishti_100k_dataset.npz` has **100,000 rows** across **50 distinct engine units** (`ENG-UNIT-001`..`050`) and 5 mission profiles (`250` trajectories); combined with the `3,270` rows in the 54-trajectory Live-Twin suite, total synthetic rows = **103,270 (`~103k`)**. | **VERIFIED** |
| `PPT-S3-DATA-02` | `Calibrated on published thermodynamic models; RUL methodology validated on NASA C-MAPSS` | [`engine_model.py`](backend/app/physics/engine_model.py), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L328-L353) | Physics model implements analytical aero-piston equations (`Rotax914-Simplified-Ref-v1.0`) and Saxena et al. (PHM 2008) damage propagation $D(t)$, plus real-data benchmarks on `LiU-ICE` and `Marine` datasets. However, raw NASA C-MAPSS turbofan files (`FD001..FD004`) are **not** in the repo and coefficients are engineering assumptions, not test-cell calibrated. | **PARTIALLY VERIFIED** |
| `PPT-S3-FEAT-01` | `Rolling mean/std, Slope, deviation from expected, Thermal & vibration features` | [`features.py`](backend/app/ml/features.py#L10-L78), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L63-L101) | 17 features (`FEATURE_NAMES`): 7 physics residuals ($\text{Actual}-\text{Expected}$), 3 causal 12-sample linear slopes, 2 causal rolling stds, 3 cross-channel ratios, and 2 signal-quality features. | **VERIFIED** |
| `PPT-S3-SPLIT-01` | `70% Train | 15% Validation | 15% Test | Stratified by fault class | No engine appears in both train and test (zero leakage)` | [`drishti_100k_manifest.json`](data/processed/drishti_100k_manifest.json#L17-L128) | **Train:** `35` engines (`70,000` rows, `70.0%`); **Validation:** `8` engines (`15,000` rows, `15.0%`); **Test:** `7` engines (`15,000` rows, `15.0%`). All 9 classes present in all 3 splits; **0 shared engines** (`train ∩ val = ∅`, `train ∩ test = ∅`, `val ∩ test = ∅`). | **VERIFIED** |
| `PPT-S3-METRIC-01` | **Fault Classification (9 classes):** `Random Forest` \| `Macro-F1: 0.92` | [`ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json#L494), [`evaluation_report.json`](backend/artifacts/evaluation_report.json#L41) | Model is `RandomForestClassifier`. Measured Held-Out Test Macro-F1 is **`0.9853`** (`Val: 0.9871`) on the 100k corpus and **`0.8950`** on the 54-trajectory Live-Twin suite (real-data Phase 4 Macro-F1 is `0.5877` on `LiU-ICE` and `0.5564` on `Marine`). | **MISMATCH (Measured `0.9853` / `0.8950` vs. PPT `0.92`)** |
| `PPT-S3-METRIC-02` | **Anomaly Detection:** `Isolation Forest` \| `Recall: 0.94 / FAR: 0.03` | [`ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json#L757-L770) | Model is `IsolationForest` fit strictly on Normal training rows, calibrated at the 97th percentile of Validation Normal scores. Measured Validation is **`Recall = 0.9262, FAR = 0.0301`**; Held-Out Test is **`Recall = 0.9180, FAR = 0.0255`** (54-traj Test: `Recall = 0.8781, FAR = 0.0507`). | **PARTIALLY VERIFIED (`FAR = 0.0301 Val / 0.0255 Test` matches `0.03`; Recall is `0.9180` vs. `0.94`)** |
| `PPT-S3-METRIC-03` | **RUL Prediction:** `XGBoost Regressor` \| `MAE: 18.6 cycles / RMSE: 27.4` | [`ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json#L780-L787) | Model is `xgboost.XGBRegressor` (`v3.2.0`). Measured Held-Out Test is **`MAE = 8.785 cycles, RMSE = 11.758 cycles`** (`7.616 hrs` MAE / `10.197 hrs` RMSE; Validation: `MAE = 8.440 cycles, RMSE = 11.244 cycles`). | **MISMATCH (Measured `8.785 / 11.758 cycles` beats PPT `18.6 / 27.4 cycles`)** |
| `PPT-S3-METRIC-04` | **Sensor Fault Detection:** `Isolation Forest` \| `F1: 0.91` | [`ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json#L771-L779), [`evaluation_report.json`](backend/artifacts/evaluation_report.json#L172-L180) | Implemented via dedicated [`SensorFaultIsolator`](backend/app/ml/sensor_fault_isolator.py) + RF `Sensor Fault` class (matching PPT text box 5). Measured Held-Out Test F1 is **`1.0000`** on the 100k corpus and **`0.9600`** (`Precision = 1.0000, Recall = 0.9231`) on the 54-trajectory suite. | **MISMATCH (Measured `1.0000` / `0.9600` vs. PPT `0.91`; Isolator+RF vs. IF label)** |
| `PPT-S3-METRIC-05` | **Health Score:** `Hybrid (Rules + ML)` \| `α = 0.3, β = 0.3, γ = 0.2, δ = 0.2` | [`HEALTH_INDEX_WEIGHTS`](backend/app/ml/pipeline.py#L45-L50) in `backend/app/ml/pipeline.py` | Exact match: `thermal_penalty_weight = 0.30` ($\alpha$), `oil_penalty_weight = 0.30` ($\beta$), `vibration_penalty_weight = 0.20` ($\gamma$), `anomaly_penalty_weight = 0.20` ($\delta$). | **VERIFIED** |
| `PPT-S3-CM-01` | **9×9 Normalized Confusion Matrix** (`Normal`..`Fuel Injector Clogging`, diagonal `0.94, 0.91, 0.90, 0.90, 0.91, 0.93, 0.91, 0.92, 0.93`) | [`ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json#L655-L755) | Exact 9×9 class order and row-normalized confusion matrix generated; measured 100k held-out test diagonal is `[0.9588, 0.9869, 0.9853, 0.9955, 0.9725, 1.0000, 0.9825, 0.9905, 0.9914]`. | **MISMATCH (Structure & class order verified; cell values differ)** |
| `PPT-S3-STACK-01` | Tech Stack: `Python, Pandas/NumPy, scikit-learn, XGBoost, FastAPI, React, SQLite, WebSocket` vs. secondary PPT labels (`MQTT`, `Express`, `PyTorch`, `PostgreSQL`, `Docker`, `Socket.IO`, `Tailwind`) | [`requirements.txt`](requirements.txt), [`frontend/package.json`](frontend/package.json) | Core stack (`Python 3.11.9, FastAPI, scikit-learn, XGBoost, NumPy/Pandas, SQLite, React 18, Vite, Three.js, Recharts, WebSocket`) is verified. Secondary labels (`MQTT, Express, PyTorch, PostgreSQL, Docker, Socket.IO, Tailwind`) are **not** used. | **PARTIALLY VERIFIED** |

---

### Slide 4 (Feasibility, Risk & Roadmap — `Team_Drishti` S3 [Page 4] & `Drishti-DT` S4)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S4-FEAS-01` | `Multi-UAV independent identity (4 UAVs with isolated data)` | [`service.py`](backend/app/service.py#L62-L163) | Live SQLite fleet seeds **6 independent UAVs** (`ENG-MALE-01`..`06`) with isolated telemetry and alerts; 100k corpus models **50 independent engine units**. | **VERIFIED (Exceeds 4-UAV claim with 6 live UAVs)** |
| `PPT-S4-SIM-01` | Simulation & Replay of `High Altitude (10k-30k ft)`, `Hot Weather (45°C+)`, `Endurance (30+ hrs)`, `Rapid Throttle Transitions` + historical mission replay | [`mission_profiles.py`](backend/app/simulation/mission_profiles.py), [`replay_controller.py`](backend/app/simulation/replay_controller.py) | All 4 operational profiles (`high_altitude`, `hot_weather`, `long_endurance`, `rapid_throttle`) plus `normal_mission` and full `HistoricalReplayController` (`start/stop/seek/step`) are implemented and tested. | **VERIFIED** |

---

### Slide 5 (Impact & Benefits — `Team_Drishti` S2 [Page 5] & `Drishti-DT` S5)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S5-IMP-01` | `Unplanned groundings: 40% reduction`, `Maintenance cost: 25% lower`, `Engine life: +15%` | Slide 5 disclosure: *"Projected targets from simulation, not field-proven results"* | Projected operational impact targets; cannot be empirically verified without multi-year UAV fleet MRO records. | **NOT VERIFIABLE** |
| `PPT-S5-IMP-02` | `Fault detection lead time: 18.6 cycles / 18.6 flight hours (18.6 cycles)` | [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L328-L353) | Slide 2 reused the `18.6 cycles` RUL MAE figure as "Fault detection lead time" and equated `1 cycle = 1 flight hour`. In the codebase, `cycles = hours × kappa` ($\kappa \in [0.75, 1.45]$), and measured XGBoost RUL MAE is `8.785 cycles` (`7.616 hours`). | **MISMATCH** |

---

### Slide 6 (Research & References — `Team_Drishti` S1 [Page 6] & `Drishti-DT` S6)
| Claim ID | Exact PPT Claim | Source Code / Artifact Evidence | Actual Verified Result | Status |
|---|---|---|---|---|
| `PPT-S6-REF-01` | Literature references (Saxena et al. PHM 2008, Heywood, FAA Handbook, Taylor, PHM Society, SAE J1939/CAN) & real-data benchmarks | [`DATASET_PROVENANCE_REGISTER.md`](docs/DATASET_PROVENANCE_REGISTER.md), [`phase4_reliability_report.json`](backend/artifacts/phase4_reliability_report.json) | Analytical models follow Heywood/FAA/Saxena principles, and two real experimental IC engine datasets (`LiU-ICE` and `Marine 2-Stroke Diesel`) are verified in `data/raw/`. QR links (`github.com/drishti-uav-digital-twin`, `youtu.be/Drishti-UAV-Demo`, `drishti-uav-dashboard.vercel.app`) are slide template placeholders. | **PARTIALLY VERIFIED** |

---

## Phase 3: Independent Dataset Audit (`data/processed/drishti_100k_dataset.npz`)

Direct inspection of `data/processed/drishti_100k_dataset.npz` (without relying on JSON manifests) confirmed:
1. **Array Shapes & Row/Column Counts:**
   - `X`: `(100000, 17)` (`float32` stored, `float64` evaluated) — **100,000 rows × 17 features**.
   - `y_class`: `(100000,)` — 9 unique class labels matching `NINE_FAULT_CLASSES`.
   - `y_rul_cycles` & `y_rul_hours`: `(100000,)` — `Sensor Fault` rows are strictly `-1.0`; mechanical rows span `[1.0, 118.45] cycles` (`[1.0, 99.13] hours`).
2. **Engine, Mission & Split Integrity:**
   - **Unique Engine IDs:** `50` (`ENG-UNIT-001` .. `ENG-UNIT-050`).
   - **Unique Mission IDs:** `250` (`5` missions per engine × `400` samples/mission).
   - **Train Split (`splits == 'train'`):** `70,000` rows (`70.0%`), `35` engines (`ENG-UNIT-001`..`035`), `175` missions.
   - **Validation Split (`splits == 'val'`):** `15,000` rows (`15.0%`), `8` engines (`ENG-UNIT-036`..`043`), `40` missions.
   - **Test Split (`splits == 'test'`):** `15,000` rows (`15.0%`), `7` engines (`ENG-UNIT-044`..`050`), `35` missions.
   - **Cross-Split Overlap:** `0` shared engines and `0` shared missions across `train ∩ val`, `train ∩ test`, and `val ∩ test`.
3. **Data Hygiene & Causal Feature Verification:**
   - `NaN` count: `0`; `Inf` count: `0`.
   - Causal rolling window verification (`test_causal_features_and_deterministic_seed_reproducibility`): injecting a `+500°C` future spike at `t > 30` has `0.0` effect (`atol = 1e-12`) on rolling mean, std, and slope features at `t <= 30`.
   - **Synthetic Signature Disclosure:** Because synthetic fault trajectories apply step-plus-ramp offsets at fault onset with bounded Gaussian noise, class separability on the synthetic 100k corpus (`Macro-F1 = 0.9853`) is higher than on real experimental engine benchmarks (`LiU-ICE Macro-F1 = 0.5877`, `Marine Macro-F1 = 0.5564`).

---

## Phase 4: Independent Model Evaluation (`ppt_100k_ml_bundle.joblib` & `drishti_ml_bundle.joblib`)

Independent reloading of the saved model artifacts (`backend/artifacts/ppt_100k_ml_bundle.joblib` and `backend/artifacts/drishti_ml_bundle.joblib`) reproduced the reported evaluation metrics to 4 decimal places:
- **Scaler Fit Verification:** `scaler_100k.n_samples_seen_ == 70000` (fit strictly on the `70,000` training rows; held-out validation and test rows were never seen during scaler fitting).
- **100k Held-Out Test (`15,000` rows, `7` engines):**
  - `RandomForestClassifier`: Overall Accuracy = **`0.9827`**, Macro-F1 = **`0.9853`**.
  - `IsolationForest`: Validation-calibrated threshold = **`-0.0038`** (`Val FAR = 0.0301`); Held-Out Test Recall = **`0.9180`**, Held-Out Test FAR = **`0.0255`**, Precision = **`0.9937`**, F1 = **`0.9544`**.
  - `SensorFaultIsolator + RF`: Held-Out Test Precision = **`1.0000`**, Recall = **`1.0000`**, F1 = **`1.0000`** (`1,551 / 1,551` true positives, `0` false positives).
  - `xgboost.XGBRegressor` (`v3.2.0`, `13,449` non-Sensor-Fault test rows): Held-Out Test MAE = **`8.785 cycles`** (`7.616 hours`), RMSE = **`11.758 cycles`** (`10.197 hours`).
- **54-Trajectory Live-Twin Suite (`1,095` test rows, `18` held-out trajectories):**
  - `RandomForestClassifier`: Overall Accuracy = **`0.8977`**, Macro-F1 = **`0.8950`**.
  - `IsolationForest`: Recall = **`0.8781`**, FAR = **`0.0507`**, Precision = **`0.9869`**.
  - `SensorFaultIsolator`: Precision = **`1.0000`**, Recall = **`0.9231`**, F1 = **`0.9600`**.
  - `XGBRegressor + RandomForestRegressor`: XGBoost Held-Out MAE = **`2.800 hours`** (`RMSE = 3.859 hours`), RF Held-Out MAE = **`2.805 hours`** (`RMSE = 4.193 hours`).
