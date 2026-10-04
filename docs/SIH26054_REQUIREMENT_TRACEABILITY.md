# DRISHTI (SIH26054) — Problem Statement Requirement Traceability Matrix

- **Problem Statement ID:** SIH26054 (`DRDO` | Theme: `Robotics & Drones`)
- **Problem Statement Title:** *AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs*
- **Audit Scope:** Phase 5 Traceability across Sections A–G (`Digital Twin Core`, `Required Health Parameters`, `Required Fault Types`, `AI/ML`, `Simulation & Mission Replay`, `Dashboard`, `Architecture & Deployment`).

---

## Section A: Digital Twin Core

| Req ID | SIH26054 Requirement | Implementation Status | Source Code & Runtime Evidence | Forensic Distinction (Simulated vs. Hardware) |
|---|---|---|---|---|
| **DT-A1** | **Virtual Engine Representation** | **VERIFIED (Implemented)** | [`FourValueDigitalTwinState`](backend/app/telemetry/schema.py#L219-L234) in `backend/app/telemetry/schema.py`; 3D procedural horizontally-opposed 4-cylinder turbocharged engine assembly in [`Engine3DViewer.tsx`](frontend/src/components/Engine3DViewer.tsx) with 10 selectable subsystems and 2D schematic fallback. | Lumped-engine virtual representation; 3D per-cylinder visual heat/vibration cues are derived from lumped engine telemetry (explicitly disclosed in UI). |
| **DT-A2** | **Synchronization with Incoming Telemetry** | **VERIFIED (Implemented)** | [`DrishtiTwinService.process_telemetry_frame`](backend/app/service.py#L165-L214), `POST /api/predict`, `POST /api/telemetry/ingest-csv`, and WebSocket stream `WS /ws/telemetry` ([`backend/app/main.py`](backend/app/main.py#L331-L380)). | Synchronizes with simulated streams, CSV uploads, and replay; no physical aircraft ECU/FADEC or live SocketCAN bus is attached (`hardware_connected: false`). |
| **DT-A3** | **Modular Architecture** | **VERIFIED (Implemented)** | Decoupled Python packages under `backend/app/`: `telemetry/` (schema, validator, CAN codec), `physics/` (reference model), `ml/` (features, isolator, RF/IF/XGBoost pipeline), `alerts/` (explainable rule+ML engine), `simulation/` (fault simulator, mission profiles, replay), `storage/` (SQLite persistence). | Single-process modular FastAPI backend + React SPA frontend (not microservices or Docker-compose deployed). |
| **DT-A4** | **Physics-Informed Engine Model** | **VERIFIED (Implemented)** | [`AeroPistonReferenceModel`](backend/app/physics/engine_model.py#L33-L238) (`Rotax914-Simplified-Ref-v1.0`) computing ISA air density ratio $\sigma_{\text{alt}}$, cooling effectiveness $\eta_{\text{cool}}$, expected `CHT`, `EGT`, `oil_temp`, `oil_pressure`, `fuel_flow`, `vibration_rms`, `battery_voltage`, `injection_pulse`, residuals ($\text{Actual} - \text{Expected}$), and causal rolling slopes/stds. | Analytical lumped-parameter reference equations inspired by Rotax 914 class aero-piston engines; polynomial coefficients are engineering assumptions, not test-cell calibrated. |

---

## Section B: Required Health Parameters (All 8 SIH26054 Parameter Groups)

| Req ID | Required Health Parameter | Schema Field(s) & Units | Physics Expected & Residual Computation | UI & 3D Visualization | Status |
|---|---|---|---|---|---|
| **HP-B1** | **RPM (Engine Speed)** | `rpm` (`RPM`, range `[0, 7500]`, nominal `[1400, 6000]`) | Primary operating-point input ($u_{\text{rpm}} = \text{rpm}/5500$) driving expected thermal, oil, fuel, and vibration baselines ([`engine_model.py`](backend/app/physics/engine_model.py#L72)) | KPI cards, 3D crankshaft/propeller rotation speed in [`Engine3DViewer.tsx`](frontend/src/components/Engine3DViewer.tsx) | **VERIFIED** |
| **HP-B2** | **Cylinder Head Temperature (CHT)** | `cht_c` (`degC`, range `[-40, 350]`, nominal `[50, 240]`) | `expected.cht_c`, `calculated.cht_residual_c`, `cht_rolling_mean_c`, `cht_rolling_std_c`, `cht_rolling_slope_c_per_s`, `thermal_margin_pct` | Dual-trace Actual vs Expected CHT chart (`Screen 2`), 3D cylinder head thermal shader | **VERIFIED** |
| **HP-B3** | **Exhaust Gas Temperature (EGT)** | `egt_c` (`degC`, range `[-40, 1300]`, nominal `[250, 980]`) | `expected.egt_c`, `calculated.egt_residual_c`, `egt_rolling_mean_c`, `thermal_to_egt_ratio` | Dual-trace Actual vs Expected EGT chart (`Screen 2`), 3D exhaust/turbo glow | **VERIFIED** |
| **HP-B4** | **Oil Pressure & Oil Temperature** | `oil_pressure_bar` (`bar`, `[0, 12]`), `oil_temp_c` (`degC`, `[-40, 220]`) | `expected.oil_pressure_bar`, `expected.oil_temp_c`, `oil_pressure_residual_bar`, `oil_temp_residual_c`, `oil_pressure_rolling_slope_bar_per_s`, `oil_pressure_margin_pct` | Dual-trace Oil Pressure chart (`Screen 2`), Lubrication subsystem health subscore | **VERIFIED** |
| **HP-B5** | **Fuel Flow** | `fuel_flow_lph` (`L/h`, `[0, 80]`) | `expected.fuel_flow_lph`, `calculated.fuel_flow_residual_lph`, `specific_fuel_index`, `fuel_to_pulse_ratio` | Telemetry inspector table, Fuel Injection Rail 3D subsystem | **VERIFIED** |
| **HP-B6** | **Vibration Signatures** | `vibration_rms_mms` (`mm/s`, `[0, 50]`) | `expected.vibration_rms_mms`, `vibration_residual_mms`, `vibration_rolling_mean_mms`, `vibration_rolling_std_mms`, `vibration_rolling_slope_mms_per_s`, `vibration_margin_pct` | Dual-trace Vibration RMS chart (`Screen 2`), 3D crankcase harmonic displacement | **VERIFIED** |
| **HP-B7** | **Battery / Alternator Health** | `battery_voltage_v` (`V`, `[0, 24]`), `alternator_current_a` (`A`, `[-50, 120]`) | `expected.battery_voltage_v`, `calculated.battery_voltage_residual_v`, envelope violation `LOW_BATTERY_VOLTAGE` (`< 11.8 V`) | Telemetry table & Sensor/FADEC harness subsystem callout | **VERIFIED** |
| **HP-B8** | **Injection Timing / Pulse** | `injection_pulse_ms` (`ms`, `[0, 30]`), `ignition_advance_deg` (`deg BTDC`, `[-15, 55]`) | `expected.injection_pulse_ms`, `expected.ignition_advance_deg`, `calculated.injection_pulse_residual_ms`, `fuel_to_pulse_ratio` | Used in `Fuel Injector Clogging` feature (`injection_pulse_residual_ms`, `fuel_to_pulse_ratio`) | **VERIFIED** |

---

## Section C: Required Fault Types (Mapped to the 9 Diagnostic Classes)

| Req ID | SIH26054 Required Fault Type | Implemented DRISHTI Class / Mechanism | Code Location | Verification Status |
|---|---|---|---|---|
| **FT-C1** | **Misfire** | `Cylinder Misfire` (EGT drop, RPM drop, torsional vibration rise, CHT drop) | [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L149-L154), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L252-L256) | **VERIFIED** (`Test F1 = 0.9832` on 100k; `0.9524` on 54-traj) |
| **FT-C2** | **Injector Abnormalities** | `Fuel Injector Clogging` (fuel flow drop despite positive injection pulse residual, lean EGT rise) | [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L168-L173), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L267-L271) | **VERIFIED** (`Test F1 = 0.9898` on 100k; `0.8571` on 54-traj) |
| **FT-C3** | **Cooling Degradation** | `Cylinder Overheating` + `cooling_effectiveness` ($\eta_{\text{cool}}$) + `cht_rolling_slope_c_per_s` & `thermal_margin_pct` | [`engine_model.py`](backend/app/physics/engine_model.py#L81-L92), [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L133-L139) | **VERIFIED** (`Test F1 = 0.9928` on 100k; `0.9624` on 54-traj) |
| **FT-C4** | **Lubrication Issues** | `Oil Pressure Drop` + `Crankshaft Bearing Wear` + `oil_pressure_margin_pct` + `LOW_OIL_PRESSURE` envelope check | [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L140-L148) | **VERIFIED** (`Oil Pressure Drop F1 = 0.9885`; `Bearing Wear F1 = 0.9905` on 100k) |
| **FT-C5** | **Sensor Drift / Failure** | `Sensor Fault` class (`drift`, `stuck_at`, `high_noise`, `missing_samples`, `implausible_values`) + [`SensorFaultIsolator`](backend/app/ml/sensor_fault_isolator.py) | [`sensor_fault_isolator.py`](backend/app/ml/sensor_fault_isolator.py#L19-L178), [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L174-L214) | **VERIFIED** (`Test F1 = 1.0000` on 100k; `0.9600` on 54-traj; RUL gated to `NOT_ESTIMABLE`) |
| **FT-C6** | **Combustion Instability** | Represented via `Cylinder Misfire`, `Valve Clearance Issue`, `Fuel Injector Clogging`, and EGT/CHT/vibration residuals & rolling standard deviations | [`features.py`](backend/app/ml/features.py#L31-L78) (`egt_residual_c`, `cht_rolling_std_c`, `vibration_rolling_std_mms`) | **PARTIALLY VERIFIED** (Covered via the 3 combustion/valvetrain classes and residual variance features as mapped on PPT Slide 2; not a separate 10th classifier label) |
| **FT-C7** | **Overheating Trends** | `Cylinder Overheating` + `Piston Ring Wear` + causal `cht_rolling_slope_c_per_s` + `CHT_HIGH_CRITICAL` alert rule | [`engine_model.py`](backend/app/physics/engine_model.py#L174-L236), [`alert_engine.py`](backend/app/alerts/alert_engine.py) | **VERIFIED** |
| **FT-C8** | **Abnormal Vibration Patterns** | `Crankshaft Bearing Wear`, `Piston Ring Wear`, `Valve Clearance Issue` + `vibration_residual_mms`, `vibration_rolling_std_mms`, `vibration_rolling_slope_mms_per_s` | [`engine_model.py`](backend/app/physics/engine_model.py#L193-L236) | **VERIFIED** |

---

## Section D: AI / ML Capabilities

| Req ID | AI / ML Capability | Model / Algorithm Implemented | Code Location | Status |
|---|---|---|---|---|
| **ML-D1** | **9-Class Fault Classification** | `sklearn.ensemble.RandomForestClassifier` | [`pipeline.py`](backend/app/ml/pipeline.py#L149-L178), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L618-L657) | **VERIFIED** |
| **ML-D2** | **Unsupervised Anomaly Detection** | `sklearn.ensemble.IsolationForest` fit strictly on Normal training subset; threshold calibrated on Validation Normal split | [`pipeline.py`](backend/app/ml/pipeline.py#L180-L218), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L659-L699) | **VERIFIED** |
| **ML-D3** | **Remaining Useful Life (RUL) Estimation** | `xgboost.XGBRegressor` (`v3.2.0`) + `RandomForestRegressor` (40 trees for 10th–90th percentile intervals) in both `cycles` and `hours` with `NOT_ESTIMABLE` sensor-fault gating | [`pipeline.py`](backend/app/ml/pipeline.py#L233-L261), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L739-L779) | **VERIFIED** |
| **ML-D4** | **Trend Analysis** | Causal 12-sample rolling mean, standard deviation, and linear least-squares slope (`dCHT/dt`, `dOilP/dt`, `dVib/dt`) | [`engine_model.py`](backend/app/physics/engine_model.py#L140-L172), [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L63-L101) | **VERIFIED** |
| **ML-D5** | **Predictive Maintenance Recommendations** | Fault-specific maintenance actions, severity ranking (`ADVISORY`, `CAUTION`, `WARNING`, `CRITICAL`), and evidence trails | [`alert_engine.py`](backend/app/alerts/alert_engine.py#L16-L158) | **VERIFIED** |

---

## Section E: Simulation & Mission Replay

| Req ID | Simulation / Replay Capability | Implementation Evidence | Status |
|---|---|---|---|
| **SR-E1** | **Historical Mission Replay** | [`HistoricalReplayController`](backend/app/simulation/replay_controller.py) supporting `start`, `stop`, `seek` (by index, timestamp, or elapsed sec), `step`, speed control, and synchronized alert filtering; UI in `Screen 6` ([`SimReplayAndDataScreens.tsx`](frontend/src/screens/SimReplayAndDataScreens.tsx)). | **VERIFIED** |
| **SR-E2** | **High-Altitude Conditions** | `high_altitude` profile (`5200–6100 m` / `17,060–20,013 ft`, `-16°C` ambient, `84%` throttle) in [`mission_profiles.py`](backend/app/simulation/mission_profiles.py#L27-L35) and [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L143-L147). | **VERIFIED** |
| **SR-E3** | **Endurance Missions** | `long_endurance` profile (`3600 m`, `62%` economy cruise throttle) in [`mission_profiles.py`](backend/app/simulation/mission_profiles.py#L45-L53) and [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L153-L157). | **VERIFIED** |
| **SR-E4** | **Hot-Weather Operation** | `hot_weather` profile (`1200 m`, `41–43.5°C` ambient, `78%` throttle) in [`mission_profiles.py`](backend/app/simulation/mission_profiles.py#L36-L44) and [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L148-L152). | **VERIFIED** |
| **SR-E5** | **Rapid Throttle Transitions** | `rapid_throttle` profile (step-wave throttle transitions `25%–98%` every 10s) in [`fault_simulator.py`](backend/app/simulation/fault_simulator.py#L101-L106) and [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L158-L162). | **VERIFIED** |

---

## Section F: Operator Dashboard (`frontend/src/`)

| Req ID | Dashboard Requirement | UI Screen & Component | Backend API Endpoint | Status |
|---|---|---|---|---|
| **DB-F1** | **Real-Time / Simulated Engine-Health Status** | `Screen 1` (`FleetCommandScreen`), `Screen 2` (`EngineDigitalTwinScreen`), `Screen 3` (`Interactive3DEngineTwinScreen`) | `GET /api/fleet`, `GET /api/engines/{id}/telemetry`, `WS /ws/telemetry` | **VERIFIED** |
| **DB-F2** | **Fault Alerts with Evidence & Confidence** | `Screen 4` (`FaultInvestigationScreen`) with acknowledge button, residual evidence list, confidence %, model/rule version | `GET /api/engines/{id}/alerts`, `POST /api/alerts/{id}/acknowledge` | **VERIFIED** |
| **DB-F3** | **Engine-Efficiency & Safety Margin Trends** | `Screen 2` & `Screen 7` (`PredictiveMaintenanceRulScreen`) showing thermal, oil pressure, and vibration margins + specific fuel index | `GET /api/engines/{id}/health`, `GET /api/engines/{id}/telemetry` | **VERIFIED** |
| **DB-F4** | **Maintenance Advice & RUL (`cycles` + `hours`)** | `Screen 4` & `Screen 7` (`PredictiveMaintenanceRulScreen`) | `GET /api/engines/{id}/health` | **VERIFIED** |
| **DB-F5** | **Mission-Wise Health Reports & JSON Export** | `Screen 9` (`ReportsAndSettingsScreen`) | `GET /api/reports`, `GET /api/reports/{report_id}` | **VERIFIED** |

---

## Section G: Architecture & Deployment

| Req ID | Architecture / Deployment Claim | Actual Repository State | Status |
|---|---|---|---|
| **AD-G1** | **Telemetry Ingestion (JSON, CSV, Simulated CAN)** | `POST /api/predict`, `POST /api/telemetry/ingest-csv`, [`SimulatedRotaxCANAdapter`](backend/app/telemetry/can_adapter.py) | **VERIFIED (Simulated / CSV)** |
| **AD-G2** | **FastAPI Backend & SQLite Persistence** | 25 REST + 1 WebSocket route in [`backend/app/main.py`](backend/app/main.py); SQLite in [`backend/app/storage/database.py`](backend/app/storage/database.py) | **VERIFIED** |
| **AD-G3** | **Model-Serving Path (`scikit-learn` + `xgboost`)** | [`DrishtiMLPipeline`](backend/app/ml/pipeline.py) serving `RandomForestClassifier`, `IsolationForest`, `XGBRegressor`, `RandomForestRegressor`, and `SensorFaultIsolator` | **VERIFIED** |
| **AD-G4** | **Frontend-to-Backend Integration** | Typed API client [`frontend/src/api/client.ts`](frontend/src/api/client.ts) + WebSocket hook | **VERIFIED** |
| **AD-G5** | **Automated Tests & Build Verification** | `41/41` pytest tests passing (`exit code 0`), `npm run build` passing (`exit code 0`) | **VERIFIED** |
| **AD-G6** | **Secondary PPT Tech Stack Claims (`MQTT`, `Node.js/Express`, `PyTorch`, `PostgreSQL`, `Docker`, `Socket.IO`, `TLS/SSL`, `Federated Learning`)** | Mentioned in PPT slides (`Team_Drishti` mentions `MQTT`; `Drishti-DT` mentions `Express`, `PyTorch`, `PostgreSQL`, `Docker`, `Socket.IO`, `TLS`, `Federated learning`), whereas actual working repo uses **FastAPI + SQLite + scikit-learn/XGBoost + React/Vite + native WebSocket** | **NOT IMPLEMENTED (Documented Stack Divergence)** |
