# DRISHTI — PPT vs. Measured Software Fix List & Traceability

This register explicitly documents every discrepancy between the claims in `Wing_Warriors2B (final).pptx` and the actual measured empirical facts in the codebase. As required by the system engineering guidelines, **the codebase NEVER tunes thresholds or fabricates numbers to meet presentation claims; measured data is the sole ground truth.**

---

## 1. Machine Learning Metric Comparisons

| Metric | Slide Claim (PPT) | Measured (Validation) | Measured (Held-Out Test) | Status / Engineering Note |
|---|---|---|---|---|
| **Classifier Macro F1** | `0.92` (92%) | `0.9910` (99.1%) | `0.9853` (98.5%) | **PPT Under-reported**: 100k synthetic dataset with physics-informed features allows high separability for distinct mechanical fault modes. |
| **Anomaly Recall** | `0.94` (94%) | `0.9262` (92.6%) | `0.9272` (92.7%) | **PPT Over-reported**: Measured recall on completely unseen engine units is ~92.7% at ~3% false alarm rate with calibrated IsolationForest threshold. |
| **Anomaly False Alarm Rate** | `0.03` (3.0%) | `0.0301` (3.0%) | `0.0298` (3.0%) | **Matches Within Margin**: Calibrated threshold on normal validation split satisfies target ~3% false positive rate. |
| **RUL XGBoost MAE (cycles)** | `18.6` cycles | `8.444` cycles | `8.618` cycles | **PPT Under-reported / Outdated**: XGBoost gradient boosting with causal rolling features achieved 8.6 cycles MAE on held-out test trajectories. |
| **RUL XGBoost RMSE (cycles)** | `27.4` cycles | `11.274` cycles | `11.412` cycles | **PPT Under-reported / Outdated**: Measured RMSE is 11.4 cycles. |
| **Sensor Fault Isolation F1** | `0.91` (91%) | `1.0000` (100%) | `1.0000` (100%) | **PPT Conservative**: Physics cross-channel parity checks isolate disconnected/drifting synthetic sensor injections without false positives. |

---

## 2. Dataset & Training Provenance

| Dimension | Slide Claim (PPT) | Repo Reality | Correction / Disclosure |
|---|---|---|---|
| **C-MAPSS Direct Usage** | "Validated on NASA C-MAPSS turbofan dataset" | Synthetic aero-piston corpus only; C-MAPSS is non-piston turbofan | **Disclosure Added**: C-MAPSS nonlinear damage degradation law ($D(t)$ exponential wear) was adapted to 4-stroke piston physics. Raw turbofan data is not directly used for reciprocating engine inference. |
| **Real Flight Data** | "Tested on MALE UAV flight logs" | 100% synthetic physics-informed simulator telemetry | **Disclosure Added**: Synthetic dataset badge and telemetry provenance banner rendered across all screens. |
| **Dataset Scale** | 100,000 telemetry frames | `DRISHTI-SynthCorpus-100k-v2.0` (100k rows, 50 engines) | **Verified**: Generated and verified with strict zero-leakage 35/8/7 engine split. |

---

## 3. Hardware & Architecture Claims

| Feature | Slide Claim | Implementation State | Presentation Status |
|---|---|---|---|
| **NVIDIA Jetson Edge** | "Deployed on Jetson Orin Nano" | FastAPI Python backend running locally | Labelled `PLANNED (Target Edge Arch)` in UI |
| **CAN Bus Interface** | "Direct CANaerospace / ARINC-429 interface" | REST API and WebSocket telemetry streaming | Labelled `PLANNED (Hardware Ingestion)` in UI |
| **PostgreSQL Database** | "TimescaleDB / PostgreSQL time-series store" | In-memory circular buffer & JSON replay stores | Labelled `PLANNED (Enterprise DB)` in UI |
| **MQTT Telemetry Broker** | "MQTT / DDS publish-subscribe telemetry" | WebSocket bi-directional streaming | Labelled `PLANNED (Broker Tier)` in UI |
| **Cylinder-Level Localization** | "Pinpoints cylinder #3 misfire/overheat" | Lumped engine CHT/EGT telemetry | Labelled `INFERRED (Lumped Telemetry - Not Sensor-Localized)` |

---

## 4. Summary of Corrections Applied in v2.0
1. Replaced legacy v1.0 dual metrics on the Evaluation Screen with singular, audited `ppt_100k_evaluation.held_out_test_metrics`.
2. Switched served runtime model in `backend/app/ml/pipeline.py` to `ppt_100k_ml_bundle.joblib` with SHA-256 hash published at `/health`.
3. Added low-latency C-level decision tree pointer traversal (`_init_fast_inference`, `_fast_predict_proba`, `_fast_decision_function`) for sub-5ms inference.
4. Added empirical 10th-90th percentile confidence bounds for RUL rather than fixed uncalibrated variance.
5. Gated RUL estimation with `NOT_ESTIMABLE` whenever the engine operates in `Normal` status or active sensor faults are flagged.
6. Aligned residual tolerance colour bands across all screens (`alert_engine.py` constants: CHT 10°C, EGT 25°C, Oil P -0.35 bar, Oil T 8°C, Vib 0.70 mm/s, FF 1.8 L/h).

---

## 5. UI/UX & Responsive Engineering Modernization
1. **Fluid Responsive Shell**: Integrated `html { font-size: clamp(10px, 0.729vw, 16px); }` and `minmax(0, 1fr)` defensive grid boundaries ensuring 100% browser zoom rendering on 1366×768 laptop displays.
2. **Auto-Collapsing Navigation & Density Toggle**: Responsive sidebar collapsing below 1400px with localStorage persistence, alongside user-selectable Comfortable vs. Compact workstation density.
3. **Live WebSocket Telemetry**: Real-time bi-directional streaming at 10 Hz (`/ws/telemetry`) with client state machine (`CONNECTING`, `LIVE`, `RECONNECTING`, `OFFLINE`) and continuous simulation loop.
4. **3D Viewport Optimization**: Three.js canvas DPR clamped to `[1, 1.5]` to avoid GPU fill-rate exhaustion; automatic frameloop pausing (`frameloop="never"`) when tab is backgrounded.
5. **Vendor Chunk Splitting**: Bundles split into `three-vendor`, `react-vendor`, and `ui-vendor`, resulting in a lean ~155 kB gzip application bundle.
6. **Zero Emoji Standard**: Clean aerospace engineering interface using exclusively Lucide SVG icons and monochrome/status-coded accents.
7. **Complete PPT Traceability Matrix**: Interactive filterable matrix embedded directly in the Documentation screen (`frontend/src/data/pptTraceability.ts`) mapping all 17 requirements and slide claims to code, API endpoints, and measured status.

