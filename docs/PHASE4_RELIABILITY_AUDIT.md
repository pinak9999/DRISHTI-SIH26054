# DRISHTI Phase 4 — Reliability, Failure Reduction & Independent Verification Audit

**Document ID**: `DRISHTI-PH4-AUDIT-001`  
**Status**: Independently Verified Against Raw Archives, Codebase & Phase 3 Artifacts  
**Scope**: `backend/app/ml/phase3_residual_diagnostics.py`, `backend/artifacts/phase3_experiment_report.json`, `tests/test_phase3_residual_diagnostics.py`, `LiU-ICE-Benchmark-DXC25`, and `Marine-Engine-Fault-v1.0`

---

## 1. Executive Summary & Audit Disposition

Before writing or modifying any Phase 4 code, we inspected the repository, dataset provenance registers, strict physical-run split functions, feature pipelines, saved JSON artifacts, and test suites, and independently re-executed the entire Phase 3 evaluation pipeline from the immutable raw dataset archives (`data/raw/liu_ice/data.zip` and `data/raw/marine_engine_fault/archive.zip`).

| Audit Category | Count / Scope | Summary of Findings |
| :--- | :--- | :--- |
| **1. Results Independently Reproduced** | **22 / 24** supervised & unsupervised model evaluations (`12/12` on `LiU-ICE`, `10/12` on `Marine Engine`), plus **100%** of raw SHA-256 hashes, row counts, physical-run partitions, and anomaly thresholds | Exact match to 4 decimal places (`Macro-F1`, `Accuracy`, `Normal FAR`, `Unseen Fault Recall`, per-class precision/recall/F1, and confusion matrices). |
| **2. Results That Differ From the Saved Report** | **2 / 24** model evaluations on `Marine-Engine-Fault-v1.0` | (a) `residual_features` + `LogisticRegression`: saved `Macro-F1 = 0.5408, FAR = 0.2062` vs. reproduced `Macro-F1 = 0.5406, FAR = 0.2058` ($\Delta = -0.0002$ F1, $-0.0004$ FAR).<br>(b) `residual_plus_normalized` + `RandomForestClassifier`: saved `Macro-F1 = 0.2908, FAR = 0.0091` vs. reproduced `Macro-F1 = 0.2894, FAR = 0.0083` ($\Delta = -0.0014$ F1, $-0.0008$ FAR).<br>Traced to a $10^{-14}$ floating-point variance difference between `pandas` two-pass rolling std and single-pass `numpy.cumsum` in `_causal_within_run_rolling_std`, compounded by non-converged `lbfgs` (`max_iter=500`). |
| **3. Results That Could Not Be Reproduced** | **0** | All data loaders, splits, feature extractors, and models in the repository execute deterministically from local disk without external dependencies. |
| **4. Claims Supported Only by the Existing Report** | **Row-level multinomial 95% confidence intervals** (`±0.003` to `±0.006` width) | Numerically reproducible via `compute_multinomial_bootstrap_ci`, but statistically invalid as a measure of run-to-run uncertainty because consecutive `4.0 Hz` (`LiU-ICE`) and `0.5 Hz` (`Marine Engine`) samples within a physical run are strongly autocorrelated. |

---

## 2. Section 1 — Independent Reproduction of Phase 3 Results

### 2.1 Dataset Integrity & Split Reproduction
Re-executing `RealDatasetIngestor` and the Phase 3 strict physical-run split functions (`split_liu_ice_strict_runs` and `split_marine_strict_runs` in `backend/app/ml/phase3_residual_diagnostics.py`) confirmed:

1. **`LiU-ICE-Benchmark-DXC25`**:
   - **Total Raw Rows**: `405,365` across `8` CSV files (`20 Hz` native sampling, single 4-cylinder automotive spark-ignition engine `ENG-LIU-ICE-01`).
   - **Subsampled Split (`stride = 5`, `4.0 Hz`)**:
     - `train_df`: `28,895` rows across `4` physical runs (`wltp_NF`, `wltp_f_pic_090`, `wltp_f_pim_080`, `wltp_f_waf_105`).
     - `test_cls_df` (locked 4-class test): `21,657` rows across `3` physical runs (`wltp_f_pic_110`, `wltp_f_pim_090`, `wltp_f_waf_110`).
     - `test_anom_df` (anomaly test including unseen intake manifold leak): `28,879` rows across `4` physical runs (`wltp_f_pic_110`, `wltp_f_pim_090`, `wltp_f_waf_110`, `wltp_f_iml_6mm`).
     - **Shared physical runs / CSV files between train and test**: `0`.
2. **`Marine-Engine-Fault-v1.0`**:
   - **Total Raw Rows**: `101,810` across `17` scenario CSV files (`0.5 Hz` sampling, single 3-cylinder 2-stroke marine diesel testbed `ENG-MARINE-2S-01`).
   - **Strict Run-Level Split**:
     - `train_df`: `57,751` rows across `9` physical runs (`Reference_Data`, `Normal_Start`, `AC_Fouling_40_Load`, `AC_Fouling_75_Load`, `AF_Clogging_40_Load`, `AF_Clogging_75_Load`, `Clogged_Injector_Nozzle1_40_60_85_Load`, `Turbine_Degradation_40_Load`, `Turbine_Degradation_60_Load`).
     - `test_cls_df` (locked 5-class unseen-load test): `30,057` rows across `6` physical runs (`AC_Fouling_60_Load`, `AC_Fouling_85_Load`, `AF_Clogging_60_Load`, `AF_Clogging_85_Load`, `Clogged_Injector_Nozzle2_40_60_85_Load`, `Turbine_Degradation_75_Load`).
     - `test_anom_df` (anomaly test including unseen cooling-water pump cavitation): `44,059` rows across `8` physical runs (adding `CW_Pump_Cavitation_60_Load`, `CW_Pump_Cavitation_85_Load`).
     - **Shared physical runs / CSV files between train and test**: `0`.

### 2.2 Complete Side-by-Side Comparison: Saved Phase 3 Report vs. Independent Re-Execution

#### Table 2.2A — `LiU-ICE-Benchmark-DXC25` (12 / 12 Models Exactly Reproduced)

| Feature Set | Model / Detector | Saved Macro-F1 / Recall | Reproduced Macro-F1 / Recall | Saved Normal FAR | Reproduced Normal FAR | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `raw_sensors` | `DummyClassifier` | `0.0311` | `0.0311` | `0.0000` | `0.0000` | **REPRODUCED** |
| `raw_sensors` | `LogisticRegression` | `0.2186` | `0.2186` | `0.6250` | `0.6250` | **REPRODUCED** |
| `raw_sensors` | `RandomForestClassifier` | `0.1510` | `0.1510` | `0.3694` | `0.3694` | **REPRODUCED** |
| `normalized_sensors` | `DummyClassifier` | `0.0311` | `0.0311` | `0.0000` | `0.0000` | **REPRODUCED** |
| `normalized_sensors` | `LogisticRegression` | `0.2186` | `0.2186` | `0.6250` | `0.6250` | **REPRODUCED** |
| `normalized_sensors` | `RandomForestClassifier` | `0.1511` | `0.1511` | `0.3694` | `0.3694` | **REPRODUCED** |
| `residual_features` | `DummyClassifier` | `0.0311` | `0.0311` | `0.0000` | `0.0000` | **REPRODUCED** |
| `residual_features` | `LogisticRegression` | `0.3694` | `0.3694` | `0.2708` | `0.2708` | **REPRODUCED** |
| `residual_features` | `RandomForestClassifier` | `0.3401` | `0.3401` | `0.3354` | `0.3354` | **REPRODUCED** |
| `residual_plus_normalized` | `DummyClassifier` | `0.0311` | `0.0311` | `0.0000` | `0.0000` | **REPRODUCED** |
| `residual_plus_normalized` | `LogisticRegression` | `0.3350` | `0.3350` | `0.2431` | `0.2431` | **REPRODUCED** |
| `residual_plus_normalized` | `RandomForestClassifier` | `0.2588` | `0.2588` | `0.3035` | `0.3035` | **REPRODUCED** |
| Anomaly (`q95`) | `IsolationForest (Raw)` | `Recall = 0.0819` | `Recall = 0.0819` | `0.0566` | `0.0566` | **REPRODUCED** |
| Anomaly (`q95`) | `IsolationForest (Residual)` | `Recall = 0.4408` | `Recall = 0.4408` | `0.1714` | `0.1714` | **REPRODUCED** |
| Anomaly (`q95`) | `RMS_Normalized_Residual` | `Recall = 0.3612` | `Recall = 0.3612` | `0.1597` | `0.1597` | **REPRODUCED** |

#### Table 2.2B — `Marine-Engine-Fault-v1.0` (10 / 12 Supervised Models Exactly Reproduced, 2 Minor Differences Traced)

| Feature Set | Model / Detector | Saved Macro-F1 / Recall | Reproduced Macro-F1 / Recall | Saved Normal FAR | Reproduced Normal FAR | Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `raw_sensors` | `DummyClassifier` | `0.1160` | `0.1160` | `0.0000` | `0.0000` | **REPRODUCED** |
| `raw_sensors` | `LogisticRegression` | `0.3510` | `0.3510` | `0.1303` | `0.1303` | **REPRODUCED** |
| `raw_sensors` | `RandomForestClassifier` | `0.2191` | `0.2191` | `0.0000` | `0.0000` | **REPRODUCED** |
| `normalized_sensors` | `DummyClassifier` | `0.1160` | `0.1160` | `0.0000` | `0.0000` | **REPRODUCED** |
| `normalized_sensors` | `LogisticRegression` | `0.3490` | `0.3490` | `0.1333` | `0.1333` | **REPRODUCED** |
| `normalized_sensors` | `RandomForestClassifier` | `0.2191` | `0.2191` | `0.0000` | `0.0000` | **REPRODUCED** |
| `residual_features` | `DummyClassifier` | `0.1160` | `0.1160` | `0.0000` | `0.0000` | **REPRODUCED** |
| `residual_features` | `LogisticRegression` | `0.5408` | **`0.5406`** | `0.2062` | **`0.2058`** | **DIFFERS ($\Delta = -0.0002$)** |
| `residual_features` | `RandomForestClassifier` | `0.4083` | `0.4083` | `0.0258` | `0.0258` | **REPRODUCED** |
| `residual_plus_normalized` | `DummyClassifier` | `0.1160` | `0.1160` | `0.0000` | `0.0000` | **REPRODUCED** |
| `residual_plus_normalized` | `LogisticRegression` | `0.4494` | `0.4494` | `0.1653` | `0.1653` | **REPRODUCED** |
| `residual_plus_normalized` | `RandomForestClassifier` | `0.2908` | **`0.2894`** | `0.0091` | **`0.0083`** | **DIFFERS ($\Delta = -0.0014$)** |
| Anomaly (`q95`) | `IsolationForest (Raw)` | `Recall = 0.0000` | `Recall = 0.0000` | `0.0000` | `0.0000` | **REPRODUCED** |
| Anomaly (`q95`) | `IsolationForest (Residual)` | `Recall = 0.7289` | `Recall = 0.7289` | `0.5701` | `0.5701` | **REPRODUCED** |
| Anomaly (`q95`) | `RMS_Normalized_Residual` | `Recall = 0.8712` | `Recall = 0.8712` | `0.4783` | `0.4783` | **REPRODUCED** |

### 2.3 Root Cause of the 2 Minor Numerical Differences on `Marine-Engine-Fault-v1.0`
1. **Vectorized Single-Pass Rolling Variance (`backend/app/ml/phase3_residual_diagnostics.py`, lines 199–221)**:
   - When `backend/artifacts/phase3_experiment_report.json` was first written, `_causal_within_run_rolling_std` used `pandas.DataFrame.groupby().rolling(window).std(ddof=0)`. Later in Phase 3, `_causal_within_run_rolling_std` was refactored to a vectorized single-pass cumulative sum of squares (`var = np.maximum(0.0, mean_sq - mean * mean)`) for speed during unit tests.
   - On channels that are nearly constant over a 15-sample (`30 s`) window in `Reference_Data.csv`, single-pass $\mathbb{E}[X^2] - (\mathbb{E}[X])^2$ differs from two-pass variance by $\sim 10^{-14}$ to $10^{-12}$, shifting a small number of `RandomForestClassifier` split thresholds on `roll_std_z__*` features.
2. **Non-Converged `lbfgs` Solver at `max_iter=500`**:
   - During re-execution, `LogisticRegression(max_iter=500)` emitted `ConvergenceWarning: lbfgs failed to converge after 500 iteration(s)` on `Marine-Engine-Fault-v1.0` `residual_features`. Because `lbfgs` terminated at iteration 500 before gradient tolerance was met, the $10^{-14}$ difference in `roll_std_z__*` slightly altered the quasi-Newton Hessian approximation at step 500 (`Macro-F1 = 0.5406` vs `0.5408`).

---

## 3. Root-Cause Audit of Phase 3 Failure Modes

### 3.1 Failure Mode A — Marine-Engine Unsupervised Anomaly False Alarms (`57.01%` at `q95`)

In Phase 3, the residual `IsolationForest` produced a **`57.01%` normal false-alarm rate (FAR) at `q95`** (`49.94%` at `q99`), and `RMS_Normalized_Residual_Score` produced a **`47.83%` normal FAR at `q95`** (`22.68%` at `q99`). Quantitative inspection of the per-run and per-channel residuals across the 9 training runs and 8 test runs revealed **four compounding causes**:

#### Cause A1 — Unseen `85%` Load Regime Extrapolation
Inspecting the normal (`anomaly_state == 0`) pre-fault segments of every test run shows a stark bifurcation between `60%` load and `85%` load runs:

| Test Run ID | Engine Load Regime | Normal Samples ($N$) | Normal Median RMS Residual Score | Normal `q95` RMS Score | Phase 3 `RMS q95` FAR (`thr = 1.9815`) | Phase 3 `RMS q99` FAR (`thr = 3.0736`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `AC_Fouling_60_Load` | `60%` | `2,999` | `1.145` | `1.599` | `0.33%` | `0.27%` |
| `AF_Clogging_60_Load` | `60%` | `2,999` | `1.381` | `2.061` | `7.37%` | `0.30%` |
| `CW_Pump_Cavitation_60_Load` | `60%` | `3,599` | `2.288` | `2.659` | `83.97%` | `1.78%` |
| `Clogged_Injector_Nozzle2_40_60_85_Load` | `40/60/85%` | `2,718` | `1.348` | `1.693` | `0.26%` | `0.15%` |
| `Turbine_Degradation_75_Load` | `75%` | `1,304` | `1.576` | `1.970` | `4.75%` | `0.31%` |
| `AC_Fouling_85_Load` | **`85%`** | `2,999` | **`3.954`** | **`4.922`** | **`99.97%`** | **`99.83%`** |
| `AF_Clogging_85_Load` | **`85%`** | `2,999` | **`3.411`** | **`4.197`** | **`99.97%`** | **`75.29%`** |
| `CW_Pump_Cavitation_85_Load` | **`85%`** | `3,599` | **`3.811`** | **`4.725`** | **`99.97%`** | **`97.33%`** |

Why do the `85%` load normal segments have a median RMS residual score of `3.41–3.95`? Because in the training partition (`train_runs`), the scenario runs containing labeled `Normal` (`anomaly_state == 0`) segments were recorded at **`40%`, `60%`, and `75%` load** (`Clogged_Injector_Nozzle1_40_60_85_Load` starts immediately in the faulted state and has `0` normal rows). Thus, evaluating `85%` load scenario runs requires extrapolating above the scenario-run normal load distribution.

#### Cause A2 — Degree-2 Polynomial Extrapolation Across 10 Correlated Boundary Inputs
In `phase3_residual_diagnostics.py` (`lines 490–538`), `DomainInvariantFeaturePipeline` fits `PolynomialFeatures(degree=2)` across all 10 operating and boundary temperature inputs (`65` quadratic and cross-product terms). When `85%` load test runs operate at slightly different test-day cooling-water supply temperatures (`IC Cooling water Temp. In`, `LO Cooling Water Temp. In`, `Ambient Temp.`), the quadratic cross-terms extrapolate sharply, producing massive baseline errors on un-faulted auxiliary channels:
- `res__feat__LO Cooling Water Temp. Out`: mean $z^2 = \mathbf{42.24}$ (`mean |z| = 6.26`) on normal test rows.
- `res__feat__LO Temp. Engine In`: mean $z^2 = \mathbf{31.23}$ (`mean |z| = 5.26`) on normal test rows.

#### Cause A3 — Pooled MAD Scale Domination by `Reference_Data.csv`
In `phase3_residual_diagnostics.py` (`lines 591–593`), `compute_robust_scale(raw_res_norm)` pools all `39,704` training normal rows together with equal row weight. However, `Reference_Data.csv` alone accounts for **`25,302 / 39,704` (`63.73%`)** of all training normal rows! Inside that single steady reference run, auxiliary flows and pump pressures are virtually constant to 4 decimal places (`Engine Cooling water flow` `MAD scale = 0.00254`, `LO Circulating Pump Press.` `MAD scale = 0.00149`, `Lubrication Oil flow` `MAD scale = 0.00798`). When any other physical run has a tiny $\pm 0.03$ normal day-to-day baseline offset in cooling water flow or pump pressure, dividing by `0.00149` inflates the normalized residual to $|z| > 20$, triggering continuous false alarms.

#### Cause A4 — In-Sample Validation Calibration & Unstratified Tail Split
In `phase3_residual_diagnostics.py` (`lines 515, 912–918`):
1. `DomainInvariantFeaturePipeline.fit(train_df)` fitted `expected_models_` and `residual_scales_` on **all** `39,704` training normal rows — **including** the `val_norm_df` (`7,941` rows) subsequently used to select `q95` and `q99` anomaly thresholds. Because `val_norm_df` was evaluated in-sample with respect to the expected-response model, its residuals were artificially small.
2. Worse, `val_norm_df = normal_df.iloc[split_idx:]` took a simple chronological slice of the concatenated DataFrame, which landed exclusively inside `Turbine_Degradation_40_Load`, `Turbine_Degradation_60_Load`, and `Reference_Data` — completely omitting the highest-load training normal runs (`AC_Fouling_75_Load`, where normal `q95 = 3.483` and `q99 = 5.097`, and `AF_Clogging_75_Load`, where normal `q95 = 2.094`). As a result, Phase 3 set `q95 = 1.9815` instead of calibrating against out-of-sample high-load training runs.

---

### 3.2 Failure Mode B — `LiU-ICE` Opposite-Sign Sensor Fault (`0.0000` Recall on `wltp_f_pic_110`)

In Phase 3, `residual_features` + `LogisticRegression` achieved **`0.0000` recall** (`0 / 6,746` samples) on `f_pic` in the locked test set (`RandomForestClassifier` achieved `0.0006` recall, `4 / 6,746` samples), misclassifying `87.09%` (`5,875 / 6,746`) of `f_pic` samples as `f_pim`. Inspecting the raw sensor trajectories and the 14 normalized residual channels across train and test runs revealed **three physical and structural causes** plus **one column-naming bug**:

#### Cause B1 — One-Sided Training Sign Coverage for `f_pic`
Verifying the fault injection equations in the `LiU-ICE-Benchmark-DXC25` raw CSV files (`data/raw/liu_ice/data.zip`):
- **Training `f_pic` run (`wltp_f_pic_090.csv`)**: Applies a **$-10\%$ multiplicative gain fault** ($y_{\text{meas}} = 0.90 \cdot p_{ic}$) starting at $t = 120\text{ s}$. During the faulted segment, the normalized control-map residual `res__intercooler_pressure_pa` has a median signed $z$-score of **$-13.86$** (`rel_res = -13.90`).
- **Locked Test `f_pic` run (`wltp_f_pic_110.csv`)**: Applies a **$+10\%$ multiplicative gain fault** ($y_{\text{meas}} = 1.10 \cdot p_{ic}$) starting at $t = 120\text{ s}$. During the faulted segment, `res__intercooler_pressure_pa` has an almost identical magnitude ($|z| = 13.83$) but **opposite sign ($z = +13.83$, `rel_res = +13.95`)**.
- In contrast, `f_pim` has negative gain in both train (`wltp_f_pim_080`, $-20\%$, $z(p_{im}) = -3.21$) and test (`wltp_f_pim_090`, $-10\%$, $z(p_{im}) = -1.48$), and `f_waf` has positive gain in both train (`wltp_f_waf_105`, $+5\%$, $z(W_{af}) = +0.60$) and test (`wltp_f_waf_110`, $+10\%$, $z(W_{af}) = +1.84$).

#### Cause B2 — Inclusion of Signed Residual Features (`Z_norm`, `Z_smooth`) Alongside Unsigned `|Z|`
In `phase3_residual_diagnostics.py` (`lines 739–746`), `DomainInvariantFeaturePipeline` concatenated signed features (`Z_norm`, `Z_smooth`) and unsigned magnitude features (`Z_abs`, `Z_abs_smooth`) into a 56-column feature vector. Because `wltp_f_pic_090` is the **only** `f_pic` run in the training set and its signed residual is uniformly negative ($z \approx -13.9$), both `LogisticRegression` and `RandomForestClassifier` placed strong decision weights/splits on the **signed** negative residual `z__res__intercooler_pressure_pa < 0`. When `wltp_f_pic_110` presented $z = +13.83$, the signed terms actively suppressed the `f_pic` class logit/votes.

#### Cause B3 — Cross-Sensor Parity Coupling (`\hat{p}_{im}` Predicted From Faulted `p_{ic}`)
Why was `wltp_f_pic_110` specifically misclassified as **`f_pim`** (`87.1%` of samples) rather than `NF` or `f_waf`?
Look at `parity_specs` in `phase3_residual_diagnostics.py` (`lines 552–580`):
- Phase 3 fits a leave-one-sensor-out model `parity_models_["intake_manifold_pressure_pa"]` that predicts $\hat{p}_{im}$ as a function of **`intercooler_pressure_pa` ($p_{ic}$)**, `air_mass_flow_kgs` ($W_{af}$), and the actuator inputs.
- Physically, $p_{im}$ is downstream of the intercooler and throttle ($p_{im} < p_{ic}$), so $\frac{\partial \hat{p}_{im}}{\partial p_{ic}} > 0$.
- When $p_{ic}$ is faulted by **$+10\%$** in `wltp_f_pic_110`, feeding the inflated $p_{ic}$ into $\hat{p}_{im}(p_{ic}, \dots)$ causes the parity model to over-predict $\hat{p}_{im}$ by $\sim +10\%$.
- Consequently, the manifold pressure parity residual $r_{\text{par}}(p_{im}) = p_{im} - \hat{p}_{im}(p_{ic}, \dots)$ becomes **strongly negative: median $z = -6.52$ (and relative parity $z = -5.75$)** — even though the primary actuator-to-manifold-pressure residual `res__intake_manifold_pressure_pa` (which does NOT use $p_{ic}$ as an input) is completely normal (**median $z = +0.21$**)!
- Because training `f_pim` (`wltp_f_pim_080`, $-20\%$ manifold pressure fault) is characterized by a negative $p_{im}$ parity residual ($z = -3.30$) and a positive $p_{ic}$ parity residual ($z = +2.16$ in `f_pic_090`), the $+10\%$ $p_{ic}$ fault in `wltp_f_pic_110` creates a **phantom negative $p_{im}$ parity signature** that mimics a negative $p_{im}$ fault!

| Physical Run & Segment | Fault Ground Truth | Decoupled Control-Map `z(p_ic)` | Decoupled Control-Map `z(p_im)` | Decoupled Control-Map `z(W_af)` | Coupled Parity `z_par(p_ic)` | Coupled Parity `z_par(p_im)` (Uses $p_{ic}$!) | Coupled Parity `z_par(W_af)` (Uses $p_{ic}$!) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Train `wltp_NF`** (`NF`) | `NF` | `+0.10` | `-0.03` | `-0.02` | `+0.06` | `-0.07` | `+0.05` |
| **Train `wltp_f_pic_090`** (`-10% p_ic`) | `f_pic` | **`-13.86`** | `-1.84` | `+0.84` | **`-16.74`** | `+2.16` | `-3.75` |
| **Train `wltp_f_pim_080`** (`-20% p_im`) | `f_pim` | `-1.81` | **`-3.21`** | `+0.07` | `-0.12` | **`-3.30`** | `+1.30` |
| **Train `wltp_f_waf_105`** (`+5% W_af`) | `f_waf` | `+0.03` | `+0.13` | **`+0.60`** | `+0.12` | `+0.14` | **`+0.64`** |
| **Test `wltp_f_pic_110`** (`+10% p_ic`) | `f_pic` | **`+13.83`** | **`+0.21`** | **`-0.19`** | **`+15.87`** | **`-6.52` (Phantom!)** | **`+7.37` (Phantom!)** |
| **Test `wltp_f_pim_090`** (`-10% p_im`) | `f_pim` | `-1.90` | **`-1.48`** | `+0.04` | `-1.06` | **`-1.29`** | `+0.38` |
| **Test `wltp_f_waf_110`** (`+10% W_af`) | `f_waf` | `-0.69` | `+0.18` | **`+1.84`** | `-0.66` | `-0.18` | **`+1.39`** |

#### Cause B4 — Parity Feature Name Ordering Bug in `phase3_residual_diagnostics.py` (`lines 646–651`)
In `_compute_raw_residuals_internal` (`lines 646–651`), `R_parity_list` (`3` columns) and `R_parity_rel_list` (`3` columns) were concatenated via `np.hstack([R_primary, R_rel] + R_parity_list + R_parity_rel_list)` (which orders columns as `[res_pic, res_pim, res_waf, rel_pic, rel_pim, rel_waf]`), whereas `parity_names.extend([f"parity_res__{tcol}", f"parity_rel__{tcol}"])` interleaved the column names (`[res_pic, rel_pic, res_pim, rel_pim, res_waf, rel_waf]`). While this did not affect model predictions (since column ordering was identical in `fit` and `transform`), it mislabeled Columns 10–13 in feature inspection tables and must be fixed in Phase 4.

---

### 3.3 Failure Mode C — Autocorrelated Confidence Intervals & Unseen-Load Sensitivity

1. **Row-Level Multinomial Bootstrap Overconfidence**:
   - In `phase3_residual_diagnostics.py` (`lines 789–827`), `compute_multinomial_bootstrap_ci` resamples the $N = 21,657$ (`LiU-ICE`) or $N = 30,057$ (`Marine Engine`) confusion matrix counts via `rng.multinomial(total, probs)`.
   - That procedure assumes every row is an independent draw. In reality, `21,657` rows in `LiU-ICE` come from only **3 physical test runs** (`4.0 Hz` sampling), and `30,057` rows in `Marine Engine` come from **6 physical test runs** (`0.5 Hz` sampling). Because residuals and rolling-window features have strong temporal autocorrelation over tens of seconds, i.i.d. row-level bootstrap produces artificially narrow 95% confidence intervals ($\pm 0.003$ to $\pm 0.006$).
   - In Phase 4, we must explicitly report **both** row-level multinomial CIs (for backward comparison with Phase 3) and **contiguous moving-block / run-stratified block bootstrap CIs** (e.g., `60 s` / `120 s` contiguous time blocks and physical-run cluster resamples), documenting the exact sampling unit and demonstrating how temporal correlation widens uncertainty bounds.
2. **Aggregate Metrics Masking Per-Load Failure Modes**:
   - On `Marine-Engine-Fault-v1.0`, reporting a single pooled normal FAR (`47.83%` at `q95`) obscured the fact that normal FAR was **`0.26%–7.37%` at `60%`–`75%` load** (for 4 of 5 runs) vs. **`99.97%` at `85%` load** (for all 3 `85%` load runs). Phase 4 therefore reports all metrics disaggregated by **physical run** and **operating load (`60%`, `75%`, `85%`, and `40/60/85%` transient)**.
