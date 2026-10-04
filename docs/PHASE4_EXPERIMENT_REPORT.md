# DRISHTI Phase 4 — Diagnostic Reliability, Failure Reduction & Independent Verification Report

**Report ID**: `DRISHTI-PHASE4-RELIABILITY-REPORT-001`  
**Generated Artifact**: [`backend/artifacts/phase4_experiment_report.json`](backend/artifacts/phase4_experiment_report.json)  
**Source Implementation**: [`backend/app/ml/phase4_reliability.py`](backend/app/ml/phase4_reliability.py)  
**Companion Audit**: [`docs/PHASE4_RELIABILITY_AUDIT.md`](docs/PHASE4_RELIABILITY_AUDIT.md)  
**Test Suite**: [`tests/test_phase4_reliability.py`](tests/test_phase4_reliability.py)

---

## 1. Executive Summary & Integrity Guarantees

Phase 4 audited and remediated the three primary diagnostic reliability failure modes identified in Phase 3 across our two real experimental engine datasets (`LiU-ICE-Benchmark-DXC25` and `Marine-Engine-Fault-v1.0`):

1. **Zero Data or Label Leakage**:
   - Immutable raw dataset archives (`data/raw/liu_ice/dxc25liu-ice-main.zip` and `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip`), Phase 2/3 artifacts, and the production synthetic bundle (`drishti_ml_bundle.joblib`) remain completely untouched.
   - Zero physical runs (`run_id` or `source_file`) are shared between training and locked test partitions.
   - All expected-response surfaces, robust residual scales, anomaly thresholds, and persistence/hysteresis rules are calibrated strictly on training and held-out training-normal validation runs (`fit_norm_df` and `val_norm_df`).
2. **Summary of Key Empirical Outcomes**:
   - **Phase 3 Independent Reproduction**: **22 of 24** supervised model evaluations across both datasets (`12/12` on `LiU-ICE`, `10/12` on `Marine Engine`) reproduced to 4 decimal places; **2 of 24** on `Marine Engine` differed by $\Delta \text{Macro-F1} \in \{-0.0002, -0.0014\}$ due to single-pass cumulative-sum rolling variance ($\sim 10^{-14}$ floating-point precision) and non-converged `lbfgs` at `max_iter=500`.
   - **Failure Mode A (`Marine-Engine-Fault-v1.0` Unsupervised & Supervised False Alarms)**:
     - Phase 3 normal false-alarm rates (FAR) of **`57.01%`** (`IsolationForest q95`) and **`47.83%`** (`RMS Residual q95`) — which reached **`70.11%–77.24%` normal FAR at unseen `85%` load** (`100.0%` on 3 of 4 `85%` load runs) — were traced to degree-2 boundary-temperature polynomial extrapolation, `Reference_Data.csv` MAD scale collapse, and in-sample validation calibration omitting `75%` load training runs.
     - Restricting degree-2 polynomials to the 4 mechanical load/speed inputs, introducing run-balanced between-run-aware residual scaling, and calibrating strictly out-of-sample on held-out `75%` and `60%` load training normal runs (`AC_Fouling_75_Load`, `Turbine_Degradation_60_Load`) reduced unsupervised `IsolationForest (q95)` normal FAR from **`57.01%` to `1.75%`** (`0.07%` at `q99`) and `RMS Smoothed Residual (q95)` normal FAR from **`47.83%` to `0.00%`**, at the cost of lower unsupervised recall (`24.01%–24.71%`, `3/7` missed fault runs).
     - Using out-of-sample validation-calibrated supervised fault probability (`Phase4_Supervised_LR_FaultProbability`) with **Schmitt-trigger hysteresis (`T_on = q99, T_off = q95, k_on = 3`)** achieved **`0.00%` normal FAR across all 7 test runs (`0.00%` at `60%` load and `0.00%` at `85%` load)** while maintaining **`50.37%` sample-level fault recall, `0.6699` Anomaly F1, `0.7518` balanced accuracy, and `0 / 7` missed fault runs** (compared to `0.6385` balanced accuracy and `47.83%` normal FAR in Phase 3).
   - **Failure Mode B (`LiU-ICE-Benchmark-DXC25` Opposite-Sign Sensor Fault `wltp_f_pic_110`)**:
     - Phase 3 achieved **`0.0000` recall** on `f_pic` (`+10%` intercooler pressure sensor gain in test `wltp_f_pic_110` vs. `-10%` gain in train `wltp_f_pic_090`), misclassifying **`95.66%`** (`6,453 / 6,746` fault samples) as `f_pim`.
     - Root-cause analysis proved that feeding faulted $p_{ic}$ (`+10%`) into the coupled leave-one-out parity predictor $\hat{p}_{im}(p_{ic}, \dots)$ created a **phantom $-6.519\sigma$ negative residual on $p_{im}$**, while signed features suppressed positive $p_{ic}$ deviations.
     - Replacing signed coupled features with **`phase4_structured_unsigned_residual`** (unsigned decoupled actuator-to-sensor control-map residuals $|z_j|$, channel dominance ratios, and pressure-gated speed-density air-mass-flow parity) improved **`f_pic` recall from `0.0000` to `0.9950` (`LogisticRegression_Balanced`, `F1 = 0.9918`) and `0.9976` (`RandomForest_Balanced`, `F1 = 0.9976`)**, raising overall 4-class **Macro-F1 from `0.2594` (`0.2707` Phase 3) to `0.5874` (`+0.3167`)** and **Balanced Accuracy from `0.4238` to `0.6903` (`+26.65%`)**, while cutting pooled **Normal FAR to `0.90%` (`0.0090`)**.
   - **Failure Mode C (Autocorrelation-Aware Confidence Intervals)**:
     - Contiguous within-run moving-block bootstrap (`block_size = 60` samples) produces 95% confidence intervals that are **`5.20x` to `7.73x` wider** than i.i.d. row-level multinomial bootstrap CIs, confirming that row-level CIs severely overstate certainty on autocorrelated engine time series.

---

## 2. Failure Mode A — Marine Engine False-Alarm Reduction (`Marine-Engine-Fault-v1.0`)

### 2.1 Validation-Calibrated Threshold Trade-Off Table (Out-of-Sample `val_norm_df`)
All Phase 4 thresholds were selected strictly on the held-out training normal runs `val_norm_df = {AC_Fouling_75_Load, Turbine_Degradation_60_Load}` (`5,349` normal samples, disjoint from both `fit_norm_df` and `test_df`).

| Detector | Validation Quantile | Calibrated Threshold | Pooled Normal FAR | `60%` Load Normal FAR | `85%` Load Normal FAR | Pooled Fault Recall | Anomaly F1 | Balanced Accuracy | Missed Fault Runs (`/7`) | Mean Detection Delay (s) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Phase 3 `IsolationForest (Residual)`** *(Baseline)* | `q95` | `-0.0243` | `57.01%` | `14.11%` | `79.17%` | `72.89%` | `0.7850` | `0.5794` | `0 / 7` | `94.0` |
| **Phase 3 `IsolationForest (Residual)`** *(Baseline)* | `q99` | `0.0000` | `49.94%` | `2.89%` | `74.24%` | `66.15%` | `0.7510` | `0.5811` | `0 / 7` | `332.3` |
| **Phase 3 `RMS Normalized Residual`** *(Baseline)* | `q95` | `1.9781` | `47.83%` | `4.70%` | `70.11%` | `75.54%` | `0.7794` | `0.6385` | `0 / 7` | `104.6` |
| **Phase 3 `RMS Normalized Residual`** *(Baseline)* | `q99` | `3.7132` | `22.68%` | `0.00%` | `34.39%` | `57.17%` | `0.6894` | `0.6725` | `1 / 7` | `1802.2` |
| **Phase 4 `RMS Instantaneous Residual`** | `q90` | `4.0177` | `0.54%` | `0.00%` | `0.82%` | `26.17%` | `0.4142` | `0.6282` | `1 / 7` | `3215.2` |
| **Phase 4 `RMS Instantaneous Residual`** | `q95` | `4.1986` | `0.38%` | `0.00%` | `0.57%` | `25.00%` | `0.3995` | `0.6231` | `2 / 7` | `3481.2` |
| **Phase 4 `RMS Instantaneous Residual`** | `q99` | `4.4740` | `0.25%` | `0.00%` | `0.39%` | `23.72%` | `0.3831` | `0.6173` | `2 / 7` | `3930.4` |
| **Phase 4 `RMS Causal Smoothed Residual`** | `q90` | `3.7710` | **`0.00%`** | **`0.00%`** | **`0.00%`** | `25.82%` | `0.4105` | `0.6291` | `3 / 7` | `3762.0` |
| **Phase 4 `RMS Causal Smoothed Residual`** | `q95` | `4.1713` | **`0.00%`** | **`0.00%`** | **`0.00%`** | `24.71%` | `0.3963` | `0.6235` | `3 / 7` | `3846.8` |
| **Phase 4 `RMS Causal Smoothed Residual`** | `q99` | `4.4283` | **`0.00%`** | **`0.00%`** | **`0.00%`** | `23.82%` | `0.3847` | `0.6191` | `3 / 7` | `4054.8` |
| **Phase 4 `IsolationForest (Run-Balanced)`** | `q90` | `0.0584` | `3.09%` | `0.00%` | `4.69%` | `27.53%` | `0.4277` | `0.6222` | `3 / 7` | `2203.3` |
| **Phase 4 `IsolationForest (Run-Balanced)`** | `q95` | `0.0693` | `1.75%` | `0.00%` | `2.65%` | `24.01%` | `0.3852` | `0.6113` | `3 / 7` | `2926.8` |
| **Phase 4 `IsolationForest (Run-Balanced)`** | `q99` | `0.0912` | `0.07%` | `0.00%` | `0.10%` | `21.02%` | `0.3473` | `0.6048` | `5 / 7` | `3198.0` |
| **Phase 4 `Supervised LR Fault Prob`** | `q90` | `0.9969` | `9.26%` | `25.55%` | **`0.85%`** | **`66.74%`** | **`0.7839`** | **`0.7874`** | **`0 / 7`** | `1729.4` |
| **Phase 4 `Supervised LR Fault Prob`** | `q95` | `0.9993` | `7.13%` | `20.71%` | **`0.11%`** | **`62.75%`** | **`0.7584`** | **`0.7781`** | **`0 / 7`** | `1965.9` |
| **Phase 4 `Supervised LR Fault Prob`** | `q97.5` | `1.0000` | **`2.29%`** | `6.72%` | **`0.00%`** | **`55.11%`** | **`0.7066`** | **`0.7641`** | **`0 / 7`** | `2062.1` |
| **Phase 4 `Supervised LR Fault Prob`** | `q99` | `1.0000` | **`0.00%`** | **`0.00%`** | **`0.00%`** | `37.32%` | `0.5435` | `0.6866` | **`0 / 7`** | `2832.4` |

### 2.2 Temporal Persistence (`consecutive_k`) & Schmitt-Trigger Hysteresis Trade-Offs
Evaluating causal consecutive-sample confirmation ($k \in \{1, 3, 5, 10\}$ samples at `0.5 Hz`, corresponding to `0 s, 4 s, 8 s, 18 s` persistence) and dual-threshold Schmitt-trigger hysteresis (`T_on = q99, T_off = q95, k_on = 3`) on `Phase4_Supervised_LR_FaultProbability`:

| Persistence / Hysteresis Rule | Pooled Normal FAR | `60%` Load Normal FAR | `85%` Load Normal FAR | Pooled Fault Recall | Anomaly F1 | Balanced Accuracy | Missed Fault Runs (`/7`) | Mean Detection Delay (s) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `q95` + `consecutive_k = 1` (Instantaneous) | `7.13%` | `20.71%` | `0.11%` | `62.75%` | `0.7584` | `0.7781` | `0 / 7` | `1965.9` |
| `q95` + `consecutive_k = 3` (`4 s` persistence) | `6.57%` | `19.29%` | `0.00%` | `61.40%` | `0.7495` | `0.7742` | `0 / 7` | `1971.9` |
| `q95` + `consecutive_k = 5` (`8 s` persistence) | `6.07%` | `17.82%` | `0.00%` | `60.25%` | `0.7418` | `0.7709` | `0 / 7` | `1978.3` |
| `q95` + `consecutive_k = 10` (`18 s` persistence) | `5.28%` | `15.51%` | `0.00%` | `57.97%` | `0.7259` | `0.7634` | `0 / 7` | `2014.4` |
| `q99` + `consecutive_k = 1` (Instantaneous) | **`0.00%`** | **`0.00%`** | **`0.00%`** | `37.32%` | `0.5435` | `0.6866` | `0 / 7` | `2832.4` |
| `q99` + `consecutive_k = 3` (`4 s` persistence) | **`0.00%`** | **`0.00%`** | **`0.00%`** | `35.87%` | `0.5280` | `0.6793` | `0 / 7` | `2840.7` |
| `q99` + `consecutive_k = 10` (`18 s` persistence) | **`0.00%`** | **`0.00%`** | **`0.00%`** | `33.23%` | `0.4988` | `0.6661` | `0 / 7` | `3140.9` |
| **Schmitt-Trigger Hysteresis (`T_on=q99, T_off=q95, k_on=3`)** | **`0.00%`** | **`0.00%`** | **`0.00%`** | **`50.37%`** | **`0.6699`** | **`0.7518`** | **`0 / 7`** | `2949.6` |

### 2.3 Per-Run False-Alarm & Recall Breakdown Across All 7 Locked Test Runs
Comparing Phase 3 `RMS Normalized Residual (q95)` against Phase 4 `RMS Causal Smoothed (q95)` and Phase 4 `Supervised LR + Hysteresis(T_on=q99, T_off=q95, k_on=3)`:

| Physical Test Run | Load Regime | Normal / Fault Rows | Phase 3 RMS `q95` Normal FAR | Phase 3 RMS `q95` Fault Recall | Phase 4 Unsupervised RMS `q95` Normal FAR | Phase 4 Unsupervised RMS `q95` Fault Recall | Phase 4 Hysteresis (`q99/q95, k=3`) Normal FAR | Phase 4 Hysteresis (`q99/q95, k=3`) Fault Recall | Hysteresis Detection Delay (s) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `AC_Fouling_60_Load` | `60%` | `2,057 / 4,641` | `1.41%` | `67.08%` | **`0.00%`** | `9.33%` | **`0.00%`** | `41.93%` | `4182.0` |
| `AF_Clogging_60_Load` | `60%` | `2,095 / 4,724` | `7.92%` | `0.25%` | **`0.00%`** | `0.00%` | **`0.00%`** | **`98.90%`** | `84.0` |
| `AC_Fouling_85_Load` | `85%` | `1,091 / 4,710` | **`100.00%`** | `100.00%` | **`0.00%`** | `8.45%` | **`0.00%`** | `9.30%` | `5580.0` |
| `AF_Clogging_85_Load` | `85%` | `2,728 / 3,670` | **`100.00%`** | `100.00%` | **`0.00%`** | `0.00%` | **`0.00%`** | **`38.58%`** | `3492.0` |
| `CW_Pump_Cavitation_85_Load` | `85%` | `1,554 / 4,709` | **`100.00%`** | `100.00%` | **`0.00%`** | `0.00%` | **`0.00%`** | **`19.35%`** | `4985.0` |
| `Turbine_Degradation_85_Load` | `85%` | `2,664 / 2,625` | `9.83%` | `40.72%` | **`0.00%`** | `9.64%` | **`0.00%`** | **`41.52%`** | `2320.0` |
| `Clogged_Injector_Nozzle2_LoadProgram` | `40/60/85%` | `0 / 6,791` | `N/A` | `100.00%` | `N/A` | **`100.00%`** | `N/A` | **`82.15%`** | `4.0` |

> **Honest Trade-Off Analysis**: Phase 3's apparent `75.54%` unsupervised fault recall on `Marine-Engine-Fault-v1.0` was an artifact of **continuous false-alarm saturation (`100.00%` normal FAR)** on `AC_Fouling_85_Load`, `AF_Clogging_85_Load`, and `CW_Pump_Cavitation_85_Load` (where `detection_delay_sec = 0.0` simply meant the detector was already firing continuously during the pre-fault normal segment!). Once between-run normal dispersion and out-of-sample `75%` load calibration eliminate false alarms (`0.00%` normal FAR), an omnidirectional unsupervised RMS sum across 49 residual channels only detects late-stage severe degradation (`24.71%` recall) and misses subtle single-subsystem faults (`AF_Clogging`, `CW_Pump_Cavitation`), whereas directional supervised fault probabilities with Schmitt-trigger hysteresis detect **all `7 / 7` fault runs (`50.37%` recall) at `0.00%` normal FAR**, albeit with substantial detection delay (`2320–5580 s`) during gradual fouling progression.

---

## 3. Failure Mode B — `LiU-ICE` Opposite-Sign Sensor Fault Investigation (`LiU-ICE-Benchmark-DXC25`)

### 3.1 Verified Sensor-Fault Gain Factors & Residual Sign/Magnitude Analysis
Inspecting the raw WLTP runs in `LiU-ICE-Benchmark-DXC25` (`ENG-LIU-ICE-01`) confirmed that all sensor faults are injected at $t = 120.0\text{ s}$ as multiplicative gain factors $y_{\text{meas}}(t) = \alpha \cdot y_{\text{true}}(t)$:

| Physical Run ID | Partition | Target Sensor | Fault Gain $\alpha$ | Fault Direction | Decoupled `res__p_ic` Median $z$ | Decoupled `res__p_im` Median $z$ | Decoupled `res__W_af` Median $z$ | Coupled `parity_res__p_im` Median $z$ | Coupled `parity_res__W_af` Median $z$ |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `wltp_NF` | Train | None (`NF`) | `1.00` | `0%` | `+0.102` | `-0.029` | `-0.019` | `-0.074` | `+0.054` |
| `wltp_f_pic_090` (`t >= 120s`) | Train | `intercooler_pressure_pa` | `0.90` | **`-10%`** | **`-13.860`** | `-1.836` | `+0.836` | `+2.162` | `-3.751` |
| `wltp_f_pic_110` (`t >= 120s`) | **Locked Test** | `intercooler_pressure_pa` | `1.10` | **`+10%` (Opposite Sign!)** | **`+13.832`** | **`+0.206`** | **`-0.192`** | **`-6.519` (Phantom!)** | **`+7.370` (Phantom!)** |
| `wltp_f_pim_080` (`t >= 120s`) | Train | `intake_manifold_pressure_pa` | `0.80` | `-20%` | `-1.805` | **`-3.209`** | `+0.072` | **`-3.297`** | `+1.304` |
| `wltp_f_pim_090` (`t >= 120s`) | **Locked Test** | `intake_manifold_pressure_pa` | `0.90` | `-10%` (Half Magnitude) | `-1.897` | **`-1.482`** | `+0.039` | **`-1.294`** | `+0.385` |
| `wltp_f_waf_105` (`t >= 120s`) | Train | `air_mass_flow_kgs` | `1.05` | `+5%` | `+0.027` | `+0.127` | **`+0.602`** | `+0.142` | **`+0.637`** |
| `wltp_f_waf_110` (`t >= 120s`) | **Locked Test** | `air_mass_flow_kgs` | `1.10` | `+10%` (Double Magnitude) | `-0.686` | `+0.176` | **`+1.839`** | `-0.180` | **`+1.388`** |

### 3.2 Systematic Feature Representation Ablation on Locked Test Set (`N = 21,657`)

| Feature Representation | Classifier | Accuracy | Balanced Accuracy | Macro-F1 | Weighted-F1 | Normal FAR (`NF`) | `f_pic` Recall (`+10%`) | `f_pim` Recall (`-10%`) | `f_waf` Recall (`+10%`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `1. phase3_signed_coupled_residual` (`56` feats) | `DummyClassifier` | `0.0665` | `0.2500` | `0.0312` | `0.0083` | `0.00%` | `0.0000` | `0.0000` | `0.0000` |
| `1. phase3_signed_coupled_residual` (`56` feats) | `LogisticRegression_Balanced` | `0.2889` | `0.4238` | `0.2594` | `0.2601` | `2.50%` | **`0.0000`** | `0.4220` | `0.2983` |
| `1. phase3_signed_coupled_residual` (`56` feats) | `RandomForest_Balanced` | `0.3466` | `0.4059` | `0.3051` | `0.3324` | `35.28%` | **`0.0000`** | `0.3955` | **`0.5809`** |
| `2. phase4_unsigned_coupled_parity` (`42` feats) | `LogisticRegression_Balanced` | `0.3478` | `0.4750` | `0.3492` | `0.3790` | **`0.49%`** | `0.5199` | `0.2189` | `0.1660` |
| `2. phase4_unsigned_coupled_parity` (`42` feats) | `RandomForest_Balanced` | `0.5064` | `0.5289` | `0.4637` | `0.5372` | `37.85%` | `0.9964` | `0.2407` | `0.2569` |
| `3. phase4_unsigned_decoupled_control_map` (`32` feats) | `LogisticRegression_Balanced` | `0.5710` | `0.6433` | `0.5363` | `0.6098` | `5.97%` | **`0.9948`** | `0.4213` | `0.2170` |
| `3. phase4_unsigned_decoupled_control_map` (`32` feats) | `RandomForest_Balanced` | `0.5770` | `0.5856` | `0.5369` | `0.6243` | `37.85%` | **`0.9976`** | `0.2850` | `0.4384` |
| **`4. phase4_structured_unsigned_residual` (`34` feats)** | **`LogisticRegression_Balanced`** | **`0.6170`** | **`0.6903`** | **`0.5874`** | **`0.6659`** | **`0.90%`** | **`0.9950`** | **`0.4303`** | **`0.3450`** |
| **`4. phase4_structured_unsigned_residual` (`34` feats)** | **`RandomForest_Balanced`** | **`0.5690`** | **`0.5800`** | **`0.5268`** | **`0.6117`** | `37.43%` | **`0.9976`** | `0.2546` | `0.4421` |

### 3.3 Confusion Matrices: Phase 3 Baseline vs. Phase 4 Structured Unsigned Residual (`LogisticRegression_Balanced`)

#### Phase 3 `phase3_signed_coupled_residual` (`Macro-F1 = 0.2594`, `f_pic Recall = 0.0000`)
| True \ Predicted | `NF` | `f_pic` | `f_pim` | `f_waf` | Total Support | Per-Class Recall |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`NF`** | `1,404` | `21` | `2` | `13` | `1,440` | `0.9750` |
| **`f_pic` (`+10%` test vs `-10%` train)** | `96` | **`0`** | **`6,453`** | `197` | `6,746` | **`0.0000`** |
| **`f_pim` (`-10%` test vs `-20%` train)** | `3,456` | `11` | `2,846` | `431` | `6,744` | `0.4220` |
| **`f_waf` (`+10%` test vs `+5%` train)** | `4,592` | `82` | `46` | `2,007` | `6,727` | `0.2983` |

#### Phase 4 `phase4_structured_unsigned_residual` (`Macro-F1 = 0.5874`, `f_pic Recall = 0.9950`, `Normal FAR = 0.90%`)
| True \ Predicted | `NF` | `f_pic` | `f_pim` | `f_waf` | Total Support | Per-Class Precision | Per-Class Recall | Per-Class F1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`NF`** | **`1,427`** | `2` | `11` | `0` | `1,440` | `0.1546` | **`0.9910`** | `0.2674` |
| **`f_pic` (`+10%` test vs `-10%` train)** | `12` | **`6,712`** | `15` | `7` | `6,746` | **`0.9887`** | **`0.9950`** | **`0.9918`** |
| **`f_pim` (`-10%` test vs `-20%` train)** | `3,663` | `6` | **`2,902`** | `173` | `6,744` | **`0.9257`** | **`0.4303`** | **`0.5875`** |
| **`f_waf` (`+10%` test vs `+5%` train)** | `4,130` | `69` | `207` | **`2,321`** | `6,727` | **`0.9280`** | **`0.3450`** | **`0.5030`** |

### 3.4 Per-Run Performance on `LiU-ICE-Benchmark-DXC25` (`phase4_structured_unsigned_residual` + `LogisticRegression_Balanced`)

| Physical Test Run | Total Rows | Normal Rows ($t < 120\text{s}$) | Fault Rows ($t \ge 120\text{s}$) | Normal Segment FAR | Fault Segment Binary Recall | Fault Segment Exact Class Recall | Overall Run Accuracy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `wltp_f_pic_110` (`+10% p_ic`) | `7,226` | `480` | `6,746` | **`0.00%`** (`0/480`) | **`99.82%`** | **`99.50%`** (`6,712/6,746`) | **`99.53%`** |
| `wltp_f_pim_090` (`-10% p_im`) | `7,224` | `480` | `6,744` | **`2.71%`** (`13/480`) | `45.69%` | `43.03%` (`2,902/6,744`) | `46.64%` |
| `wltp_f_waf_110` (`+10% W_af`) | `7,207` | `480` | `6,727` | **`0.00%`** (`0/480`) | `38.61%` | `34.50%` (`2,321/6,727`) | `38.86%` |

---

## 4. Section 2C — Per-Class, Per-Load & Block-Bootstrap Confidence Intervals

### 4.1 `Marine-Engine-Fault-v1.0` 6-Class Supervised Comparison (`N = 44,059` Test Samples Across 7 Unseen Runs)

| Feature Set & Classifier | Accuracy | Balanced Accuracy | 6-Class Macro-F1 | Weighted-F1 | Pooled Normal FAR | `60%` Load Normal FAR | `85%` Load Normal FAR | `85%` Load Exact Class Recall |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `DummyClassifier_MostFrequent` | `0.2767` | `0.1667` | `0.0722` | `0.1199` | `0.00%` | `0.00%` | `0.00%` | `0.00%` |
| `phase3_residual_features` + `LogisticRegression_Balanced` | `0.5901` | `0.6170` | `0.5446` | `0.5524` | `21.03%` | `61.71%` | `0.01%` | `37.93%` |
| `phase3_residual_features` + `RandomForest_Balanced` | `0.4878` | `0.4042` | `0.3751` | `0.4050` | `1.98%` | `5.80%` | `0.00%` | `9.09%` |
| **`phase4_run_balanced_residual_features` + `LogisticRegression_Balanced`** | **`0.6164`** | **`0.6486`** | **`0.5742`** | **`0.5924`** | **`19.07%`** | `53.78%` | **`1.14%`** | **`51.09%`** |
| `phase4_run_balanced_residual_features` + `RandomForest_Balanced` | `0.4483` | `0.4013` | `0.3408` | `0.3674` | `20.20%` | `8.38%` | `26.30%` | `16.22%` |

#### Per-Class Metrics on `Marine-Engine-Fault-v1.0` (`phase4_run_balanced_residual_features` + `LogisticRegression_Balanced`)
| Class Label | Support | Phase 3 F1 | Phase 4 Precision | Phase 4 Recall | Phase 4 F1 | Delta F1 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `Normal` | `12,189` | `0.6366` | `0.6323` | `0.8093` | **`0.7099`** | **`+0.0733`** |
| `Air-Cooler Fouling` | `9,351` | `0.4305` | `0.9710` | `0.2577` | `0.4073` | `-0.0232` |
| `Compressor Air-Filter Clogging` | `8,394` | `0.2181` | `0.7930` | `0.2281` | **`0.3543`** | **`+0.1362`** |
| `Injection-Valve Nozzle Clogging` | `6,791` | `0.9987` | `0.9997` | `1.0000` | **`0.9999`** | **`+0.0012`** |
| `Cooling-Water Pump Cavitation` | `4,709` | `0.6519` | `0.4741` | `0.9535` | `0.6333` | `-0.0186` |
| `Turbine Degradation` | `2,625` | `0.3321` | `0.2313` | `0.6430` | **`0.3402`** | **`+0.0081`** |

### 4.2 Confidence Interval Comparison: Row-Level i.i.d. Multinomial vs. Contiguous Within-Run Block Bootstrap (`block_size = 60`)

| Dataset | Feature Representation & Model | Point Macro-F1 | i.i.d. Row Bootstrap 95% CI (`N` rows) | Row CI Width | Contiguous Block Bootstrap 95% CI (`60`-sample blocks) | Block CI Width | CI Width Expansion Ratio (Block / Row) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `LiU-ICE-Benchmark-DXC25` | `phase3_signed_coupled` + `LR` | `0.2594` | `[0.2543, 0.2640]` | `0.0097` | `[0.2301, 0.2905]` (`363` blocks) | `0.0605` | **`6.24x`** |
| `LiU-ICE-Benchmark-DXC25` | `phase4_structured_unsigned` + `LR` | `0.5874` | `[0.5819, 0.5931]` | `0.0112` | `[0.5578, 0.6231]` (`363` blocks) | `0.0653` | **`5.83x`** |
| `LiU-ICE-Benchmark-DXC25` | `phase4_structured_unsigned` + `RF` | `0.5268` | `[0.5212, 0.5322]` | `0.0110` | `[0.5010, 0.5582]` (`363` blocks) | `0.0572` | **`5.20x`** |
| `Marine-Engine-Fault-v1.0` | `phase3_residual_features` + `LR` | `0.5446` | `[0.5401, 0.5498]` | `0.0097` | `[0.5153, 0.5747]` (`738` blocks) | `0.0594` | **`6.12x`** |
| `Marine-Engine-Fault-v1.0` | `phase4_run_balanced` + `LR` | `0.5742` | `[0.5700, 0.5790]` | `0.0090` | `[0.5427, 0.6024]` (`738` blocks) | `0.0597` | **`6.63x`** |
| `Marine-Engine-Fault-v1.0` | `phase4_run_balanced` + `RF` | `0.3408` | `[0.3385, 0.3437]` | `0.0052` | `[0.3246, 0.3596]` (`738` blocks) | `0.0349` | **`6.71x`** |

---

## 5. Remaining Failure Modes, Unsupported Claims & Transfer Limitations

1. **Single-Engine Limitation (No Multi-Engine Fleet Generalization Claimed)**:
   - Both `LiU-ICE-Benchmark-DXC25` (`ENG-LIU-ICE-01`, 4-cylinder automotive SI engine) and `Marine-Engine-Fault-v1.0` (`ENG-MATSUI-MU323-01`, 3-cylinder 2-stroke marine diesel engine) contain $N = 1$ physical engine per dataset. All Phase 3 and Phase 4 experiments measure generalization across **unseen physical runs, unseen load regimes, and unseen fault magnitudes/signs on the same engine**, not across unit-to-unit manufacturing tolerances.
2. **Opposite-Sign Sensor Fault Scope on `LiU-ICE`**:
   - Decoupled unsigned control-map residuals (`phase4_structured_unsigned_residual`) resolve the opposite-sign `f_pic` failure (`+10%` test vs `-10%` train, increasing recall from `0.0000` to `0.9950`) because a multiplicative gain bias on $p_{ic}$ produces a symmetric magnitude deviation $|p_{ic} - \hat{p}_{ic}(\mathbf{u})|$ without corrupting $\hat{p}_{im}(\mathbf{u})$ or $\hat{W}_{af}(\mathbf{u})$. However, this sign-symmetry relies on the fault being an additive/multiplicative sensor bias rather than an asymmetric mechanical actuator stiction or directional valve leak; training with only one fault sign remains a fundamental experimental coverage limitation for general nonlinear faults.
3. **Low-Load / Idle Observability Limit on `LiU-ICE` (`f_pim` `43.03%` Recall, `f_waf` `34.50%` Recall)**:
   - During WLTP idle and fuel-cut deceleration segments, air mass flow $W_{af}$ and manifold pressure variation drop to low levels where a `-10%` (`wltp_f_pim_090`) or `+10%` (`wltp_f_waf_110`) multiplicative error falls within $\pm 1.5\sigma$ of normal transient cycle-to-cycle variance. Without sticky run-latching (which would violate point-wise reset capability), low-load samples are classified as `NF` (`3,663` `f_pim` rows and `4,130` `f_waf` rows predicted as `NF`), depressing `NF` precision (`0.1546`) despite a `0.90%` (`13 / 1,440`) normal false-alarm rate.
4. **Remaining `AC_Fouling_60_Load` Pre-Fault Offset in 6-Class Multi-Class `LogisticRegression` on `Marine Engine`**:
   - While our validation-calibrated binary fault detector with Schmitt-trigger hysteresis achieves `0.00%` normal FAR on every run (including `AC_Fouling_60_Load`), uncalibrated argmax 6-class `LogisticRegression_Balanced` (`class_weight="balanced"`) still misclassifies the pre-fault segment of `AC_Fouling_60_Load` as `Turbine Degradation` (`99.37%` run normal FAR) due to an unmodeled exhaust-temperature baseline shift on that specific test day, even as `85%` load normal FAR drops to `1.14%`. Combining the hysteresis binary anomaly gate (`0.00%` FAR) with the 6-class fault classifier is recommended for two-stage hierarchical isolation.
5. **No UAV Flight-Readiness Claim**:
   - Neither automotive dynamometer WLTP cycles nor 2-stroke crosshead marine diesel testbed runs capture altitude air-density lapse rates, variable-pitch propeller governor coupling, or airframe vibration spectra of a MALE UAV piston engine (e.g., Rotax 914/915 iS). No flight readiness or airworthiness claim is made.
