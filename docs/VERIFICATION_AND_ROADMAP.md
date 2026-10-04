# DRISHTI Digital Twin — Verification Report, Security Notes & Hardware Roadmap (SIH26054)

## 1. Automated Verification Test Report

**Test Runner:** `pytest 9.1.1` on Python `3.11.9` (Windows)  
**Command:** `python -m pytest -v`  
**Result:** **11 PASSED, 0 FAILED**

| Test Module | Test Function | Verified Scope | Status |
| :--- | :--- | :--- | :--- |
| `tests/test_telemetry_contract.py` | `test_schema_version_and_nine_classes` | Telemetry schema v1.0.0, 9 diagnostic classes, unit dictionary | `PASSED` |
| `tests/test_telemetry_contract.py` | `test_validator_nominal_and_missing_duplicate_stale_out_of_order` | Missing-channel imputation, duplicate detection, out-of-order rejection, stale gap detection, implausible bounds, rejection rate counters | `PASSED` |
| `tests/test_telemetry_contract.py` | `test_can_adapter_roundtrip_and_status` | Binary CAN frame (`0x101..0x104`) pack/unpack round-trip and honest hardware status disclosure | `PASSED` |
| `tests/test_telemetry_contract.py` | `test_csv_telemetry_parser` | Historical CSV ingestion into `TelemetryInputFrame` records | `PASSED` |
| `tests/test_physics_twin.py` | `test_physics_expected_relationships_and_metadata` | Physics reference equations, load/altitude/cooling directional sensitivity, metadata exposure | `PASSED` |
| `tests/test_physics_twin.py` | `test_physics_extrapolation_detection_and_residuals` | Operating envelope extrapolation flagging, causal rolling linear slope calculation | `PASSED` |
| `tests/test_fault_simulator.py` | `test_fault_simulator_reproducibility_and_nine_classes` | Deterministic seed reproducibility across all 9 fault classes | `PASSED` |
| `tests/test_fault_simulator.py` | `test_sensor_fault_submodes` | `drift`, `stuck_at`, `high_noise`, `missing_samples`, and `implausible_values` sensor fault modes | `PASSED` |
| `tests/test_ml_pipeline.py` | `test_ml_pipeline_training_leak_free_and_metrics` | Zero engine/trajectory overlap between train and test, held-out 9-class RF metrics, IsolationForest recall/FAR, Sensor-Fault Isolator, RUL MAE/RMSE and `NOT_ESTIMABLE` gating | `PASSED` |
| `tests/test_ml_pipeline.py` | `test_unavailable_model_artifact_fallback` | Graceful rule-only fallback and `NOT_ESTIMABLE` RUL when `.joblib` artifact is absent | `PASSED` |
| `tests/test_api_and_e2e.py` | `test_full_end_to_end_11_step_workflow_and_api` | Complete 11-step E2E workflow across FastAPI endpoints, SQLite persistence, replay synchronization, report export, and WebSocket streaming | `PASSED` |

---

## 2. Measured Machine Learning & Runtime Benchmarks

All ML metrics below were measured on the **held-out test set (`648 samples` across `18 independent test trajectories / 18 distinct test engines`)** with **0 shared engines** between training (`36 trajectories`) and testing (`18 trajectories`):

- **9-Class Random Forest Classifier (`DRISHTI-ML-Ensemble-v1.0`):**
  - Held-Out Overall Accuracy: **`97.38%`** (`0.9738`)
  - Held-Out Macro-F1: **`97.69%`** (`0.9769`)
  - Per-Class Held-Out F1:
    - `Normal`: `0.9513` (Precision `0.9171`, Recall `0.9881`, Support `168`)
    - `Cylinder Overheating`: `1.0000` (Support `60`)
    - `Oil Pressure Drop`: `1.0000` (Support `60`)
    - `Crankshaft Bearing Wear`: `1.0000` (Support `60`)
    - `Cylinder Misfire`: `1.0000` (Support `60`)
    - `Sensor Fault`: `0.8411` (Precision `0.9574`, Recall `0.7500`, Support `60`)
    - `Piston Ring Wear`: `1.0000` (Support `60`)
    - `Valve Clearance Issue`: `1.0000` (Support `60`)
    - `Fuel Injector Clogging`: `1.0000` (Support `60`)
- **Independent Anomaly Detector (`IsolationForest` fit on normal training trajectories):**
  - Calibrated Threshold: `-0.0274` (96th percentile of normal training scores)
  - Held-Out Recall: **`88.75%`** (`0.8875`)
  - Held-Out False Alarm Rate (FAR): **`1.19%`** (`0.0119`)
  - Held-Out Precision: **`99.53%`** (`0.9953`)
- **Dedicated Sensor-Fault Isolator (`SensorFaultIsolator-v1.0`):**
  - Precision: **`84.44%`** (`0.8444`), Recall: **`63.33%`** (`0.6333`) before RF fusion; combined with `SENSOR_FAULT_OVERRIDE` in the inference pipeline.
- **Remaining Useful Life Regressor (`RandomForestRegressor`, target unit = `hours`):**
  - Held-Out MAE: **`2.805 hours`**
  - Held-Out RMSE: **`4.193 hours`** (across `588` held-out mechanical degradation samples)
- **Measured Processing Throughput & Latency (Python 3.11.9 single-process local setup):**
  - Single-Point End-to-End Inference Latency (Validation + Physics Expected + Residual Slopes + RF + IsolationForest + RUL + Alert Engine): **`~3.5 to 8.5 ms / frame`**
  - Batch Simulation Throughput: **`~115 to 260 frames / sec`**

---

## 3. Capability Validation Matrix (Implemented vs. Validated)

| Capability | Software Implemented | Automated Tested | Simulated Data | Externally Validated | Hardware Validated |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Versioned Telemetry Schema & Stream Validator | Yes | Yes | Yes | N/A | No |
| Physics-Informed Expected-Value Reference Engine | Yes | Yes | Yes | No (Analytical Ref) | No |
| Four-Value Digital Twin (`ACTUAL`/`EXPECTED`/`CALCULATED`/`PREDICTED`) | Yes | Yes | Yes | No | No |
| 9-Class Fault Classifier & IsolationForest Anomaly Detector | Yes | Yes | Yes | No | No |
| Sensor-Fault Isolation & RUL `NOT_ESTIMABLE` Gating | Yes | Yes | Yes | No | No |
| Mission Replay & Explainable Maintenance Advisory | Yes | Yes | Yes | No | No |
| CAN / SocketCAN Binary Codec (`0x101..0x104`) | Yes | Yes | Yes | No | No |

---

## 4. Security & Data-Integrity Notes

1. **Input Sanitization & Bounds Enforcement:** All incoming telemetry frames pass through Pydantic schema validation (`TelemetryInputFrame`) and `TelemetryValidator` before reaching the physics or ML modules. `NaN`, `Inf`, negative sequence numbers, and extreme numeric overflows are intercepted and logged in `DataQualityMetadata`.
2. **Parameterized SQL Queries:** All SQLite operations in `backend/app/db/database.py` use parameterized `?` placeholders, preventing SQL injection across engine IDs, mission IDs, and report queries.
3. **Advisory Boundary Enforcement:** The system has no actuator command endpoints or autonomous flight-control outputs. Every alert and report embeds explicit provenance (`is_synthetic`, `data_source`, `model_version`, `rule_version`) and advisory disclaimers.

---

## 5. Future Real-Telemetry Integration & Hardware Validation Roadmap

### Phase 1: Engine Dynamometer Test-Cell Calibration
1. Connect `ModularSocketCANAdapter` (`backend/app/telemetry/can_adapter.py`) to a physical Linux SocketCAN (`can0` at 500 kbps) or Windows PCAN-USB interface reading a Rotax 914F/UL ECU or aftermarket UAV EMS.
2. Replace the empirical coefficients in `AeroPistonReferenceModel` (`backend/app/physics/engine_model.py`) with multi-dimensional lookup tables fit to steady-state and transient dynamometer sweeps across RPM, manifold pressure, altitude chamber pressure, and ambient air temperature.

### Phase 2: Seeded Hardware Fault & Endurance Validation
1. Record real sensor degradation runs (thermocouple open-circuit, oil pressure transducer drift, spark plug fouling, restricted injector nozzle) on an instrumented ground test stand.
2. Retrain `DrishtiMLPipeline` on mixed test-cell + flight-log corpora using the existing engine-level group split architecture.

### Phase 3: UAV Ground Control Station (GCS) Deployment
1. Deploy the FastAPI backend as an onboard companion-computer microservice or Ground Control Station (GCS) telemetry consumer receiving MAVLink `EFI_STATUS` / custom CAN-over-UDP downlinks.
