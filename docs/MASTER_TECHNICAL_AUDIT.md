# DRISHTI — Master Technical Audit (SIH26054)

**Audit Date:** 2026-10-03  
**Audit Scope:** Complete repository at `<PROJECT_ROOT>/`  
**Auditor:** Automated Evidence-First Engineering Review  

> [!CAUTION]
> This audit prioritizes honest evidence over favorable presentation. Findings that conflict with presentation targets are reported as discrepancies, not suppressed.

---

## 0. Executive Summary

| Dimension | Verdict |
|:---|:---|
| **Software Completeness** | All 15 stated requirements have working code, tests pass (10/10), frontend builds cleanly. |
| **Data Provenance** | **100% synthetic.** No real engine measurements exist in the repository. Zero external datasets are ingested. |
| **ML Model Validity** | Models are trained and evaluated exclusively on self-generated synthetic data. Reported metrics (macro-F1 = 0.977, 7/9 classes with perfect F1 = 1.0) reflect the model memorizing deterministic algebraic rules, not generalizable diagnostic capability. |
| **Physics Model Validity** | All engine equations are **invented algebraic polynomials** with no cited source. Parameter coefficients are assumed. The ISA density ratio is the only textbook equation. |
| **Hardware Connectivity** | **None.** CAN adapter is a software codec stub. No physical sensors, no real telemetry bus. |
| **Certification / Airworthiness** | **None claimed, none achievable** from this codebase. |
| **Real-Engine Validation** | **Zero.** Every "VERIFIED" status in existing docs refers to software logic verification, not physical validation. |

---

## 1. Repository Inventory

### 1.1 File Manifest (49 project files, excluding node_modules/dist/__pycache__)

| Category | Files | Total Size |
|:---|:---|:---|
| Backend Python source | 14 files | ~169 KB |
| ML artifacts | `drishti_ml_bundle.joblib` (4.2 MB), `evaluation_report.json` (7.8 KB), `drishti_twin.db` (3.7 MB) |
| Frontend TypeScript/CSS | 9 files | ~199 KB |
| Tests | 5 files | ~24 KB |
| Documentation | 5 files | ~36 KB |
| Config | `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` |

### 1.2 No External Datasets

The repository contains **zero** external data files (no `.csv`, `.parquet`, `.h5`, `.npz`, or downloaded dataset archives). All training and evaluation data are generated in-memory by [`backend/app/simulation/mission_profiles.py`](backend/app/simulation/mission_profiles.py#L116-L223).

---

## 2. Claim-by-Claim Verification

### CLAIM 1: "Leak-free ML pipeline with engine-level split"

| Field | Detail |
|:---|:---|
| **Claim Source** | [`pipeline.py` L1](backend/app/ml/pipeline.py#L1), `evaluation_report.json`, `ARCHITECTURE.md` |
| **Supporting Evidence** | Train engines use prefix `ENG-TRAIN-*`, test engines use `ENG-TEST-*` ([`mission_profiles.py` L146-148](backend/app/simulation/mission_profiles.py#L146-L148)). Overlap check at [`pipeline.py` L138-140](backend/app/ml/pipeline.py#L138-L140). Scaler fitted on `X_train` only ([L142-145](backend/app/ml/pipeline.py#L142-L145)). |
| **Verification** | `evaluation_report.json` L50: `"shared_engines_between_train_and_test": 0`. |
| **Status** | **VERIFIED** — No code-level leakage. |
| **Critical Caveat** | The engines are synthetic identifiers over identically-distributed synthetic data. The "leak-free" claim is structurally correct but **statistically meaningless**: both train and test are generated from the same deterministic simulator using the same algebraic transfer functions. The model learns the simulator's rules, not physical engine behavior. |

### CLAIM 2: "9-class fault classification with macro-F1 = 0.977"

| Field | Detail |
|:---|:---|
| **Claim Source** | `evaluation_report.json` L66-67 |
| **Supporting Code** | [`pipeline.py` L158-177](backend/app/ml/pipeline.py#L158-L177) |
| **Verification** | Metrics are computed on held-out test set. **7 out of 9 classes** report F1 = 1.000 (perfect). Only `Normal` (F1=0.951) and `Sensor Fault` (F1=0.841) show any classification error. |
| **Status** | **PARTIALLY VERIFIED** — Metrics are computed correctly from the code. |
| **Critical Caveat** | **Perfect scores on synthetic data are a red flag, not an achievement.** The classifier memorizes the deterministic additive offsets that the fault simulator applies. These results have zero predictive validity for real engines. Reporting "97.7% macro-F1" without disclaiming synthetic-only evaluation would be misleading in any engineering context. |

### CLAIM 3: "RUL estimation with MAE = 2.805 hours"

| Field | Detail |
|:---|:---|
| **Claim Source** | `evaluation_report.json` L334-340 |
| **Supporting Code** | [`pipeline.py` L230-245](backend/app/ml/pipeline.py#L230-L245) |
| **Bug Found** | `evaluation_report.json` L291 claims `"RandomForestRegressor (120 trees..."` but actual code at [`pipeline.py` L234-235](backend/app/ml/pipeline.py#L234-L235) instantiates `n_estimators=40`. **The report string is wrong.** |
| **RUL Label Generation** | Ground-truth RUL labels are fabricated linear interpolations in [`mission_profiles.py` L179-201](backend/app/simulation/mission_profiles.py#L179-L201). Normal: `92.0 - 0.05 * elapsed_sec`. Fault: linear ramp from `initial_rul` (34-48h) to `final_rul`. |
| **Status** | **PARTIALLY VERIFIED** — Code logic is correct; report string has a factual error. |
| **Critical Caveat** | The RUL targets are fabricated countdown timers, not derived from real degradation data. The model learns to interpolate these synthetic ramps. MAE of 2.8 hours on synthetic ramps does not validate RUL capability on real engines. |

### CLAIM 4: "Physics-informed reference model (Rotax914-Simplified-Ref-v1.0)"

| Field | Detail |
|:---|:---|
| **Claim Source** | [`engine_model.py`](backend/app/physics/engine_model.py), `ENGINEERING_ASSUMPTIONS.md` |
| **Equations** | CHT, EGT, oil temp, oil pressure, fuel flow, vibration — all computed via invented polynomial functions of normalized RPM and load. Example: `CHT_ss = 105.0 + 48.0 * u_load^0.85 + 24.0 * u_rpm + ...` |
| **Cited Sources** | **None.** Only the ISA density ratio formula (`sigma = (1 - 2.2558e-5 * h)^4.2559`) comes from a standard textbook (ICAO Standard Atmosphere). |
| **Rotax 914 Parameters** | Nameplate specs (1.211L, 115 HP, 5800 RPM) match the real Rotax 914. But **no performance curves, no BSFC maps, no heat rejection data, no validated thermal models** come from Rotax documentation. |
| **Status** | **UNVERIFIED** — Equations produce plausible-looking numbers but have no documented derivation from physical data. |
| **Critical Caveat** | Calling this "physics-informed" is generous. It is a **curve-fitted heuristic model** whose coefficients were chosen to produce outputs in the correct order of magnitude. The `ENGINEERING_ASSUMPTIONS.md` document is transparent about this, but the version string `Rotax914-Simplified-Ref-v1.0` implies specificity to a real engine type that the model cannot deliver. |

### CLAIM 5: "Nine synthetic fault transfer functions"

| Field | Detail |
|:---|:---|
| **Claim Source** | [`fault_simulator.py`](backend/app/simulation/fault_simulator.py), `ENGINEERING_ASSUMPTIONS.md` §3 |
| **Implementation** | Faults are injected as linear additive/multiplicative offsets parameterized by severity and time-progression. Example: Cylinder Overheating → `ΔCHT = +(22 + 38s)p`. |
| **Source of fault magnitudes** | **Invented.** No citations to failure-mode databases (FMEA), engine test-cell data, or published fault signature research. |
| **Status** | **UNVERIFIED** — Fault signatures are qualitatively reasonable (overheating raises CHT, bearing wear increases vibration) but magnitudes are arbitrary. |
| **Critical Caveat** | Real piston engine faults are nonlinear, coupled, and depend on operating history. Linear additive offsets are a first-order placeholder. |

### CLAIM 6: "Sensor fault isolation with precision = 0.844, recall = 0.633"

| Field | Detail |
|:---|:---|
| **Claim Source** | `evaluation_report.json` L326-332 |
| **Implementation** | [`sensor_fault_isolator.py`](backend/app/ml/sensor_fault_isolator.py) — entirely rule-based threshold logic (`if abs(cht_residual) > 28.0 and abs(oil_temp_residual) < 5.0`). **Not a machine learning model.** |
| **Status** | **VERIFIED** — The metrics are computed correctly on synthetic data. |
| **Critical Caveat** | This is a rule engine, not an ML isolator. Its precision/recall are artifacts of how well the hand-tuned thresholds match the synthetic fault injection parameters. |

### CLAIM 7: "Health Index formula"

| Field | Detail |
|:---|:---|
| **Claim Source** | `ENGINEERING_ASSUMPTIONS.md` §4.3, `evaluation_report.json` L341-350 |
| **Implementation** | [`pipeline.py` L320-356](backend/app/ml/pipeline.py#L320-L356) |
| **Formula** | `HI = clip(100 - (0.30*P_thermal + 0.30*P_oil + 0.25*P_vib + 0.15*P_anom), 0, 100)` |
| **Status** | **VERIFIED** — Formula is transparent and documented. |
| **Critical Caveat** | Weights (0.30, 0.30, 0.25, 0.15) are **arbitrary** — not derived from failure statistics, expert elicitation, or operational data. The HI is an engineering heuristic, not a calibrated probability of failure. The existing docs are transparent about this. |

### CLAIM 8: "CAN/SocketCAN adapter interface"

| Field | Detail |
|:---|:---|
| **Claim Source** | [`can_adapter.py`](backend/app/telemetry/can_adapter.py) |
| **Implementation** | Software struct-pack/unpack codec mapping CAN frame IDs (0x101-0x104) to telemetry fields. `get_interface_status()` hardcodes `"hardware_connected": False`. |
| **Status** | **PARTIALLY IMPLEMENTED** — Codec logic tested in loopback. No physical CAN hardware. |
| **No False Claim** | The code explicitly discloses `"SOFTWARE_CODEC_READY_NO_HARDWARE"`. |

### CLAIM 9: "Alert thresholds"

| Field | Detail |
|:---|:---|
| **Claim Source** | [`alert_engine.py`](backend/app/alerts/alert_engine.py) |
| **Implementation** | Hardcoded thresholds: `abs(cht_residual) >= 10.0°C`, `abs(egt_residual) >= 25.0°C`, `oil_pressure < 1.60 bar → CRITICAL`, `health_index < 45.0 → CRITICAL`. |
| **Source** | **Undocumented.** No reference to Rotax operator manuals, FAA/EASA airworthiness requirements, or MIL-STD maintenance thresholds. |
| **Status** | **UNVERIFIED** — Thresholds are arbitrary. |

### CLAIM 10: "Database persistence is efficient"

| Field | Detail |
|:---|:---|
| **Implementation** | [`database.py`](backend/app/db/database.py) serializes entire Pydantic models as JSON TEXT columns (not columnar time-series storage). |
| **Status** | **VERIFIED** (functionally correct) but **architecturally poor** for high-frequency time-series. Acceptable for prototype demo. |

---

## 3. Test Execution Results

### 3.1 Backend pytest

**Command:** `python -m pytest -v`  
**Executed:** 2026-10-03T02:51  
**Result:** See Section 3.3 for actual output.

### 3.2 Frontend Build

**Command:** `cd frontend && npm run build` (`tsc && vite build`)  
**Executed:** 2026-10-03T02:55  
**Result:** See Section 3.3 for actual output.

### 3.3 Recorded Output

> [!NOTE]
> **pytest output** recorded 2026-10-03 from `python -m pytest -v` (exit code 0):
> ```
> tests/test_api_and_e2e.py::test_full_end_to_end_11_step_workflow_and_api PASSED [  9%]
> tests/test_fault_simulator.py::test_fault_simulator_reproducibility_and_nine_classes PASSED [ 18%]
> tests/test_fault_simulator.py::test_sensor_fault_submodes PASSED         [ 27%]
> tests/test_ml_pipeline.py::test_ml_pipeline_training_leak_free_and_metrics PASSED [ 36%]
> tests/test_ml_pipeline.py::test_unavailable_model_artifact_fallback PASSED [ 45%]
> tests/test_physics_twin.py::test_physics_expected_relationships_and_metadata PASSED [ 54%]
> tests/test_physics_twin.py::test_physics_extrapolation_detection_and_residuals PASSED [ 63%]
> tests/test_telemetry_contract.py::test_schema_version_and_nine_classes PASSED [ 72%]
> tests/test_telemetry_contract.py::test_validator_nominal_and_missing_duplicate_stale_out_of_order PASSED [ 81%]
> tests/test_telemetry_contract.py::test_can_adapter_roundtrip_and_status PASSED [ 90%]
> tests/test_telemetry_contract.py::test_csv_telemetry_parser PASSED       [100%]
> ================== 11 passed, 1 warning in 250.03s (0:04:10) ==================
> ```
>
> **Frontend build output** recorded 2026-10-03 from `npm run build` (`tsc && vite build`), exit code 0:
> ```
> ✓ 2958 modules transformed.
> dist/index.html                     0.46 kB │ gzip:   0.33 kB
> dist/assets/index-BcbpkqKt.css      8.81 kB │ gzip:   2.31 kB
> dist/assets/index-C_AFOYA_.js   1,506.61 kB │ gzip: 409.25 kB
> ✓ built in 3m 3s
> ```

### 3.4 Test Quality Assessment

| Test File | What It Tests | Honest Assessment |
|:---|:---|:---|
| `test_telemetry_contract.py` (4 tests) | Schema version, validator flags (duplicate/stale/OOO), CAN roundtrip, CSV parser | **Trivial correctness checks.** Validates that boolean flags flip correctly on synthetic inputs. Does not test edge cases, adversarial inputs, or real-world data. |
| `test_physics_twin.py` (2 tests) | Expected-value relationships (CHT > baseline at high load), extrapolation detection | **Sanity checks only.** Tests that output increases with load (a property of the invented polynomial). Does not validate against real engine data. |
| `test_fault_simulator.py` (2 tests) | 9-class reproducibility with fixed seeds, sensor fault submode injection | **Determinism tests.** Verifies the simulator produces identical output with the same seed. Validates nothing about physical realism. |
| `test_ml_pipeline.py` (1 test) | End-to-end retrain + evaluate, checks metrics exist and are within range | **Integration test.** Verifies the pipeline runs without exceptions and produces non-zero metrics. Does not validate generalization. |
| `test_api_and_e2e.py` (1 test) | 11-step API workflow (seed fleet, simulate, predict, alert, replay, report) | **API contract test.** Verifies HTTP 200 responses and payload shapes. The "deterministic reproducibility" assertion proves only that `random_state` works. |

---

## 4. Critical Findings

### 4.1 BUG: Evaluation Report RUL Model Description Mismatch

**File:** [`pipeline.py` L291](backend/app/ml/pipeline.py#L291)  
**Issue:** The report string hardcoded `"RandomForestRegressor (120 trees, empirical 10th-90th percentile uncertainty)"` but the actual model at [L234-235](backend/app/ml/pipeline.py#L234-L235) is instantiated with `n_estimators=40`.  
**Impact:** Factual misrepresentation in the evaluation report JSON.  
**Status:** ✅ **FIXED** — Changed to `"40 trees"` in `pipeline.py` L291. Also added `data_provenance_warning` field to the evaluation report template.

### 4.2 Evaluation Report Classifier Hyperparameters Also Mismatch

**File:** `ENGINEERING_ASSUMPTIONS.md` §4.1 stated `n_estimators=180` (classifier), `n_estimators=150, contamination=0.05` (IsolationForest), `n_estimators=150` (RUL).  
**Actual Code:** Classifier uses `n_estimators=140` ([L148-149](backend/app/ml/pipeline.py#L148-L149)), IsolationForest uses `n_estimators=120, contamination=0.01` ([L181-184](backend/app/ml/pipeline.py#L181-L184)), RUL uses `n_estimators=40` ([L234-235](backend/app/ml/pipeline.py#L234-L235)).  
**Status:** ✅ **FIXED** — Updated `ENGINEERING_ASSUMPTIONS.md` §4.1 to match actual code values.

### 4.3 `scenario_label` Leakage Risk (Non-Issue in Current Code)

**Risk Identified:** `TelemetryInputFrame.scenario_label` contains the ground-truth fault class directly in the telemetry schema ([`schema.py` L123](backend/app/telemetry/schema.py#L123)).  
**Actual Assessment:** The feature extractor ([`features.py`](backend/app/ml/features.py)) extracts only residual-based features — it does **not** include `scenario_label`, `fault_severity`, or `seed` in the feature vector. The label is used only as `y_class` target ([`pipeline.py` L110](backend/app/ml/pipeline.py#L110)).  
**Status:** **No leakage through feature vector.** But the label is accessible on the schema object, which is a latent risk if future features are added carelessly.

### 4.4 Circular Evaluation Problem

The fundamental issue is not a code bug but a methodological problem:

1. **Fault simulator** generates synthetic faults using known additive offsets (e.g., `ΔCHT = +(22 + 38s)p`).
2. **Physics model** computes expected values using known polynomial equations.
3. **Residuals** (feature vector) are `actual - expected`, which directly encode the fault offset.
4. **Classifier** trivially learns to map these deterministic residual patterns to fault labels.

The classifier is essentially learning the **inverse** of the fault simulator's transfer functions. This is why 7/9 classes have F1 = 1.0. It is not evidence of diagnostic capability.

---

## 5. What Is Real vs. What Is Simulated

| Component | Real / Simulated | Evidence |
|:---|:---|:---|
| All telemetry data | **SIMULATED** | `evaluation_report.json` L43: `"is_synthetic": true` |
| Engine operating conditions | **SIMULATED** | Generated by sine-wave mission profiles in `mission_profiles.py` |
| Fault signatures | **SIMULATED** | Deterministic additive offsets in `fault_simulator.py` |
| RUL labels | **FABRICATED** | Linear countdown timers in `mission_profiles.py` L179-201 |
| Physics equations | **INVENTED** | No cited derivation source |
| Alert thresholds | **INVENTED** | No cited engineering source |
| HI weights | **INVENTED** | No cited source |
| CAN bus connectivity | **SIMULATED** | `hardware_connected: False` |
| Rotax 914 nameplate specs | **REAL** (publicly available) | Displacement, HP, RPM ratings |
| ISA atmosphere model | **REAL** (textbook) | Standard ICAO formula |

---

## 6. Unresolved Blockers to Real-Engine Validation

1. **No real piston-engine health monitoring dataset** exists in the repository or is referenced by it.
2. **No real engine test-bench measurements** have been acquired.
3. **Physics model coefficients** have no documented derivation and cannot be validated without real engine data.
4. **Fault transfer function magnitudes** are assumed and require real failure-mode data.
5. **Alert thresholds** are arbitrary and require real operational statistics or manufacturer limits.
6. **HI weights** are arbitrary and require sensitivity analysis on real degradation data.
7. **RUL model** is trained on fabricated linear countdown timers.
8. **No FMEA or maintenance record analysis** supports the 9 fault classes or their relative prevalence.

---

## 7. Existing Documentation Assessment

| Document | Accuracy |
|:---|:---|
| `README.md` | Generally accurate but omits emphasis on the synthetic-only nature of all data and metrics. |
| `ARCHITECTURE.md` | Accurate architectural description of software structure. |
| `ENGINEERING_ASSUMPTIONS.md` | **Most transparent document** — explicitly discloses simplified models, synthetic data, and validation gaps. Contains hyperparameter values that contradict the actual code (§4.1). |
| `PROJECT_AUDIT.md` | Uses "VERIFIED" status extensively, which is misleading — it means "software runs without errors", not "validated against physical evidence." |
| `REQUIREMENTS_TRACEABILITY.md` | Well-structured but the "VERIFIED" column conflates software functionality with engineering validity. |
| `VERIFICATION_AND_ROADMAP.md` | Lists roadmap items but does not track which gaps are critical vs. nice-to-have. |
