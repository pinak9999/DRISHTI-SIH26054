# DRISHTI (SIH26054) — Master PPT Alignment Implementation Changelog

- **Date:** 2026-10-03
- **Team ID / Name:** `187024` / `Wing Warriors2B`
- **Reference Presentation:** `Team_Drishti_SIH26054.pptx`

---

## 1. Summary of Engineering Changes

### 1.1 100,000-Row / 50-Engine Physics-Informed Dataset & 70% / 15% / 15% Engine-Level Split
- **Added:** `backend/app/ml/ppt_100k_pipeline.py`
- **Generated Artifacts:**
  - `data/processed/drishti_100k_dataset.npz` (`100,000 × 17` feature matrix, class labels, RUL in `cycles` and `hours`, split tags, engine IDs, mission IDs)
  - `data/processed/drishti_100k_manifest.json`
  - `data/processed/drishti_100k_quality_report.json`
  - `backend/artifacts/ppt_100k_evaluation_report.json`
- **Details:**
  - Generates `100,000` telemetry rows across `50` distinct engine IDs (`ENG-UNIT-001` .. `ENG-UNIT-050`), `250` trajectories (`5` missions per engine × `400` samples/mission) spanning `5` operating profiles (`normal_mission`, `high_altitude`, `hot_weather`, `long_endurance`, `rapid_throttle`) and all `9` fault classes.
  - Enforces strict engine-level separation (`0` shared engines across splits):
    - **Train:** `35` engines (`ENG-UNIT-001` .. `ENG-UNIT-035`) → `70,000` rows (`70.0%`)
    - **Validation:** `8` engines (`ENG-UNIT-036` .. `ENG-UNIT-043`) → `15,000` rows (`15.0%`)
    - **Test:** `7` engines (`ENG-UNIT-044` .. `ENG-UNIT-050`) → `15,000` rows (`15.0%`)
  - Vectorized `_causal_rolling_mean_std_slope` using `numpy.lib.stride_tricks.sliding_window_view` to compute strictly causal rolling means, standard deviations, and linear slopes without future leakage.

### 1.2 XGBoost RUL Regression (`cycles` and `hours`) & Model Bundle Upgrade
- **Modified:** `requirements.txt`, `backend/app/ml/pipeline.py`, `backend/app/telemetry/schema.py`
- **Updated Artifacts:** `backend/artifacts/drishti_ml_bundle.joblib`, `backend/artifacts/evaluation_report.json`
- **Details:**
  - Installed and pinned `xgboost==3.2.0` in `requirements.txt`.
  - Trained `xgboost.XGBRegressor` (`n_estimators=140, max_depth=6, learning_rate=0.06, subsample=0.85, colsample_bytree=0.85, random_state=42`) in `ppt_100k_pipeline.py` (for both `cycles` and `hours`) and integrated `xgb.XGBRegressor` into `DrishtiMLPipeline` (`backend/app/ml/pipeline.py`).
  - Added `rul_cycles`, `rul_lower_10_cycles`, `rul_upper_90_cycles`, and `rul_cycle_unit: str = "cycles"` to `PredictedValues` in `backend/app/telemetry/schema.py` while preserving `rul_hours` and `rul_unit: str = "hours"` for full backward compatibility.
  - Enforced `Sensor Fault` exclusion (`gt_rul = -1.0` during training/evaluation; `rul_status = "NOT_ESTIMABLE"` with `rul_hours = None, rul_cycles = None` during inference).

### 1.3 Hybrid Health Index Weight Alignment (`α = 0.30, β = 0.30, γ = 0.20, δ = 0.20`)
- **Modified:** `backend/app/ml/pipeline.py`, `backend/app/ml/ppt_100k_pipeline.py`
- **Details:**
  - Updated `HEALTH_INDEX_WEIGHTS` in `backend/app/ml/pipeline.py` from `0.30 / 0.30 / 0.25 / 0.15` to the exact PPT Slide 4 weights:
    - $\alpha$ (`thermal_penalty_weight`): `0.30`
    - $\beta$ (`oil_penalty_weight`): `0.30`
    - $\gamma$ (`vibration_penalty_weight`): `0.20`
    - $\delta$ (`anomaly_penalty_weight`): `0.20`
  - Updated the formula disclosure in `evaluation_report.json` to `HI = clip(100 - (0.30*P_thermal + 0.30*P_oil + 0.20*P_vib + 0.20*P_anom), 0, 100)`.

### 1.4 10 Hz (`0.1s`) Telemetry Simulation, Ingestion, Replay & Millisecond Timestamps
- **Modified:** `backend/app/simulation/fault_simulator.py`
- **Details:**
  - Lowered `FaultScenarioConfig.sample_interval_sec` validation bound from `ge=0.2` (5 Hz max) to `ge=0.05` (20 Hz max, supporting **10 Hz `sample_interval_sec = 0.1s`**) and `duration_sec` to `ge=1.0`.
  - Fixed sub-second ISO-8601 timestamp formatting in `DeterministicFaultSimulator.generate_scenario` so `sample_interval_sec < 1.0` emits millisecond precision (`YYYY-MM-DDTHH:MM:SS.mmmZ`), preventing false duplicate-timestamp flags in `TelemetryValidator`.

### 1.5 React Frontend Alignment & Production Build
- **Modified:** `frontend/src/types/telemetry.ts`, `frontend/src/screens/RulEvalAndReportsScreens.tsx`
- **Details:**
  - Added `rul_cycles`, `rul_lower_10_cycles`, `rul_upper_90_cycles`, and `rul_cycle_unit` to `PredictedValues` TypeScript interface.
  - Updated Screen 7 (`PredictiveMaintenanceRulScreen`) to display RUL in both `cycles` and `hours` (`XX.X cycles (YY.Y hrs)`) and show the PPT Health Index weights ($\alpha=0.30, \beta=0.30, \gamma=0.20, \delta=0.20$).
  - Updated Screen 8 (`ModelEvaluationScreen`) to display `XGBoost + RF` RUL metrics and the 100k-row / 50-engine split (`70% Train (35) | 15% Val (8) | 15% Test (7)`).
  - Rebuilt production frontend bundle (`npm run build` in `frontend/`).

### 1.6 Automated Verification Suite
- **Added:** `tests/test_ppt_alignment.py`
- **Details:**
  - Added 5 comprehensive end-to-end tests covering the 100k dataset manifest, 50-engine 70/15/15 split, zero engine leakage, causal rolling features, seed reproducibility, `XGBRegressor` RUL in cycles & hours, Health Index weights (`0.30, 0.30, 0.20, 0.20`), and 10 Hz simulation/ingestion/replay/latency.
