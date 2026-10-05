/**
 * DRISHTI — SIH 2026 Presentation Requirement Traceability Matrix
 * Team: Wing Warriors2B | Team ID: 187024 | Problem Statement: SIH26054
 * Source-of-Truth Spec: Wing_Warriors2B (final).pptx & docs/PPT_FIX_LIST.md
 *
 * System Engineering Policy:
 * Repository data and measured artifacts take absolute precedence over presentation claims.
 * Discrepancies are explicitly disclosed and logged; thresholds and models are never artificially tuned.
 */

export interface PptTraceabilityItem {
  id: string;
  category: 'capabilities' | 'taxonomy' | 'ml_metrics' | 'architecture' | 'data_provenance' | 'digital_twin';
  categoryLabel: string;
  slideRef: string;
  requirement: string;
  pptClaim: string;
  codebaseImplementation: string;
  backendSource: string;
  status: 'VERIFIED' | 'EXCEEDS_TARGET' | 'HONEST_DISCLOSURE' | 'PLANNED_STACK';
  statusLabel: string;
  notes: string;
}

export const PPT_TRACEABILITY_ITEMS: PptTraceabilityItem[] = [
  // 1. Core 6 Capabilities
  {
    id: 'CAP-01',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 2 / Slide 3',
    requirement: 'Telemetry Ingestion & Quality Validation',
    pptClaim: 'Real-time multi-channel sensor ingestion, range/rate-of-change validation, and frame sequencing',
    codebaseImplementation: 'Multi-channel validator checking range, rate-of-change, timestamp sequencing, duplicate/stale detection, and telemetry quality scoring (0-100)',
    backendSource: 'backend/app/alerts/data_quality.py, backend/app/schemas/telemetry.py',
    status: 'VERIFIED',
    statusLabel: 'Implemented & Verified',
    notes: 'Exposed via /api/engines/{id}/telemetry and live WebSocket /ws/telemetry with DataQualityValidator stats.',
  },
  {
    id: 'CAP-02',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 3 / Slide 7',
    requirement: 'Physics-Informed Digital Twin Comparison',
    pptClaim: 'Observed telemetry vs. analytical aero-piston thermodynamic/mechanical expected values',
    codebaseImplementation: 'Rotax 914 F thermodynamic & mechanical model computing 4-value matrix: Actual | Expected | Calculated | Predicted',
    backendSource: 'backend/app/physics/rotax914_baseline.py',
    status: 'VERIFIED',
    statusLabel: 'Implemented & Verified',
    notes: 'Calculates lumped CHT, EGT, oil pressure, oil temperature, vibration, and fuel flow residuals with baseline lookup.',
  },
  {
    id: 'CAP-03',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 3 / Slide 5',
    requirement: 'Early Anomaly Detection',
    pptClaim: 'Unsupervised multivariate anomaly detection with 0.94 recall and 0.03 false alarm rate',
    codebaseImplementation: 'IsolationForest trained on nominal operational residuals with threshold calibrated on validation split',
    backendSource: 'backend/app/ml/pipeline.py (IsolationForest)',
    status: 'HONEST_DISCLOSURE',
    statusLabel: 'Calibrated (~92.7% Recall, ~3.0% FAR)',
    notes: 'Measured recall on held-out test split is 92.72% at 2.98% FAR. Presentation claim of 94% was slightly optimistic; calibrated without overfitting.',
  },
  {
    id: 'CAP-04',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 3 / Slide 6',
    requirement: 'Sensor-Fault Isolation',
    pptClaim: 'Distinguishes physical mechanical engine degradation from sensor failures with 0.91 F1',
    codebaseImplementation: 'SensorFaultIsolator cross-checking physical correlations (e.g. CHT vs EGT vs oil temp vs fuel flow) to detect single-sensor drift/loss',
    backendSource: 'backend/app/ml/pipeline.py (SensorFaultIsolator)',
    status: 'EXCEEDS_TARGET',
    statusLabel: 'Exceeds Target (100% Synthetic F1)',
    notes: 'Physics cross-channel parity checks achieve 100% precision and recall on synthetic sensor failure injections.',
  },
  {
    id: 'CAP-05',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 3 / Slide 5',
    requirement: 'Predictive Maintenance & RUL Estimation',
    pptClaim: '9-class fault classification (0.92 F1) and RUL estimation (18.6 cyc MAE)',
    codebaseImplementation: 'RandomForestClassifier (9-class, Macro-F1 98.53%) and XGBRegressor RUL with 10th-90th empirical percentiles (MAE 8.62 cyc, RMSE 11.41 cyc)',
    backendSource: 'backend/app/ml/pipeline.py, backend/artifacts/ppt_100k_ml_bundle.joblib',
    status: 'EXCEEDS_TARGET',
    statusLabel: 'Exceeds Target (F1: 98.5%, MAE: 8.6 cyc)',
    notes: 'Trained on 100k rows across 50 engines. Zero-leakage held-out test split exceeds presentation expectations.',
  },
  {
    id: 'CAP-06',
    category: 'capabilities',
    categoryLabel: 'Core Capabilities',
    slideRef: 'Slide 3 / Slide 8',
    requirement: 'Actionable Output & Health Index',
    pptClaim: 'Composite Health Index (0-100), automated maintenance recommendations, mission readiness go/no-go',
    codebaseImplementation: '4-component weighted penalty formula: HI = clip(100 - (0.30*P_thermal + 0.30*P_oil + 0.20*P_vib + 0.20*P_anom), 0, 100)',
    backendSource: 'backend/app/physics/rotax914_baseline.py, backend/app/alerts/alert_engine.py',
    status: 'VERIFIED',
    statusLabel: 'Implemented & Verified',
    notes: 'Alert acknowledge workflow (POST /api/alerts/{id}/acknowledge) with full evidence logs and dispatch action guidelines.',
  },

  // 2. Nine Fault Classes Taxonomy
  {
    id: 'TAX-01',
    category: 'taxonomy',
    categoryLabel: 'Fault Taxonomy',
    slideRef: 'Slide 4 — 9 Fault Classes',
    requirement: 'Complete 9-Class Aero Piston Fault Taxonomy',
    pptClaim: 'Normal, Cylinder Overheating, Oil Pressure Drop, Crankshaft Bearing Wear, Cylinder Misfire, Sensor Fault, Piston Ring Wear, Valve Clearance Issue, Fuel Injector Clogging',
    codebaseImplementation: 'Exact 9-class enumeration in FAULT_CLASSES, synthetic fault simulator, classifier classes, and 9x9 confusion matrix',
    backendSource: 'backend/app/schemas/telemetry.py, backend/app/simulation/fault_simulator.py',
    status: 'VERIFIED',
    statusLabel: '100% Taxonomy Parity',
    notes: 'Every class has physics-based telemetry signatures, dedicated residual patterns, and maintenance action rules.',
  },

  // 3. Machine Learning Metrics & Ground Truth
  {
    id: 'ML-01',
    category: 'ml_metrics',
    categoryLabel: 'ML Evaluation',
    slideRef: 'Slide 5 — ML Metrics',
    requirement: 'Classifier Macro-F1 Score',
    pptClaim: '0.92 (92.0%)',
    codebaseImplementation: 'RandomForestClassifier: 99.10% (Validation, 15k) | 98.53% (Held-Out Test, 15k)',
    backendSource: 'backend/artifacts/ppt_100k_evaluation.json',
    status: 'EXCEEDS_TARGET',
    statusLabel: 'Measured: 98.53%',
    notes: '100k physics-informed synthetic dataset provides high feature separability across all 9 mechanical modes.',
  },
  {
    id: 'ML-02',
    category: 'ml_metrics',
    categoryLabel: 'ML Evaluation',
    slideRef: 'Slide 5 — ML Metrics',
    requirement: 'Anomaly Detection Recall & False Alarm Rate',
    pptClaim: 'Recall: 0.94 (94.0%), FAR: 0.03 (3.0%)',
    codebaseImplementation: 'IsolationForest: Recall 92.72%, FAR 2.98% on 7 completely unseen held-out test engines',
    backendSource: 'backend/artifacts/ppt_100k_evaluation.json',
    status: 'HONEST_DISCLOSURE',
    statusLabel: 'Calibrated: Recall 92.7%, FAR 3.0%',
    notes: 'Presentation 94% recall was over-reported. Codebase strictly preserves calibrated decision threshold without overfitting.',
  },
  {
    id: 'ML-03',
    category: 'ml_metrics',
    categoryLabel: 'ML Evaluation',
    slideRef: 'Slide 5 — ML Metrics',
    requirement: 'Remaining Useful Life (RUL) Error (MAE & RMSE)',
    pptClaim: 'MAE: 18.6 cycles, RMSE: 27.4 cycles',
    codebaseImplementation: 'XGBRegressor: MAE 8.62 cycles (12.92 h), RMSE 11.41 cycles (17.12 h) on held-out test trajectories',
    backendSource: 'backend/artifacts/ppt_100k_evaluation.json',
    status: 'EXCEEDS_TARGET',
    statusLabel: 'Measured: MAE 8.62 cyc, RMSE 11.41 cyc',
    notes: 'Causal rolling features and degradation curve fitting significantly outperform legacy presentation estimate.',
  },

  // 4. Hardware & Architecture Disclosures
  {
    id: 'ARCH-01',
    category: 'architecture',
    categoryLabel: 'System Architecture',
    slideRef: 'Slide 6 — Edge Computing',
    requirement: 'NVIDIA Jetson Orin Nano Edge Deployment',
    pptClaim: 'Edge-native inference running on Jetson Orin Nano onboard UAV',
    codebaseImplementation: 'FastAPI Python daemon running on local host with C-level Cython/scikit-learn tree pointers for sub-5ms low latency inference',
    backendSource: 'backend/app/main.py, backend/app/ml/pipeline.py',
    status: 'PLANNED_STACK',
    statusLabel: 'PLANNED (Target Edge Arch)',
    notes: 'Prototype executes on standard workstation hardware. Onboard Jetson deployment is targeted for hardware integration phase.',
  },
  {
    id: 'ARCH-02',
    category: 'architecture',
    categoryLabel: 'System Architecture',
    slideRef: 'Slide 6 — Avionics Bus',
    requirement: 'CANaerospace / ARINC-429 Bus Interface',
    pptClaim: 'Direct hardware connection to UAV avionics CAN / ARINC bus',
    codebaseImplementation: 'SocketCAN adapter codec (python-can) supporting virtual/vcan0 with graceful software loopback fallback',
    backendSource: 'backend/app/alerts/can_interface.py',
    status: 'PLANNED_STACK',
    statusLabel: 'PLANNED (Hardware Ingestion)',
    notes: 'Software codec validated with simulated CAN frame broadcasts; physical transceiver connection planned for ground test rig.',
  },
  {
    id: 'ARCH-03',
    category: 'architecture',
    categoryLabel: 'System Architecture',
    slideRef: 'Slide 6 — Database & Storage',
    requirement: 'TimescaleDB / PostgreSQL Time-Series Database',
    pptClaim: 'Enterprise PostgreSQL/TimescaleDB time-series storage tier',
    codebaseImplementation: 'High-speed SQLite in WAL (Write-Ahead Logging) mode with in-memory circular telemetry buffer',
    backendSource: 'backend/app/database.py, backend/app/service.py',
    status: 'PLANNED_STACK',
    statusLabel: 'PLANNED (Enterprise DB)',
    notes: 'SQLite WAL handles 10-50 Hz flight data without external DBMS overhead during prototype evaluation.',
  },
  {
    id: 'ARCH-04',
    category: 'architecture',
    categoryLabel: 'System Architecture',
    slideRef: 'Slide 6 — Telemetry Broker',
    requirement: 'MQTT / DDS Publish-Subscribe Telemetry Broker',
    pptClaim: 'Distributed MQTT/DDS broker tier for real-time telemetry streaming',
    codebaseImplementation: 'FastAPI WebSocket endpoint (/ws/telemetry) with client auto-reconnection and continuous fleet simulation loop',
    backendSource: 'backend/app/main.py, backend/app/service.py',
    status: 'PLANNED_STACK',
    statusLabel: 'PLANNED (Broker Tier)',
    notes: 'Bi-directional WebSockets provide real-time 10 Hz telemetry streaming directly to the 3D digital twin client.',
  },

  // 5. Data Provenance & Physical Sensor Disclosures
  {
    id: 'DATA-01',
    category: 'data_provenance',
    categoryLabel: 'Data Provenance',
    slideRef: 'Slide 7 — Dataset & Training',
    requirement: 'NASA C-MAPSS & Flight Logs Claim',
    pptClaim: 'Validated on NASA C-MAPSS turbofan dataset and MALE UAV flight logs',
    codebaseImplementation: '100% synthetic physics-informed aero-piston corpus (DRISHTI-SynthCorpus-100k-v2.0, 50 distinct engines, 100,000 frames)',
    backendSource: 'backend/app/simulation/dataset_generator.py, backend/artifacts/ppt_100k_evaluation.json',
    status: 'HONEST_DISCLOSURE',
    statusLabel: 'Synthetic Benchmark Corpus',
    notes: 'NASA C-MAPSS degradation law was adapted to 4-stroke aero-piston thermodynamics; no unvalidated raw turbofan data or classified flight logs are claimed.',
  },
  {
    id: 'DATA-02',
    category: 'digital_twin',
    categoryLabel: 'Digital Twin',
    slideRef: 'Slide 7 — 3D Twin & Localization',
    requirement: 'Cylinder-Level Sensor Localization Claim',
    pptClaim: 'Pinpoints cylinder #3 misfire/overheat with individual cylinder sensor mapping',
    codebaseImplementation: 'Lumped engine CHT/EGT telemetry with inferential physics subsystem mapping and visible disclosure banners',
    backendSource: 'frontend/src/screens/twin/EngineDigitalTwinScreen.tsx',
    status: 'HONEST_DISCLOSURE',
    statusLabel: 'Inferred (Lumped Telemetry)',
    notes: 'Explicitly discloses: "Inferred from lumped telemetry - not sensor-localized. Cylinder-level physical instrumentation requires individual EGT/CHT probes."',
  },
  {
    id: 'DT-01',
    category: 'digital_twin',
    categoryLabel: 'Digital Twin',
    slideRef: 'Slide 7 — 4-Value Matrix',
    requirement: 'Four-Value Digital Twin Matrix',
    pptClaim: 'Actual (telemetry) | Expected (physics) | Calculated (residuals) | Predicted (ML)',
    codebaseImplementation: 'Synchronized 4-column matrix across all 6 primary telemetry channels with colour-coded residual tolerances from alert_engine.py',
    backendSource: 'backend/app/physics/rotax914_baseline.py, backend/app/alerts/alert_engine.py',
    status: 'VERIFIED',
    statusLabel: 'Implemented & Verified',
    notes: 'Residual bands strictly adhere to alert_engine constants: CHT 10°C, EGT 25°C, Oil P -0.35 bar, Oil T 8°C, Vib 0.70 mm/s, FF 1.8 L/h.',
  },
];
