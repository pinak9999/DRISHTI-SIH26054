# DRISHTI — SIH 2026 PPT: Source-of-Truth Spec
**Team**: Wing Warriors2B (ID: 187024, Problem Statement: SIH26054)  
**Extracted from**: `Wing_Warriors2B (final).pptx`  
**Reference Status**: Benchmark & Requirement Baseline

---

## 1. Problem Statement
**Title**: AI-Enabled Real-Time Digital Twin System for Health Monitoring, Fault Prediction and Mission Reliability Enhancement of Aero Piston Engines used in MALE UAVs.  
**Theme**: Robotics & Drones  
**Category**: Software  
**Target Platform**: Medium-Altitude Long-Endurance (MALE) UAVs powered by turbocharged 4-stroke aero piston engines (e.g., Rotax 914 F series).

---

## 2. Solution Flow (6 Core Capabilities)
1. **Telemetry Ingestion & Quality Validation**: Real-time multi-channel sensor ingestion, range/rate-of-change validation, parity verification, and timestamp sequencing.
2. **Physics-Informed Digital Twin Comparison**: Observed telemetry vs. analytical aero-piston thermodynamic/mechanical expected values; computation of lumped residuals.
3. **Early Anomaly Detection**: Unsupervised multivariate anomaly scoring on physics residuals and safety margins (IsolationForest).
4. **Sensor-Fault Isolation**: Dedicated heuristic cross-channel consistency and noise analysis to distinguish sensor failures from physical mechanical engine faults.
5. **Predictive Maintenance & RUL**: 9-class supervised fault classification (RandomForestClassifier) and remaining useful life estimation (XGBRegressor) with empirical confidence bounds.
6. **Actionable Output & Health Index**: Composite Health Index (0–100), explainable evidence, automated dispatch recommendations, and mission go/no-go readiness assessment.

---

## 3. Nine Fault Taxonomy Classes
1. `Normal`: Nominal operation within standard operational envelopes.
2. `Cylinder Overheating`: Elevated CHT/EGT indicating cooling degradation or combustion anomalies.
3. `Oil Pressure Drop`: Loss of lubrication line pressure endangering bearing integrity.
4. `Crankshaft Bearing Wear`: High rotational vibration coupled with oil pressure drop and temperature rise.
5. `Cylinder Misfire`: Asymmetric EGT/CHT fluctuation accompanied by power deficit and low-frequency vibration.
6. `Sensor Fault`: Disconnected, drifting, or stuck telemetry sensors isolated from mechanical engine faults.
7. `Piston Ring Wear`: Blow-by causing elevated crankcase pressure, gradual CHT rise, and oil consumption.
8. `Valve Clearance Issue`: Mechanical valvetrain lash degradation producing acoustic/vibrational peaks and CHT shifts.
9. `Fuel Injector Clogging`: Lean burn symptoms, EGT spike on affected cylinder bank, fuel flow deviation.

---

## 4. Benchmark Dataset & Splitting
- **Dataset Size**: 100,000 telemetry rows across 50 distinct physical engine units (`ENG-UNIT-001` through `ENG-UNIT-050`).
- **Engine-Level Isolation** (Zero Leakage):
  - **Train**: 35 engines (70,000 rows, 70.0%)
  - **Validation**: 8 engines (15,000 rows, 15.0%)
  - **Test (Held-Out)**: 7 engines (15,000 rows, 15.0%)
- **Mission Profiles**: 5 operational regimes (Normal Mission, High Altitude, Hot Weather, Long Endurance, Rapid Throttle).

---

## 5. Machine Learning Models & Targets
- **Supervised Classifier**: 9-Class `RandomForestClassifier` (120 estimators, depth=14, balanced subsample).
- **Anomaly Detector**: `IsolationForest` fitted on normal flight residuals with threshold calibrated on validation split.
- **RUL Estimator**: `xgboost.XGBRegressor` evaluated on degradation trajectories (cycles and hours).
- **Health Index Formula**:
  $$\text{HI} = \text{clip}\left(100 - (0.30 \cdot P_{\text{thermal}} + 0.30 \cdot P_{\text{oil}} + 0.20 \cdot P_{\text{vib}} + 0.20 \cdot P_{\text{anom}}), 0, 100\right)$$
  - $\alpha = 0.30$ (Thermal residual penalty)
  - $\beta = 0.30$ (Oil lubrication penalty)
  - $\gamma = 0.20$ (Vibration mechanical penalty)
  - $\delta = 0.20$ (Anomaly penalty)

---

## 6. Architectural Honesty & Verification Policy
- **Ground Truth**: Measured repository data and trained model artifacts take absolute precedence over presentation claims.
- **Data Provenance**: Explicit disclosure that training datasets are 100% physics-informed synthetic telemetry (`DRISHTI-SynthCorpus-100k-v2.0`).
- **Sensor Localization**: Lumped telemetry only; no false claims of cylinder-localized sensors unless instrumentation physically exists.
- **Planned Stack**: PostgreSQL, MQTT broker, Jetson edge deployment, and CAN bus integration are explicitly flagged as `PLANNED` until implemented.
