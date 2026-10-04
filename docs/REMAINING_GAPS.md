# DRISHTI (SIH26054) — Remaining Gaps, Unverified Claims & Engineering Limitations

- **Audit Date:** 2026-10-03 / 2026-10-04
- **Purpose:** Transparent, evidence-driven register of every PPT claim or SIH26054 domain aspiration that is either a **numerical mismatch against empirical model evaluation**, **partially implemented**, **not implemented in the software stack**, or **not verifiable without physical UAV hardware and field MRO records**.

---

## 1. Empirical Model Metric Differences vs. PPT Table Values (`MISMATCH` — Honest Measured vs. PPT Reported)

Per Phase 2, Phase 4, and Phase 7 rules (*"Do not fabricate metrics, increase scores artificially, or hardcode a target value into a dashboard"*), the models were trained and evaluated honestly on the engine-disjoint held-out test splits. The measured values differ from the static numbers printed on PPT Slide 3/4 as follows:

| Metric | PPT Table Value | Measured 100k Held-Out Test (`15,000` rows, `7` engines) | Measured 54-Traj Live-Twin Test (`1,095` rows, `18` trajectories) | Measured Real-Data Benchmark (`LiU-ICE` / `Marine`) | Root Cause of Difference |
|---|---:|---:|---:|---:|---|
| **9-Class Random Forest Macro-F1** | `0.92` | **`0.9853`** (`Val: 0.9871`) | **`0.8950`** | `0.5877` (`LiU-ICE`) / `0.5564` (`Marine`) | The 100k synthetic generator uses deterministic physics transfer functions with step-plus-ramp fault offsets, yielding higher separability (`0.9853`) than the PPT target (`0.92`), while the 54-trajectory dataset has longer pre-onset normal prefixes (`0.8950`). |
| **Isolation Forest Anomaly Recall** | `0.94` | **`0.9180`** (`Val: 0.9262`) | **`0.8781`** | `0.4090` (`LiU-ICE`) / `0.8732` (`Marine`) | At the validation-calibrated 97th-percentile threshold (`Test FAR = 0.0255`), mild incipient fault frames right after onset fall inside the normal residual envelope, yielding `91.80%` recall rather than `94.0%`. |
| **XGBoost RUL MAE (`cycles`)** | `18.6 cycles` | **`8.785 cycles`** (`7.616 hrs`) | **`2.800 hours`** (`XGBoost`) | N/A (classification benchmarks) | On synthetic degradation trajectories governed by smooth Saxena et al. (2008) power-law curves, `XGBRegressor` achieves `8.785 cycles` MAE (`11.758 cycles` RMSE), lower error than the PPT's `18.6 cycles` MAE (`27.4` RMSE). |
| **Sensor Fault Detection F1 & Model Label** | `0.91` (`Isolation Forest`) | **`1.0000`** (`SensorFaultIsolator + RF`) | **`0.9600`** (`Precision: 1.00, Recall: 0.9231`) | N/A | PPT table labels the model `Isolation Forest` with `F1 = 0.91`, whereas PPT text and code use the dedicated `SensorFaultIsolator` (cross-channel residual parity + signal quality) combined with the RF `Sensor Fault` class (`F1 = 1.0000` on 100k, `0.9600` on 54-traj). |
| **9×9 Normalized Confusion Matrix Cells** | Diagonal `0.90–0.94` | Diagonal **`0.9588–1.0000`** | Diagonal **`0.7846–0.9846`** | Saved in `phase4_reliability_report.json` | Several rows in the PPT confusion matrix sum to `1.01` or `1.02` due to manual 2-decimal rounding in the slide deck; the code computes exact row-normalized confusion matrices from actual held-out test predictions. |
| **PPT Slide 2 Fault Detection Lead Time vs. RUL MAE** | `18.6 cycles / 18.6 flight hours` | RUL MAE = `8.785 cycles` (`7.616 hrs`); simulated fault window = `38–54 hrs` | RUL MAE = `2.80 hrs` | N/A | PPT Slide 2 reused the `18.6 cycles` RUL MAE number as "Fault detection lead time" and equated `18.6 cycles = 18.6 flight hours`, whereas in the code `cycles = hours × kappa` ($\kappa \in [0.75, 1.45]$). |

---

## 2. Unimplemented Secondary Tech-Stack Claims Across PPT Variants (`NOT IMPLEMENTED`)

While the core application stack (**Python 3.11 + FastAPI + scikit-learn + XGBoost + NumPy/Pandas/SciPy + SQLite + React 18 + TypeScript + Three.js + Recharts + WebSockets + Simulated SocketCAN**) is fully implemented and verified, the two PPT families in `<LOCAL_PYTHON_ENV>` mention several secondary technologies that are **not** implemented in the repository:

1. **MQTT Broker / Client (`Team_Drishti_SIH26054.pptx` Slide 3 & Slide 4):**
   - **Status:** `NOT IMPLEMENTED`. Live telemetry streaming uses FastAPI WebSockets (`WS /ws/telemetry`) and HTTP REST (`POST /api/predict`), not an MQTT broker (`mosquitto` / `paho-mqtt`).
2. **Alternative Stack Mentions in `Drishti-DT_SIH26054 (1) (1).pptx` Slide 3 & Slide 4 (`Node.js / Express`, `PyTorch`, `PostgreSQL`, `Socket.IO`, `Tailwind CSS`, `Docker`, `TLS/SSL`, `Federated Learning`):**
   - **Status:** `NOT IMPLEMENTED`.
   - The backend is pure Python **FastAPI** (not Node.js/Express), persistence is **SQLite** (not PostgreSQL), ML models use **scikit-learn + XGBoost** (not PyTorch or Federated Learning), styling uses custom aerospace CSS in [`styles.css`](frontend/src/styles.css) (not Tailwind), streaming uses native **WebSockets** (not Socket.IO), and no `Dockerfile` or TLS certificate termination is bundled.

---

## 3. Partially Verified Capabilities & Operational Caveats (`PARTIALLY VERIFIED`)

1. **10 Hz Telemetry Cadence (`PPT-S2-NUM-07`):**
   - **Verified:** [`DeterministicFaultSimulator`](backend/app/simulation/fault_simulator.py), [`TelemetryValidator`](backend/app/telemetry/validator.py), `POST /api/simulations`, and `HistoricalReplayController` support `sample_interval_sec = 0.1s` (**10 Hz**) with millisecond ISO-8601 timestamps (`YYYY-MM-DDTHH:MM:SS.mmmZ`) and sustain `> 10 Hz` end-to-end processing throughput (`~25–40 ms/frame` including SQLite writes, `< 3 ms/frame` pure ML+physics inference).
   - **Limitation:** The default seeded fleet missions (`ENG-MALE-01`..`06`) and the 100k training dataset use `dt = 1.0s` (`1 Hz`), and the demo WebSocket push loop in [`backend/app/main.py`](backend/app/main.py#L378) sleeps `1.0s` between frames by default.
2. **High-Altitude Envelope up to 30,000 ft (`PPT-S2-NUM-02`):**
   - **Verified:** [`AeroPistonReferenceModel`](backend/app/physics/engine_model.py#L16-L30) computes ISA density ratio $\sigma_{\text{alt}}$ up to `9,500 m` (`31,168 ft`).
   - **Limitation:** `SUPPORTED_ENVELOPE["altitude_m"]` is `[-100.0, 7000.0] m` (`-328` to `22,965 ft`). Altitudes between `7,000 m` (`22,965 ft`) and `9,144 m` (`30,000 ft`) are processed normally by the equations but set `is_extrapolated = True` in `ExpectedValues`.
3. **NASA C-MAPSS Reference (`PPT-S1-REF-01` / `PPT-S3-DATA-02`):**
   - **Verified:** Saxena et al. (PHM 2008) nonlinear damage propagation $D(t)$ and cycle-based RUL formulation are implemented in [`ppt_100k_pipeline.py`](backend/app/ml/ppt_100k_pipeline.py#L328-L353).
   - **Limitation:** Raw NASA C-MAPSS turbofan files (`FD001..FD004`) are not present in the repository, and C-MAPSS represents Brayton-cycle turbofan gas-path degradation rather than 4-stroke reciprocating aero-piston engines.

---

## 4. Claims Not Verifiable Without Physical Hardware or Field Trials (`NOT VERIFIABLE`)

1. **Projected Fleet MRO Impact Figures (`40% fewer unplanned groundings`, `25% lower maintenance cost`, `+15% engine life`):**
   - Explicitly labeled in the presentation as projected simulation targets; cannot be verified without multi-year MALE UAV operational maintenance logs.
2. **Live Aircraft ECU / FADEC / Physical SocketCAN Bus Integration & Jetson Nano Field Deployment:**
   - [`SimulatedRotaxCANAdapter`](backend/app/telemetry/can_adapter.py) implements a deterministic 8-byte CAN 2.0B frame encoder/decoder (`0x18FF1001`, `0x18FF1101`, `0x18FF1201`), but `hardware_connected` is `False` (no physical UAV engine or CAN transceiver attached).
3. **External QR / URL Links on PPT Slide 1 (`https://github.com/drishti-uav-digital-twin`, `https://youtu.be/Drishti-UAV-Demo`, `https://drishti-uav-dashboard.vercel.app`):**
   - Placeholder URLs on the slide template; the authoritative working application is this local repository.
