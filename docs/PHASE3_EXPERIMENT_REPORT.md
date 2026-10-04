# DRISHTI Phase 3 — Experiment Report: Robust Diagnostics & Domain-Invariant Residual Features (`SIH26054`)

**Date:** 2026-10-03  
**Evaluation Scope:** `REAL_EXPERIMENTAL_BENCH_DATA_ONLY` (Synthetic RUL baseline kept strictly separate in [`backend/artifacts/synthetic_baseline_report.json`](backend/artifacts/synthetic_baseline_report.json) as `SYNTHETIC-ONLY`)  
**Primary Implementation:** [`backend/app/ml/phase3_residual_diagnostics.py`](backend/app/ml/phase3_residual_diagnostics.py)  
**Machine-Readable Artifact:** [`backend/artifacts/phase3_experiment_report.json`](backend/artifacts/phase3_experiment_report.json)  
**Pre-Experiment Audit:** [`docs/PHASE3_METHOD_AUDIT.md`](docs/PHASE3_METHOD_AUDIT.md)

---

## 1. Executive Summary & Scientific Disclosure

> [!IMPORTANT]
> **Non-Equivalence & Generalization Scope Disclosure:**
> 1. **Unseen-Run vs. Unseen-Engine Generalization:** Both experimental benchmarks contain **1 physical test-bench engine each** (`ENG-LIU-ICE-01` in `LiU-ICE` and `ENG-MATSUI-MU323-01` in `Marine Engine Fault`, $N_{\text{engines}} = 1$). Consequently, these experiments evaluate **unseen-run, unseen-load, and unseen-fault-severity generalization** on the same physical engine, **not** unseen-engine fleet generalization across manufacturing tolerances.
> 2. **Empirical Expected-Response Surfaces vs. First-Principles Physics:** The expected sensor response surfaces $\hat{\mathbf{y}} = f_{\text{normal}}(\mathbf{u})$ evaluated in this study are **data-driven polynomial Ridge regressions fitted strictly on training-only normal operation data**. They are not claimed as validated first-principles physical aero-engine models.
> 3. **No Fabricated Sensors or RUL Targets:** Missing channels (`cht_c`, `egt_c`, `oil_pressure_bar`, `oil_temp_c`, `vibration_rms_mms` in `LiU-ICE`; `cht_c`, calibrated `oil_pressure_bar`, `vibration_rms_mms` in `Marine Engine Fault`) remain `NaN` (`None`). Real-data Remaining Useful Life (RUL) is explicitly marked `NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS`.

---

## 2. Dataset & Partition Provenance (Zero Shared Physical Runs)

Following the pre-experiment audit in [`docs/PHASE3_METHOD_AUDIT.md`](docs/PHASE3_METHOD_AUDIT.md), both datasets were partitioned strictly at the **physical CSV file (`source_file` / `run_id`) level** so that zero physical runs are shared between training and locked test partitions (`shared_physical_runs_between_train_and_test = 0`).

### 2.1 Dataset 1: `LiU-ICE-Benchmark-DXC25` (`ENG-LIU-ICE-01`)
* **Source Archive:** `data/raw/liu_ice/dxc25liu-ice-main.zip` (`17,814,194` bytes, SHA-256: `2861857c5c9e2d952ea2ad99ddc3699a4435bd17fc4f169265ec4664438b3e24`)
* **Sampling Rate:** `20.0 Hz` raw ($\Delta t = 0.05\text{ s}$), deterministically subsampled within each run by `stride = 5` (`4.0 Hz` effective) without overlapping windows.
* **Strict Physical-Run Split:**
  * **Training Runs (4 complete CSV files, `28,868` subsampled rows / `144,333` raw rows):**
    * `wltp_NF` (`100%` kept in training; `7,214` subsampled normal rows, further split chronologically 80/20 into `N_fit_normal = 6,923` and `N_val_normal = 1,731` when combined with pre-fault normal segments of training fault runs)
    * `wltp_f_pic_090` ($-10\%$ intercooler pressure sensor gain fault injected at $t = 120\text{ s}$)
    * `wltp_f_pim_080` ($-20\%$ intake manifold pressure sensor gain fault injected at $t = 120\text{ s}$)
    * `wltp_f_waf_105` ($+5\%$ air mass flow sensor gain fault injected at $t = 120\text{ s}$)
    * *Training Class Distribution:* `NF`: `8,654` | `f_pim`: `6,744` | `f_waf`: `6,737` | `f_pic`: `6,733`
  * **Locked Test Runs — 4-Class Supervised Fault Isolation (3 complete CSV files, `21,657` subsampled rows / `108,278` raw rows):**
    * `wltp_f_pic_110` ($+10\%$ intercooler pressure sensor gain fault — **opposite sign** to training `-10%`!)
    * `wltp_f_pim_090` ($-10\%$ intake manifold pressure sensor gain fault — half magnitude of training `-20%`)
    * `wltp_f_waf_110` ($+10\%$ air mass flow sensor gain fault — double magnitude of training $+5\%$)
    * *Locked Test Class Distribution:* `f_pic`: `6,746` | `f_pim`: `6,744` | `f_waf`: `6,727` | `NF`: `1,440` (from pre-fault $t < 120\text{ s}$ segments of the 3 independent test runs)
  * **Locked Test Runs — Binary Anomaly Detection (4 complete CSV files, `28,860` subsampled rows / `144,290` raw rows):**
    * All 3 test runs above plus `wltp_f_iml_6mm` ($6\text{ mm}$ physical intake manifold orifice leakage, which has only 1 physical run in the DXC25 archive and is therefore evaluated as a completely unseen physical fault class in anomaly detection).

### 2.2 Dataset 2: `Marine-Engine-Fault-v1.0` (`ENG-MATSUI-MU323-01`)
* **Source Archive:** `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip` (`26,538,633` bytes, SHA-256: `3fba7aa0c288ae1bc05383fb54bf67cbde209d61b26e3e811d4bc2f22f97442b`, MD5: `f4d246c1bb46e05b26e56221acc2606c`)
* **Sampling Rate:** `0.5 Hz` ($\Delta t = 2.0\text{ s}$).
* **Causal Sentinel Handling:** All `5,425` occurrences of `999.0` thermocouple dropout sentinels across 5 temperature channels are replaced with `NaN`, causally forward-filled (`.ffill()`) strictly along past timestamps within each run, and any leading `NaN` at $t = 0$ is imputed using the training-only normal median (never `.bfill()`).
* **Strict Physical-Run Split Across Unseen Engine Load Regimes:**
  * **Training Runs (9 complete CSV files, `70,711` rows):**
    `Reference_Data` (`25,302`), `AC_Fouling_40_Load` (`4,678`), `AC_Fouling_75_Load` (`6,354`), `AF_Clogging_40_Load` (`4,820`), `AF_Clogging_75_Load` (`5,918`), `Clogged_Injector_Nozzle1_40_60_85_Load` (`6,492`, Cyl #1 nozzle 1-hole plugged), `CW_Pump_Cavitation_60_Load` (`5,845`), `Turbine_Degradation_40_Load` (`6,397`), `Turbine_Degradation_60_Load` (`4,905`).
    * *Training Class Distribution:* `Normal`: `39,704` (`N_fit_normal = 31,763`, `N_val_normal = 7,941`) | `Air-Cooler Fouling`: `8,149` | `Compressor Air-Filter Clogging`: `6,680` | `Injection-Valve Nozzle Clogging`: `6,492` | `Turbine Degradation`: `5,221` | `Cooling-Water Pump Cavitation`: `4,465`
  * **Locked Test Runs (7 complete CSV files at unseen loads/severities, `44,059` rows):**
    `AC_Fouling_60_Load` (`6,698`), `AC_Fouling_85_Load` (`5,801`), `AF_Clogging_60_Load` (`6,819`), `AF_Clogging_85_Load` (`6,398`), `Clogged_Injector_Nozzle2_LoadProgram` (`6,791`, Cyl #2 nozzle 2-hole plugged), `CW_Pump_Cavitation_85_Load` (`6,263`), `Turbine_Degradation_85_Load` (`5,289`).
    * *Locked Test Class Distribution:* `Normal`: `12,189` | `Air-Cooler Fouling`: `9,351` | `Compressor Air-Filter Clogging`: `8,394` | `Injection-Valve Nozzle Clogging`: `6,791` | `Cooling-Water Pump Cavitation`: `4,709` | `Turbine Degradation`: `2,625`

---

## 3. Experimental Feature Pipelines Tested (STEP 3)

In [`DomainInvariantFeaturePipeline`](backend/app/ml/phase3_residual_diagnostics.py#L349-L607), all fitting (`impute_medians_`, `expected_models_`, `parity_models_`, `residual_medians_`, `residual_scales_`, `sensor_scaler_`, `final_scaler_`) is executed exclusively inside `.fit(train_df, normal_label)`:

1. **`raw_sensors`**: Direct internal engine sensor measurements $\mathbf{y}$ in physical units (`8` on-engine channels for `LiU-ICE` excluding room barometer/ambient temperature drift proxies; `34` internal response channels for `Marine Engine Fault` excluding operating load commands and test-day cooling-water supply inlet temperatures).
2. **`normalized_sensors`**: Training-fitted `RobustScaler` + `StandardScaler` applied to `raw_sensors` ($\tilde{\mathbf{y}} = (\mathbf{y} - \boldsymbol{\mu}_{\text{train}}) \oslash \mathbf{s}_{\text{train}}$).
3. **`residual_features`**:
   * **Expected Sensor Response ($\hat{\mathbf{y}} = f_{\text{normal}}(\mathbf{u})$):** Degree-2 polynomial Ridge regression fitted **exclusively on training normal observations** ($\mathcal{D}_{\text{train, normal}}$) mapping operating/boundary inputs $\mathbf{u}$ to internal response sensors $\mathbf{y}$.
   * **Residual ($\mathbf{r} = \mathbf{y} - \hat{\mathbf{y}}$):** Measured sensor minus expected normal response, plus leave-one-sensor-out analytical redundancy parity residuals (`LiU-ICE`) and cylinder-to-cylinder $P_{\max}$/EGT balance & intercooler/turbine differential temperatures (`Marine Engine Fault`).
   * **Normalized Residual ($\mathbf{z} = (\mathbf{r} - \text{med}_{\text{train, normal}}) \oslash \boldsymbol{\sigma}_{\text{train, normal}}$):** Scaled by the training-only normal robust scale $\boldsymbol{\sigma}_{\text{train, normal}} = 1.4826 \times \text{MAD}_{\text{train, normal}}(\mathbf{r})$, combined with causal within-run rolling window statistics (`56` features for `LiU-ICE`; `132` features for `Marine Engine Fault`).
4. **`residual_plus_normalized`**: Concatenation of `residual_features` and `normalized_sensors` (`64` features for `LiU-ICE`; `166` features for `Marine Engine Fault`).

---

## 4. Supervised Fault Diagnosis Results Across Feature Pipelines (STEP 4)

### 4.1 Dataset 2: `Marine-Engine-Fault-v1.0` (6-Class Unseen-Load Generalization: `40%/75%` Train $\to$ `60%/85%` Test)

| Feature Pipeline | Model | Accuracy | Macro-F1 (95% Bootstrap CI) | Weighted-F1 | False Alarm Rate on Normal Test (`N=12,189`) |
| :--- | :--- | ---: | :--- | ---: | ---: |
| **`raw_sensors` (34 ch)** | `DummyClassifier` | `0.2767` | `0.0722` (`[0.0714, 0.0730]`) | `0.1199` | `0.0000` |
| **`raw_sensors` (34 ch)** | `LogisticRegression` | `0.4148` | `0.3119` (`[0.3097, 0.3140]`) | `0.3717` | `0.2290` |
| **`raw_sensors` (34 ch)** | `RandomForestClassifier` | `0.3434` | `0.1883` (`[0.1864, 0.1903]`) | `0.2283` | `0.0592` |
| **`normalized_sensors` (34 ch)** | `DummyClassifier` | `0.2767` | `0.0722` (`[0.0714, 0.0730]`) | `0.1199` | `0.0000` |
| **`normalized_sensors` (34 ch)** | `LogisticRegression` | `0.4048` | `0.2830` (`[0.2804, 0.2860]`) | `0.3533` | `0.1368` |
| **`normalized_sensors` (34 ch)** | `RandomForestClassifier` | `0.3183` | `0.1674` (`[0.1656, 0.1691]`) | `0.2000` | `0.0567` |
| **`residual_features` (132 ch)** | `DummyClassifier` | `0.2767` | `0.0722` (`[0.0714, 0.0730]`) | `0.1199` | `0.0000` |
| **`residual_features` (132 ch)** | **`LogisticRegression`** | **`0.5877`** | **`0.5408`** (`[0.5370, 0.5451]`) | **`0.5460`** | `0.2062` |
| **`residual_features` (132 ch)** | **`RandomForestClassifier`** | **`0.4910`** | **`0.3883`** (`[0.3846, 0.3916]`) | **`0.4118`** | **`0.0349`** |
| **`residual_plus_normalized` (166 ch)** | `DummyClassifier` | `0.2767` | `0.0722` (`[0.0714, 0.0730]`) | `0.1199` | `0.0000` |
| **`residual_plus_normalized` (166 ch)** | **`LogisticRegression`** | **`0.6282`** | **`0.6064`** (`[0.6024, 0.6105]`) | **`0.6175`** | `0.3400` |
| **`residual_plus_normalized` (166 ch)** | `RandomForestClassifier` | `0.4447` | `0.2908` (`[0.2886, 0.2933]`) | `0.3222` | **`0.0091`** |

#### Per-Class F1 Comparison on `Marine-Engine-Fault-v1.0` (`LogisticRegression`)

| Fault Class (`Support` in Locked Test Set) | `raw_sensors` F1 | `normalized_sensors` F1 | `residual_features` F1 (Prec / Rec) | `residual_plus_normalized` F1 (Prec / Rec) |
| :--- | ---: | ---: | :--- | :--- |
| **`Normal` (`12,189`)** | `0.5065` | `0.5549` | **`0.6316`** (`0.5244` / `0.7938`) | `0.6156` (`0.5767` / `0.6600`) |
| **`Air-Cooler Fouling` (`9,351`)** | `0.3649` | `0.3987` | **`0.4312`** (`1.0000` / `0.2748`) | `0.3991` (`1.0000` / `0.2493`) |
| **`Compressor Air-Filter Clogging` (`8,394`)** | `0.0000` | `0.0108` | `0.1974` (`0.7872` / `0.1128`) | **`0.6007`** (`0.6851` / `0.5348`) |
| **`Injection-Valve Nozzle Clogging` (`6,791`)** | `1.0000` | `0.7336` | `0.9845` (`0.9695` / `1.0000`) | **`0.9999`** (`1.0000` / `0.9997`) |
| **`Cooling-Water Pump Cavitation` (`4,709`)** | `0.0000` | `0.0000` | `0.6504` (`0.4992` / `0.9329`) | **`0.6965`** (`0.5385` / `0.9858`) |
| **`Turbine Degradation` (`2,625`)** | `0.0000` | `0.0000` | **`0.3501`** (`0.2512` / `0.5771`) | `0.3269` (`0.2372` / `0.5257`) |
| **Macro-F1** | `0.3119` | `0.2830` | **`0.5408`** | **`0.6064`** |

* **Key Engineering Finding on `Marine Engine Fault`:**
  * In `raw_sensors` and `normalized_sensors`, three entire fault classes (`Compressor Air-Filter Clogging`, `Cooling-Water Pump Cavitation`, and `Turbine Degradation`) suffered near-zero recall (`F1 = 0.0000` to `0.0108`) on unseen `60%` and `85%` load runs because load-induced thermal and pressure shifts overwhelmed the fault signatures.
  * Subtracting the training-normal expected response $\hat{\mathbf{y}}(\mathbf{u})$ in `residual_features` lifts `Cooling-Water Pump Cavitation` F1 from `0.0000` to **`0.6504`** (`0.6965` in `residual_plus_normalized`), `Turbine Degradation` F1 from `0.0000` to **`0.3501`**, and `Compressor Air-Filter Clogging` F1 from `0.0000` to **`0.1974`** (`0.6007` in `residual_plus_normalized`), nearly doubling overall Macro-F1 (`0.3119` $\to$ `0.5408` / `0.6064`).
  * For `RandomForestClassifier`, `residual_features` more than doubles Macro-F1 (`0.1883` $\to$ **`0.3883`**) while simultaneously cutting the false alarm rate on normal test data from `5.92%` down to **`3.49%`**.

---

### 4.2 Dataset 1: `LiU-ICE-Benchmark-DXC25` (4-Class Strict Zero-Shared-File Split)

| Feature Pipeline | Model | Accuracy | Macro-F1 (95% Bootstrap CI) | Weighted-F1 | False Alarm Rate on Normal Test (`N=1,440`) |
| :--- | :--- | ---: | :--- | ---: | ---: |
| **`raw_sensors` (8 ch)** | `DummyClassifier` | `0.0665` | `0.0312` (`[0.0296, 0.0326]`) | `0.0083` | `0.0000` |
| **`raw_sensors` (8 ch)** | `LogisticRegression` | `0.1825` | `0.1391` (`[0.1352, 0.1429]`) | `0.1440` | `0.4979` |
| **`raw_sensors` (8 ch)** | `RandomForestClassifier` | `0.3138` | `0.2329` (`[0.2292, 0.2362]`) | `0.2578` | `0.3826` |
| **`normalized_sensors` (8 ch)** | `DummyClassifier` | `0.0665` | `0.0312` (`[0.0296, 0.0326]`) | `0.0083` | `0.0000` |
| **`normalized_sensors` (8 ch)** | `LogisticRegression` | `0.2010` | `0.1564` (`[0.1526, 0.1597]`) | `0.1605` | `0.3194` |
| **`normalized_sensors` (8 ch)** | `RandomForestClassifier` | `0.3142` | `0.2330` (`[0.2292, 0.2363]`) | `0.2578` | `0.3812` |
| **`residual_features` (56 ch)** | `DummyClassifier` | `0.0665` | `0.0312` (`[0.0296, 0.0326]`) | `0.0083` | `0.0000` |
| **`residual_features` (56 ch)** | **`LogisticRegression`** | **`0.2995`** | **`0.2707`** (`[0.2665, 0.2757]`) | **`0.2752`** | **`0.0278`** |
| **`residual_features` (56 ch)** | **`RandomForestClassifier`** | **`0.3245`** | **`0.2888`** (`[0.2847, 0.2938]`) | **`0.3151`** | `0.3590` |
| **`residual_plus_normalized` (64 ch)** | `DummyClassifier` | `0.0665` | `0.0312` (`[0.0296, 0.0326]`) | `0.0083` | `0.0000` |
| **`residual_plus_normalized` (64 ch)** | `LogisticRegression` | `0.2696` | `0.2244` (`[0.2200, 0.2292]`) | `0.2217` | **`0.0097`** |
| **`residual_plus_normalized` (64 ch)** | `RandomForestClassifier` | `0.1989` | `0.1540` (`[0.1505, 0.1573]`) | `0.1424` | **`0.0000`** |

#### Per-Class F1 Comparison on `LiU-ICE-Benchmark-DXC25`

| Class (`Support` in Locked Test Set) | `raw_sensors` (`LogReg` / `RF`) | `normalized_sensors` (`LogReg` / `RF`) | `residual_features` (`LogReg` / `RF`) | `residual_plus_normalized` (`LogReg` / `RF`) |
| :--- | :---: | :---: | :---: | :---: |
| **`NF` (`1,440`)** | `0.1193` / `0.1317` | `0.1400` / `0.1320` | **`0.2518`** / `0.1804` | `0.2357` / `0.2013` |
| **`f_pic` (`6,746`, $-10\% \to +10\%$)** | `0.0010` / `0.0039` | `0.0000` / `0.0036` | `0.0000` / `0.0000` | `0.0000` / `0.0000` |
| **`f_pim` (`6,744`, $-20\% \to -10\%$)** | `0.3579` / `0.7210` | `0.4339` / **`0.7223`** | `0.3621` / `0.3293` | **`0.5555`** / `0.3439` |
| **`f_waf` (`6,727`, $+5\% \to +10\%$)** | `0.0783` / `0.0750` | `0.0516` / `0.0739` | **`0.4692`** / **`0.6455`** | `0.1065` / `0.0708` |
| **Macro-F1** | `0.1391` / `0.2329` | `0.1564` / `0.2330` | **`0.2707`** / **`0.2888`** | `0.2244` / `0.1540` |
| **Normal False Alarm Rate** | `0.4979` / `0.3826` | `0.3194` / `0.3812` | **`0.0278`** / `0.3590` | **`0.0097`** / **`0.0000`** |

* **Key Engineering Findings & Failure Case Analysis on `LiU-ICE`:**
  1. **Massive Reduction in False Alarms & 8.6x Gain on `f_waf`:** On `raw_sensors` and `normalized_sensors`, rapid WLTP throttle/speed transients cause `31.9%–49.8%` false alarm rates on normal pre-fault segments, and the $+5\% \to +10\%$ air mass flow sensor fault (`f_waf`) is almost completely missed (`F1 = 0.0516–0.0783`). Using `residual_features`, `f_waf` F1 increases **8.6x** to **`0.6455`** (`RandomForest`, `Precision = 0.8064`, `Recall = 0.5381`) and **`0.4692`** (`LogisticRegression`, `Precision = 0.8270`), while `LogisticRegression` cuts the normal false alarm rate from `49.79%` down to **`2.78%`**.
  2. **Why `f_pic` (`-10%` Train $\to$ `+10%` Test) Fails in Supervised Classification (`Recall = 0.0`):**
     * In the `residual_features` confusion matrix (`LogisticRegression`, lines 908–913 of [`phase3_experiment_report.json`](backend/artifacts/phase3_experiment_report.json#L908-L913)), out of `6,746` samples of `wltp_f_pic_110`, **only `444` (`6.6%`) are mistaken for `NF`**—meaning the residual pipeline **detects `93.4%` of `wltp_f_pic_110` as faulty (`non-NF`) within `3.0 s` of fault onset**!
     * However, `6,254 / 6,746` (`92.7%`) of `wltp_f_pic_110` samples are classified as `f_pim` instead of `f_pic`. The physical reason is structural coupling across the throttle valve: when intercooler pressure $p_{ic}$ has an **unseen positive $+10\%$ gain fault** ($p_{ic,\text{meas}} = 1.10\,p_{ic,\text{true}}$), the measured pressure drop $p_{im,\text{meas}} - p_{ic,\text{meas}}$ becomes strongly negative—matching the exact parity sign of the **negative $-20\%$ gain fault on intake manifold pressure $p_{im}$** ($p_{im,\text{meas}} = 0.80\,p_{im,\text{true}}$) seen during training (`wltp_f_pim_080`)! Without either (a) both positive and negative fault realizations in training or (b) a calibrated nonlinear compressible-flow orifice observer decoupler ([`engine_model.py`](data/raw/liu_ice/engine_model.py)), a classifier trained only on $-10\% p_{ic}$ and $-20\% p_{im}$ aliases $+10\% p_{ic}$ into $-p_{im}$.

---

## 5. Unsupervised Anomaly Detection with Validation-Only Thresholds (STEP 4)

All anomaly detection thresholds were calibrated strictly on the **held-out training normal validation slice** (`N_val_normal = 1,731` for `LiU-ICE`; `N_val_normal = 7,941` for `Marine Engine Fault`) at two operational target points:
* **`val_q95` (`5%` validation normal false-alarm target)**: Higher sensitivity / lower missed-fault rate.
* **`val_q99` (`1%` validation normal false-alarm target)**: Higher specificity / lower false-alarm rate.

### 5.1 `LiU-ICE-Benchmark-DXC25` Anomaly Detection (Across 4 Unseen Test Runs Including `wltp_f_iml_6mm`)

| Feature Pipeline & Detector | Operating Point | Calibrated Threshold | Val Normal FAR | Test Precision | Test Recall (TDR) | Missed Fault Rate | Test Normal FAR | Test F1 | Detection Delay by Run (`f_iml` / `f_pic` / `f_pim` / `f_waf`) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `raw_sensors` + `IsolationForest` | `val_q95` | `0.5491` | `0.0503` | `0.9815` | `0.1025` | `0.8975` | `0.0271` | `0.1856` | `19.0s` / `20.0s` / `15.75s` / `17.75s` |
| `raw_sensors` + `IsolationForest` | `val_q99` | `0.5876` | `0.0104` | `0.9910` | `0.0369` | `0.9631` | `0.0047` | `0.0711` | `19.0s` / `21.0s` / `38.0s` / `19.25s` |
| **`residual_features` + `IsolationForest`** | **`val_q95`** | `0.5176` | `0.0503` | **`0.9835`** | **`0.6225`** | **`0.3775`** | `0.1464` | **`0.7625`** | **`0.0s` / `0.25s` / `14.5s` / `17.5s`** |
| **`residual_features` + `IsolationForest`** | **`val_q99`** | `0.5680` | `0.0104` | **`0.9957`** | **`0.5072`** | `0.4928` | **`0.0307`** | **`0.6720`** | **`0.0s` / `3.0s` / `14.5s` / `17.5s`** |
| **`RMS_Normalized_Residual_Score`** | **`val_q95`** | `3.0658` | `0.0503` | `0.9895` | `0.4637` | `0.5363` | `0.0693` | `0.6315` | `0.0s` / `3.0s` / `13.5s` / `17.5s` |
| **`RMS_Normalized_Residual_Score`** | **`val_q99`** | `4.3876` | `0.0104` | `0.9952` | `0.3488` | `0.6512` | **`0.0234`** | `0.5166` | `0.0s` / `3.0s` / `14.5s` / `17.5s` |

### 5.2 `Marine-Engine-Fault-v1.0` Anomaly Detection (Across 7 Unseen-Load Test Runs)

| Feature Pipeline & Detector | Operating Point | Calibrated Threshold | Val Normal FAR | Test Precision | Test Recall (TDR) | Missed Fault Rate | Test Normal FAR | Test F1 | Detection Delay (`AC_60` / `AC_85` / `AF_60` / `AF_85` / `CW_85` / `Inj_2` / `Turb_85`) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |
| `raw_sensors` + `IsolationForest` | `val_q95` | `0.5627` | `0.0500` | `1.0000` | `0.0489` | `0.9511` | `0.0000` | `0.0932` | `null` / `221s` / `null` / `null` / `null` / `null` / `null` |
| **`residual_features` + `IsolationForest`** | **`val_q95`** | `0.4570` | `0.0500` | `0.7850` | **`0.7963`** | **`0.2037`** | `0.5701` | **`0.7906`** | `146s` / `0s` / `45s` / `0s` / `0s` / `0s` / `75s` |
| **`RMS_Normalized_Residual_Score`** | **`val_q95`** | `1.9781` | `0.0500` | `0.8050` | `0.7554` | `0.2446` | `0.4783` | **`0.7794`** | `67s` / `0s` / `42s` / `0s` / `0s` / `0s` / `623s` |
| **`RMS_Normalized_Residual_Score`** | **`val_q99`** | `3.7132` | `0.0101` | **`0.8683`** | `0.5717` | `0.4283` | **`0.2268`** | **`0.6894`** | `4066s` / `0s` / `null` / `3484s` / `0s` / `0s` / `3263s` |

* **Operational Trade-Off Analysis:**
  * On `Marine Engine Fault`, raw-sensor `IsolationForest` misses `95.11%` of all faults (`Recall = 0.0489`, detecting only 1 of 7 test runs) because normal training data in `Reference_Data.csv` span `30%–90%` load, creating a massive nominal bounding box.
  * Switching to `RMS_Normalized_Residual_Score` or `residual_features` + `IsolationForest` detects **all 7 held-out fault runs** (`Recall = 0.7554–0.7963`, `F1 = 0.7794–0.7906`), at the cost of higher false alarms (`0.2268–0.4783`) during the pre-fault segments of the `85%` load runs where test-bed cooling water supply temperatures shifted outside the `Reference_Data.csv` regime. In contrast, the supervised `RandomForestClassifier` on `residual_features` achieves **`3.49%` false alarm rate** (`0.91%` on `residual_plus_normalized`) on those exact same normal test segments because it learns to distinguish benign baseline shifts from fault-specific residual patterns.

---

## 6. Remaining Blockers & Domain Transfer Limitations

1. **Single Engine per Dataset ($N_{\text{engines}} = 1$):** Neither `LiU-ICE` (`ENG-LIU-ICE-01`) nor `Marine Engine Fault` (`ENG-MATSUI-MU323-01`) contains multiple physical engine units. True **unseen-engine generalization** across unit-to-unit manufacturing tolerances cannot be experimentally verified until multi-engine test-bench or UAV flight logs are acquired.
2. **Opposite-Sign Multiplicative Sensor Fault Aliasing in `LiU-ICE`:** Without training realizations of both signs ($\pm \Delta$) or a calibrated first-principles compressible orifice throttle observer, a linear/polynomial residual classifier trained only on $-10\% p_{ic}$ and $-20\% p_{im}$ detects $+10\% p_{ic}$ as a fault (`93.4%` non-normal detection) but aliases its class label into `f_pim`.
3. **No Real Run-to-Failure Piston-Engine RUL Dataset:** Both datasets consist of controlled fault-injection experiments rather than endurance wear-to-failure tests. RUL remains strictly `NOT_SUPPORTED_NO_GROUND_TRUTH_RUL_LABELS` on real data and `SYNTHETIC-ONLY` in [`backend/artifacts/synthetic_baseline_report.json`](backend/artifacts/synthetic_baseline_report.json).
