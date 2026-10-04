# DRISHTI — Model Validation Plan (SIH26054)

**Date:** 2026-10-03  
**Purpose:** Define a reproducible, evidence-based validation protocol for every ML model and engineering heuristic in the DRISHTI system.

> [!IMPORTANT]
> This plan distinguishes between **synthetic-data software verification** (what we can do now) and **real-data engineering validation** (what requires external datasets or test-bench access). Do not conflate the two.

---

## 1. Current Model Inventory

| Model | Type | Implementation | Training Data | Current Evaluation | Status |
|:---|:---|:---|:---|:---|:---|
| 9-Class Fault Classifier | `RandomForestClassifier(n_estimators=140, max_depth=14)` | [`pipeline.py` L148-156](backend/app/ml/pipeline.py#L148-L156) | DRISHTI-SynthCorpus-v1.0 (1,296 train samples, 36 synthetic engines) | Macro-F1 = 0.977 on synthetic test set | **Synthetic-only evaluation** |
| Anomaly Detector | `IsolationForest(n_estimators=120, contamination=0.01)` | [`pipeline.py` L181-187](backend/app/ml/pipeline.py#L181-L187) | Normal-class training samples only | Recall = 0.888, FAR = 0.012, Precision = 0.995 | **Synthetic-only evaluation** |
| RUL Regressor | `RandomForestRegressor(n_estimators=40, max_depth=12)` | [`pipeline.py` L234-241](backend/app/ml/pipeline.py#L234-L241) | Fault trajectories with fabricated linear RUL labels | MAE = 2.805h, RMSE = 4.193h | **Synthetic-only evaluation** |
| Sensor Fault Isolator | Rule-based threshold logic | [`sensor_fault_isolator.py`](backend/app/ml/sensor_fault_isolator.py) | N/A (hand-coded rules) | Precision = 0.844, Recall = 0.633 | **Synthetic-only evaluation** |
| Health Index (HI) | Weighted algebraic formula | [`pipeline.py` L320-356](backend/app/ml/pipeline.py#L320-L356) | N/A (engineering heuristic) | Outputs 0–100 range | **No sensitivity analysis performed** |

---

## 2. Validation Levels

| Level | Description | Evidence Required | Current Status |
|:---|:---|:---|:---|
| **V0: Code Runs** | Software executes without errors | `pytest` passes | ✅ Achieved |
| **V1: Synthetic Verification** | Correct metrics on self-generated data | Evaluation report with per-class metrics | ✅ Achieved (but see caveats) |
| **V2: Cross-Dataset Validation** | Metrics on independent external dataset | Evaluation on LiU-ICE, Marine Engine, or C-MAPSS | ❌ Not started |
| **V3: Domain Transfer Test** | Metrics on real piston-engine telemetry | Evaluation on real engine test-bench data | ❌ Not possible without data |
| **V4: Operational Validation** | Confirmed diagnostic accuracy on live engines | Field trial with ground-truth maintenance records | ❌ Not possible without hardware |

---

## 3. Validation Protocol for Each Model

### 3.1 Fault Classifier

**Current State:** Trained on synthetic data, evaluated on synthetic data. 7/9 classes have F1 = 1.0.

**Required Validation Steps:**

1. **Immediate Fix (V1):**
   - Fix RUL model description string mismatch ([`pipeline.py` L291](backend/app/ml/pipeline.py#L291): change "120 trees" to "40 trees").
   - Sync `ENGINEERING_ASSUMPTIONS.md` §4.1 hyperparameters with actual code values.
   - Add a `data_provenance` field to the evaluation report explicitly stating all metrics are from synthetic data.
   - Run 5-fold group-aware cross-validation on synthetic data to check variance.

2. **V2 Validation (when datasets available):**
   - Ingest LiU-ICE sensor fault data → evaluate Sensor Fault class P/R/F1.
   - Ingest Marine Engine injection/turbo faults → evaluate Fuel Injector Clogging and related classes.
   - Report per-class metrics separately for synthetic vs. real data. **Do not blend them.**
   - Use C-MAPSS degradation data to test whether the classifier can distinguish degradation regimes (methodology test only — turbofan, not piston).

3. **V3 Validation (when real piston data available):**
   - Train on real engine data with labeled maintenance events.
   - Evaluate on held-out engines (not time-splits within the same engine).
   - Report confidence intervals or bootstrap standard errors.
   - If real data are too scarce for all 9 classes, report which classes have insufficient evidence.

**Baseline Comparison Required:**
- Before reporting RF accuracy, compare against: (a) a constant classifier (always predicts majority class), (b) a logistic regression, (c) a decision stump. If RF does not meaningfully outperform simple baselines on synthetic data, the complexity is unjustified.

### 3.2 Anomaly Detector

**Required Validation Steps:**

1. **V1 Improvement:**
   - Report detection delay (how many samples after fault onset before detection triggers).
   - Report per-fault-class detection rate (does it detect bearing wear as well as overheating?).
   - Document the threshold calibration method (`np.percentile(train_norm_scores, 96.0)`) and its sensitivity.

2. **V2 Validation:**
   - Evaluate on real sensor fault data (LiU-ICE) to test false alarm rate on real nominal data.
   - Real nominal data has far more variability than synthetic — expect FAR to increase.

### 3.3 RUL Regressor

**Required Validation Steps:**

1. **V1 Improvement:**
   - Document the fabricated RUL label definition explicitly in the evaluation report.
   - Report prediction interval coverage: what fraction of test samples have true RUL within the 10th–90th percentile interval?
   - Add a dummy baseline: constant prediction of mean training RUL. If RF does not beat this, the model is not learning degradation.

2. **V2 Methodology Validation:**
   - Download C-MAPSS FD001 dataset.
   - Train/evaluate the same RF architecture on C-MAPSS run-to-failure data.
   - Report C-MAPSS MAE/RMSE alongside synthetic MAE/RMSE.
   - This tests whether the RUL architecture generalizes — but explicitly note C-MAPSS is turbofan.

3. **V3 Validation:**
   - Requires real piston engine run-to-failure or maintenance-interval data.
   - Until available, report RUL as **"demonstrator capability, not validated"**.

### 3.4 Health Index

**Required Validation Steps:**

1. **Sensitivity Analysis:**
   - Sweep each weight (thermal, oil, vibration, anomaly) ±50% and report HI distribution changes.
   - Document which single-component failure drives HI to critical fastest.
   - If HI is insensitive to important fault classes, the weights need adjustment.

2. **Consistency Check:**
   - Verify HI = 100 under all nominal conditions across all mission profiles.
   - Verify HI < 50 for all critical fault scenarios at severity ≥ 0.8.
   - Document any edge cases where HI behavior is counterintuitive.

---

## 4. Reproducibility Requirements

Every evaluation must record:

1. **Exact command** to reproduce the result.
2. **Git commit hash** or artifact version at the time of evaluation.
3. **Random seed** used for data generation and model training.
4. **SHA-256 hash** of the model artifact file.
5. **Environment** (Python version, scikit-learn version, OS).
6. **Raw metric values** (not rounded to look better).

**Current Reproducibility Command:**
```powershell
# From repository root (<PROJECT_ROOT>/):
python -m pytest tests/test_ml_pipeline.py -v
# This retrains from scratch and validates metrics.
```

---

## 5. What We Will NOT Claim

- We will not claim that synthetic F1 = 0.977 generalizes to real engines.
- We will not claim RUL MAE = 2.8h is achievable on real degradation data.
- We will not claim the HI formula is calibrated to real failure probability.
- We will not substitute turbofan or bearing results as piston-engine validation.
- We will not claim flight readiness or certification without V3/V4 evidence.
