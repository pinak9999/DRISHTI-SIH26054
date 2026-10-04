# DRISHTI (SIH26054) — Dashboard Data Source & API Traceability Audit

- **Audit Date:** 2026-10-03 / 2026-10-04
- **Frontend Root:** [`frontend/src/`](frontend/src/)
- **API Client:** [`frontend/src/api/client.ts`](frontend/src/api/client.ts)
- **Backend Router:** [`backend/app/main.py`](backend/app/main.py)

---

## 1. Executive Summary of Frontend Data Provenance

Every screen in the React + TypeScript workstation (`Screen 1` through `Screen 10`) was audited to determine whether displayed values originate from live FastAPI endpoints, SQLite-persisted Digital Twin states, or static UI constants:

- **Zero hardcoded/mocked telemetry or model accuracy scores in UI screens:** All KPI cards, Four-Value telemetry charts, 3D engine gauges, alert feeds, RUL trajectories, and confusion matrices fetch live JSON payloads via [`drishtiApi`](frontend/src/api/client.ts) or `WS /ws/telemetry`.
- **Defect Identified & Fixed During Phase 6/7 Audit (`AUDIT-FIX-01`):**
  - **Before Fix:** In [`ModelEvaluationScreen`](frontend/src/screens/RulEvalAndReportsScreens.tsx#L301-L418), the top KPI row displayed `classification_metrics.macro_f1` (`89.50%`, evaluated on `1,095` test frames from the 54-trajectory Live-Twin suite) right next to a 4th card labeled `100k Split: 70% Train (35) | 15% Val (8) | 15% Test (7)`. Additionally, `GET /api/engines/{engine_id}/health` omitted `rul_cycles` from `degradation_trajectory`, and `backend/artifacts/drishti_twin.db` had been seeded prior to adding `rul_cycles`.
  - **After Fix:**
    1. Separated [`ModelEvaluationScreen`](frontend/src/screens/RulEvalAndReportsScreens.tsx#L326-L418) into two explicitly labeled KPI rows: Row 1 shows the **Live-Twin 54-Trajectory Suite (`36` train / `18` test trajectories, `1,095` test frames)**, and Row 2 shows the **100k-Row / 50-Engine PPT Benchmark (`35` train / `8` val / `7` test engines, `15,000` held-out test rows)** directly from `report.ppt_100k_evaluation`.
    2. Added `rul_cycles`, `rul_lower_10_cycles`, and `rul_upper_90_cycles` to `degradation_trajectory` in [`GET /api/engines/{engine_id}/health`](backend/app/main.py#L162-L179).
    3. Re-seeded [`backend/artifacts/drishti_twin.db`](backend/artifacts/drishti_twin.db) so all 6 fleet engines (`ENG-MALE-01`..`ENG-MALE-06`) persist both `rul_cycles` and `rul_hours` alongside the $\alpha=0.30, \beta=0.30, \gamma=0.20, \delta=0.20$ Health Index weights.

---

## 2. Screen-by-Screen Metric-to-Source Mapping

### Top Status Bar & Guided Walkthrough ([`frontend/src/App.tsx`](frontend/src/App.tsx))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| `API: ONLINE` & Latency (`ms`) | `healthStatus.status`, `healthStatus.last_inference_latency_ms` | `GET /health` | `health_check()` in [`main.py`](backend/app/main.py#L87-L102) | `status: "ok"`, `ml_models_loaded: true` |
| `CAN Adapter: SIMULATED` | `healthStatus.can_interface.mode` | `GET /health` | `SimulatedRotaxCANAdapter.get_status()` in [`can_adapter.py`](backend/app/telemetry/can_adapter.py) | Explicitly reports `hardware_connected: false`, `mode: "SIMULATED_ROTAX_CAN_2_0B"` |
| Active Engine Selector | `activeEngineId` (`ENG-MALE-01`..`06`) | `GET /api/fleet` | `DrishtiTwinService.get_fleet_overview()` in [`service.py`](backend/app/service.py#L216-L254) | Populated from SQLite `engines` table |

---

### Screen 1: Fleet Command Center ([`FleetCommandScreen`](frontend/src/screens/FleetAndTwinScreens.tsx#L30-L240))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| Fleet Size & Status Counts (`Nominal`, `Caution`, `Warning`, `Critical`) | `fleet.fleet_size`, `nominal_count`, `caution_count`, `warning_count`, `critical_count` | `GET /api/fleet` | `DrishtiTwinService.get_fleet_overview()` in [`service.py`](backend/app/service.py#L216-L254) | `fleet_size: 6` (`ENG-MALE-01`..`06`) |
| Mean Fleet Health Index | `fleet.mean_fleet_health_index` | `GET /api/fleet` | Mean of `latest_health_index` across SQLite `engines` rows | Dynamically computed (`61.0 / 100` on seeded fleet) |
| Per-Engine Cards (`Health Index`, `Fault Class`, `RUL Hours`, `Data Source`) | `eng.latest_health_index`, `eng.latest_fault_class`, `eng.latest_rul_hours`, `eng.data_source` | `GET /api/fleet` | SQLite `engines` table updated on every ingested/simulated frame | Live SQLite state; `ENG-MALE-05` (`Sensor Fault`) shows `NOT_ESTIMABLE` |

---

### Screen 2: Four-Value Engine Digital Twin ([`EngineDigitalTwinScreen`](frontend/src/screens/FleetAndTwinScreens.tsx#L245-L590))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| `1. ACTUAL (Sensor Telemetry)` | `latest.actual` (`cht_c`, `egt_c`, `oil_pressure_bar`, `vibration_rms_mms`, `rpm`, `quality.quality_score`) | `GET /api/engines/{id}/telemetry` + `WS /ws/telemetry` | [` TelemetryValidator.validate_frame`](backend/app/telemetry/validator.py) | Validated telemetry with per-channel validity flags |
| `2. EXPECTED (Physics Reference)` | `latest.expected` (`cht_c`, `egt_c`, `oil_pressure_bar`, `vibration_rms_mms`, `air_density_ratio`) | `GET /api/engines/{id}/telemetry` + `WS /ws/telemetry` | [`AeroPistonReferenceModel.estimate_expected`](backend/app/physics/engine_model.py#L65-L138) | Physics baseline (`Rotax914-Simplified-Ref-v1.0`) |
| `3. CALCULATED (Physics Residuals & Slopes)` | `latest.calculated` (`cht_residual_c`, `egt_residual_c`, `oil_pressure_residual_bar`, `vibration_residual_mms`, `thermal_margin_pct`) | `GET /api/engines/{id}/telemetry` + `WS /ws/telemetry` | [`AeroPistonReferenceModel.calculate_residuals_and_trends`](backend/app/physics/engine_model.py#L140-L236) | Exact $\text{Actual} - \text{Expected}$ residuals + causal 12-sample slopes |
| `4. PREDICTED (AI Diagnostic & RUL)` | `latest.predicted` (`predicted_fault_class`, `top_probability`, `health_index`, `rul_hours`, `rul_cycles`, `anomaly_score`) | `GET /api/engines/{id}/telemetry` + `WS /ws/telemetry` | [`DrishtiMLPipeline.predict_point`](backend/app/ml/pipeline.py#L406-L565) | Live inference from `drishti_ml_bundle.joblib` (`RandomForest` + `IsolationForest` + `XGBRegressor`) |

---

### Screen 3: Interactive 3D Engine Digital Twin ([`Interactive3DEngineTwinScreen`](frontend/src/screens/Interactive3DEngineScreen.tsx))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| 3D Crankshaft RPM, Thermal Glow, Vibration Jitter & 10 Subsystems | `latestState.actual`, `latestState.calculated`, `latestState.predicted` | `GET /api/engines/{id}/telemetry` + `WS /ws/telemetry` | Synchronized to `FourValueDigitalTwinState` | Includes explicit banner disclosing lumped-engine telemetry mapping and 2D schematic fallback |

---

### Screen 4: Fault & Sensor-Fault Investigation ([`FaultInvestigationScreen`](frontend/src/screens/FleetAndTwinScreens.tsx#L595-L840))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| 9-Class Probability Distribution Bar Chart | `latest.predicted.class_probabilities` | `GET /api/engines/{id}/telemetry` | `RandomForestClassifier.predict_proba` in [`pipeline.py`](backend/app/ml/pipeline.py#L444-L450) | Probabilities across all 9 classes sum to `1.0` |
| Sensor-Fault vs Engine-Fault Isolation Card | `latest.predicted.sensor_diagnosis` (`diagnosis_status`, `suspected_channels`, `fault_submode`, `evidence`) | `GET /api/engines/{id}/telemetry` | [`SensorFaultIsolator.diagnose`](backend/app/ml/sensor_fault_isolator.py#L25-L178) | Distinguishes single-channel sensor faults from multi-channel mechanical faults |
| Explainable Alert Cards & Acknowledge Action | `alerts` (`supporting_evidence`, `actual_vs_expected_deviations`, `model_probability`, `recommended_action`) | `GET /api/engines/{id}/alerts`, `POST /api/alerts/{id}/acknowledge` | [`ExplainableAlertEngine.evaluate`](backend/app/alerts/alert_engine.py) | Every alert carries model version, rule version, confidence, and `SIMULATED` provenance badge |

---

### Screen 5 & Screen 6: Mission Simulator & Historical Replay ([`SimReplayAndDataScreens.tsx`](frontend/src/screens/SimReplayAndDataScreens.tsx))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| Deterministic Fault Simulator Form & Execution | `FaultScenarioConfig` (`fault_class`, `mission_profile`, `onset_time_sec`, `sample_interval_sec`, `severity`, `random_seed`) | `POST /api/simulations`, `GET /api/catalog` | [`DeterministicFaultSimulator.generate_scenario`](backend/app/simulation/fault_simulator.py#L75-L240) | Supports `sample_interval_sec >= 0.05s` (including **10 Hz `0.1s`**) and persists all frames + report |
| Historical Mission Replay Timeline & Alert Sync | `replayStatus` (`current_index`, `total_frames`, `current_elapsed_sec`, `synchronized_history`, `synchronized_alerts`) | `POST /api/replay/start`, `/seek`, `/step`, `/stop`, `GET /api/replay/status` | [`HistoricalReplayController`](backend/app/simulation/replay_controller.py) | Filters alerts causally up to `current_index` (`sequence_number <= current.sequence_number`) |

---

### Screen 7 & Screen 8: Predictive Maintenance / RUL & Model Evaluation ([`RulEvalAndReportsScreens.tsx`](frontend/src/screens/RulEvalAndReportsScreens.tsx))
| UI Element / Metric | Frontend Variable | API Endpoint Called | Backend Function & Source | Verified Value / Behavior |
|---|---|---|---|---|
| Composite Health Indicator & Subsystem Breakdown | `pred.health_index`, `pred.health_breakdown` | `GET /api/engines/{id}/health` | [`DrishtiMLPipeline.compute_health_indicator`](backend/app/ml/pipeline.py#L368-L404) | Uses exact PPT weights $\alpha=0.30, \beta=0.30, \gamma=0.20, \delta=0.20$ |
| RUL Estimate in `cycles` & `hours` + 10th–90th Bounds | `pred.rul_cycles`, `pred.rul_hours`, `pred.rul_lower_10_hours`, `pred.rul_upper_90_hours` | `GET /api/engines/{id}/health` | `XGBRegressor` + `RandomForestRegressor` in [`pipeline.py`](backend/app/ml/pipeline.py#L510-L558) | Displays `XX.X cycles (YY.Y hrs)` or `NOT ESTIMABLE` on `Sensor Fault` |
| Live-Twin 54-Trajectory Evaluation Row & 9×9 Confusion Matrix | `report.classification_metrics`, `anomaly_detection_metrics`, `rul_estimation_metrics` | `GET /api/model-status` | [`backend/artifacts/evaluation_report.json`](backend/artifacts/evaluation_report.json) | `Macro-F1: 89.50%`, `XGBoost RUL MAE: 2.80 hrs` (`1,095` held-out test frames) |
| 100k-Row / 50-Engine PPT Benchmark Row | `report.ppt_100k_evaluation.held_out_test_metrics` | `GET /api/model-status` | [`backend/artifacts/ppt_100k_evaluation_report.json`](backend/artifacts/ppt_100k_evaluation_report.json) | `Macro-F1: 98.53%`, `IsolationForest Recall: 91.80% / FAR: 2.55%`, `XGBoost RUL MAE: 8.785 cycles / RMSE: 11.758 cycles` (`15,000` held-out test rows across `7` test engines) |
