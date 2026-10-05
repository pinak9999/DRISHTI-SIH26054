# DRISHTI Architecture & Implementation Decisions Log

This document records key architectural, modeling, and user experience decisions taken during the DRISHTI system modernization (SIH 2026).

---

## 1. Model Parity & Serving Strategy (Part 1)
- **Decision**: Serve `backend/artifacts/ppt_100k_ml_bundle.joblib` as the primary live inference engine in `backend/app/ml/pipeline.py`.
- **Rationale**: The 100k dataset model trained with strict 50-engine separation (35 train / 8 val / 7 test) reflects the true technical capability stated in the SIH presentation. Serving the smaller legacy ~1.3k v1.0 model caused discrepancy between the evaluation screens and live inference.
- **Fallback**: Maintain graceful fallback to legacy bundle if the 100k bundle is ever absent, but flag version and hash explicitly.
- **Hash Integrity**: Expose the SHA-256 hash of `ppt_100k_ml_bundle.joblib` at `/health` as `model_bundle_sha256` and `/api/model-status` as `bundle_sha256`.
- **RUL Gating**: When an engine is in `Normal` status or RUL is non-positive or sensor faults are present, set `rul_status = "NOT_ESTIMABLE"` to prevent unrealistic degradation predictions on nominal engines.

---

## 2. Evaluation Data Unification (Part 2)
- **Decision**: The Evaluation screen displays exclusively `held_out_test_metrics` from the 100k dataset (`DRISHTI-SynthCorpus-100k-v2.0`), retiring contradictory v1.0 metrics.
- **Rationale**: Presenting dual conflicting accuracy numbers (e.g. 96.2% vs 98.2%) created user confusion. The 100k held-out test split (7 unseen engines, 15,000 samples) represents the rigorous evaluation baseline.
- **Transparency**: Include full data provenance disclosure (`is_synthetic: true`) and comparison table showing PPT claims vs. measured numbers.

---

## 3. Responsive Shell & 100% Zoom Typography (Part 3)
- **Decision**: Adopt fluid root scaling via `html { font-size: clamp(10px, 0.729vw, 16px); }` and responsive shell collapsible bars.
- **Rationale**: On typical 1366x768 screens at 100% browser zoom, fixed 14px typography and inflexible flex rows caused horizontal overflow and header button clipping. Fluid rem root scaling automatically scales 1366px screens to ~10px equivalent, preserving pixel-perfect alignment without zooming out.
- **Density Toggle**: Provide Comfortable vs. Compact density toggle in topbar with localStorage persistence.

---

## 4. Live Streaming & Continuous Simulation Flow (Part 4)
- **Decision**: Implement an auto-advancing rolling simulation background runner across all 6 fleet engines (`ENG-MALE-01` .. `ENG-MALE-06`) coupled with a resilient WebSocket connection state machine (`CONNECTING`, `LIVE`, `RECONNECTING`, `OFFLINE`).
- **Rationale**: Demonstrations require real-time dynamic needle movement, streaming sparklines, and active health index updates without manual page refreshes or manual trigger buttons.

---

## 5. Viewport & Rendering Performance (Part 5)
- **Decision**: Clamp 3D canvas device pixel ratio (`DPR <= 1.5`), pause Three.js render loop when document is hidden (`visibilitychange`), and implement route-based code splitting with Vite `manualChunks`.
- **Rationale**: High-DPI screens (Retina, 4K laptops) experience severe GPU throttling when rendering Three.js post-processing at 2.0x+ DPR. Clamping DPR maintains crisp rendering while capping fragment shader invocations. Initial bundle size target < 500 kB gzip.

---

## 6. PPT Parity & Honest Claims (Part 6)
- **Decision**: Create dedicated PPT Requirement Traceability module (`frontend/src/data/pptTraceability.ts`) visible in Docs screen, and maintain `docs/PPT_FIX_LIST.md`.
- **Rationale**: Never silently paper over differences between presentation slides and software reality. Factual differences (e.g. measured XGBoost MAE vs. estimated slide number) are openly documented with exact measurements.
