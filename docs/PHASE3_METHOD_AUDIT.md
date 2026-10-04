# DRISHTI Phase 3 — Methodological & Evaluation Code Audit (`SIH26054`)

**Date:** 2026-10-03  
**Scope:** Pre-experiment audit of [`backend/app/data_ingestion/real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py), [`backend/app/ml/real_data_evaluator.py`](backend/app/ml/real_data_evaluator.py), [`docs/REAL_DATA_COMPATIBILITY_REPORT.md`](docs/REAL_DATA_COMPATIBILITY_REPORT.md), [`backend/artifacts/real_data_evaluation_report.json`](backend/artifacts/real_data_evaluation_report.json), and [`data/processed/real_data_quality_report.json`](data/processed/real_data_quality_report.json).

---

## 1. Reproducibility & Checksum Verification Summary

All raw archives, byte counts, MD5/SHA-256 checksums, and per-run row counts reported in [`data/processed/real_data_quality_report.json`](data/processed/real_data_quality_report.json) and [`docs/REAL_DATA_COMPATIBILITY_REPORT.md`](docs/REAL_DATA_COMPATIBILITY_REPORT.md) were re-verified against the raw files on disk:

| Dataset | Archive Path | Size (Bytes) | SHA-256 Verified | Total CSV Runs | Total Rows Verified |
| :--- | :--- | ---: | :---: | ---: | ---: |
| **LiU-ICE Benchmark (`DXC25LiU-ICE`)** | `data/raw/liu_ice/dxc25liu-ice-main.zip` | `17,814,194` | `PASS` | `8` | `288,623` |
| **Marine Engine Fault (`v1.0`)** | `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip` | `26,538,633` | `PASS` | `16` | `114,770` |

---

## 2. Methodological Flaws & Inconsistencies Identified in Phase 2

Before implementing Phase 3 residual-feature experiments, a line-by-line audit of the Phase 2 ingestion and evaluation code uncovered **six specific methodological and reporting issues** that must be corrected or explicitly isolated in Phase 3:

### Finding A — Intra-Run Splitting of `wltp_NF` Masked as "Zero Shared Run IDs" in `LiU-ICE`
* **Location:** [`backend/app/data_ingestion/real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py#L573-L586)
* **Issue:** In `split_liu_ice_by_run()`, the single fault-free driving-cycle file `wltp_NF.csv` (`36,068` rows, $0\text{–}1803.4\text{ s}$) was sliced into `t <= 850.0 s` (`17,000` rows) and `t >= 950.0 s` (`17,068` rows), and its `run_id` column was overwritten with `"wltp_NF_train_block"` and `"wltp_NF_test_block"`. Consequently, `shared_run_ids_between_train_and_test` reported `0` even though both blocks came from the **same physical test run** `wltp_NF.csv`.
* **Physical Consequence:** In the WLTP driving cycle, $t \in [0, 850\text{ s}]$ corresponds to the Low/Medium speed urban phase, whereas $t \in [950, 1803\text{ s}]$ corresponds to the High/Extra-High highway phase. Furthermore, every fault-injected run (`wltp_f_pic_*`, `wltp_f_pim_*`, `wltp_f_waf_*`) already contains $2,400$ samples ($t \in [0, 120\text{ s})$) of genuine pre-fault normal (`NF`) operation.
* **Phase 3 Correction:**
  1. In Phase 3 strict run-independent evaluation of `LiU-ICE`, `wltp_NF.csv` (`36,068` rows) is kept **100% inside the training partition** (`train` normal reference), and **zero rows** from `wltp_NF.csv` are placed in the test partition.
  2. Held-out test normal (`NF`) observations come exclusively from the pre-fault segments ($t < 120\text{ s}$, `7,200` samples across 3 independent CSV files: `wltp_f_pic_110`, `wltp_f_pim_090`, `wltp_f_waf_110`), guaranteeing that `train` (`4` physical CSV files) and `test` (`3` physical CSV files) share **zero physical runs** (`shared_physical_csv_files = 0`).
  3. The single-run limitation of `wltp_f_iml_6mm.csv` (only 1 physical realization of 6 mm intake manifold leakage exists in the public DXC25 archive) is explicitly documented: `f_iml` can be evaluated in **unsupervised/one-class anomaly detection** as an unseen fault run in `test`, but cannot be simultaneously trained and tested in supervised multi-class classification without splitting a single physical run.

### Finding B — Ambient / Test-Cell Boundary Conditions Used as Direct Classification Features (Run-ID Proxy Leakage)
* **Location:** [`backend/app/ml/real_data_evaluator.py`](backend/app/ml/real_data_evaluator.py#L42-L53) and [`backend/app/data_ingestion/real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py#L86-L131)
* **Issue:**
  * In `LiU-ICE`, `LIU_ICE_FEATURE_COLUMNS` included `ambient_pressure_pa` and `ambient_temp_c` directly as classifier inputs. Because each 30-minute WLTP run was recorded at a slightly different barometric pressure and test-cell ambient temperature, decision trees (`RandomForestClassifier`) split on quasi-constant room pressure/temperature levels to guess which CSV file a sample came from.
  * In `Marine Engine Fault`, `MARINE_FEATURE_COLUMNS` included test-cell boundary/supply conditions (`Engine room Temp.`, `Cooling Water Temp. Engine In`, `LO Cooling Water Temp. In`, `Charge Air IC Cooling Water Temp. In`, `Fuel Oil Temp. Flow meter In`, `Fuel Temp.`) and raw load-setting variables (`Water Brake Weight`, `Shaft Power`, `Shaft Torque`, `Engine Speed`). As shown in [`backend/artifacts/real_data_evaluation_report.json`](backend/artifacts/real_data_evaluation_report.json#L700-L739), 6 of the top 10 Random Forest features were load or supply-water boundary temperatures, causing severe overfitting to the training test-day/load conditions (`Macro-F1 = 0.1166` on unseen loads).
* **Phase 3 Correction:**
  * Distinguish **Operating / Boundary Condition Inputs ($\mathbf{u}$)** (e.g., `rpm`, `throttle_pct`, `wastegate_position`, `fuel_flow_lph`, `ambient_pressure_pa`, `ambient_temp_c` in `LiU-ICE`; `Engine Speed`, `Shaft Power`, `Shaft Torque`, `Water Brake Weight`, `Engine room Temp.`, and cooling-water inlet supply temperatures in `Marine Engine Fault`) from **Internal Engine Response Sensors ($\mathbf{y}$)**.
  * Use $\mathbf{u}$ to predict expected normal sensor responses $\hat{\mathbf{y}} = f_{\text{normal}}(\mathbf{u})$ fitted strictly on training normal data, and evaluate fault classifiers on the resulting domain-invariant residuals $\mathbf{r} = \mathbf{y} - \hat{\mathbf{y}}$ and normalized residuals $\mathbf{z} = (\mathbf{y} - \hat{\mathbf{y}}) \oslash \boldsymbol{\sigma}_{\text{normal, train}}$.

### Finding C — Prose vs. Metric Table Contradiction in `LiU-ICE` `engineering_interpretation`
* **Location:** [`backend/artifacts/real_data_evaluation_report.json`](backend/artifacts/real_data_evaluation_report.json#L228-L280) and [`backend/app/ml/real_data_evaluator.py`](backend/app/ml/real_data_evaluator.py#L257-L265)
* **Issue:** Line 262 of `real_data_evaluator.py` hardcoded an interpretation string stating *"(`f_pic` recall near 0)"*, which was true for `LogisticRegression` (`f_pic` recall = `0.0211`), but contradicted the `RandomForestClassifier` table right above it (`f_pic` recall = `0.8455`, while `f_waf` recall was `0.0000`). Furthermore, `RandomForestClassifier` achieved high `f_pic` recall only by misclassifying `40.5%` of `NF` (`1,968 / 4,854`) and `34.2%` of `f_waf` (`2,304 / 6,727`) as `f_pic` due to ambient temperature/pressure shift.
* **Phase 3 Correction:** All diagnostic summaries in Phase 3 are generated dynamically from the actual confusion matrix and per-class recall numbers rather than static narrative strings.

### Finding D — Non-Causal `.bfill()` During Ingestion of `999.0` Sentinels in `Marine Engine Fault`
* **Location:** [`backend/app/data_ingestion/real_data_pipeline.py`](backend/app/data_ingestion/real_data_pipeline.py#L454)
* **Issue:** When replacing `999.0` thermocouple open-circuit sentinels on the 5 affected temperature channels (`Exh.Gas Temp. Turbine Out`, `Cooling Water Temp. Engine Out III`, `LO Temp. Engine In`, `LO Cooling Water Temp. Out`, `LO Temp. TCH In`), line 454 used `.replace(999.0, np.nan).ffill().bfill()`. Calling `.bfill()` at the start of a time series uses future observations within that run if row 0 is `999.0`, and mixes imputation into ingestion rather than the training pipeline.
* **Phase 3 Correction:** In Phase 3, `999.0` sentinels are replaced with `np.nan`, causally forward-filled (`.ffill()`) strictly along past timestamps within each run, and any leading `NaN` at $t = 0$ is imputed using the **training-set normal median** fitted inside the training pipeline (never `.bfill()` from future timestamps and never using test-set statistics).

### Finding E — Arbitrary `contamination=0.05` Threshold in Anomaly Detection
* **Location:** [`backend/app/ml/real_data_evaluator.py`](backend/app/ml/real_data_evaluator.py#L182) and [`backend/app/ml/real_data_evaluator.py`](backend/app/ml/real_data_evaluator.py#L294)
* **Issue:** Phase 2 used `IsolationForest(contamination=0.05)` with its default `predict() == -1` offset rather than calibrating an anomaly score threshold on a training/validation normal split. In `Marine Engine Fault`, this produced a `0.0407` recall (`F1 = 0.0781`) because raw normal training data spanned wide `30%–90%` load variations in `Reference_Data.csv`, making the bounding hypersurface so wide that 60% and 85% load faults fell inside the nominal envelope.
* **Phase 3 Correction:** Anomaly detection scores (both mahalanobis/root-mean-square normalized residual score $S(\mathbf{z}) = \sqrt{\frac{1}{d}\sum_{j=1}^d z_j^2}$ and `IsolationForest` decision scores) have their decision thresholds calibrated strictly on **training/validation normal data** (e.g., 95th and 99th percentile of validation normal scores), and we report the full operational trade-off (False Alarm Rate on normal test observations vs. True Detection Rate / Missed Fault Rate and Detection Delay in seconds) without tuning on the locked test set.

### Finding F — Unseen-Run vs. Unseen-Engine Distinction
* **Issue:** Both `LiU-ICE` (`ENG-LIU-ICE-01`) and `Marine Engine Fault` (`ENG-MATSUI-MU323-01`) contain **1 physical engine each** ($N_{\text{engines}} = 1$).
* **Phase 3 Policy:** Every Phase 3 experiment report and artifact explicitly distinguishes **unseen-run / unseen-load / unseen-fault-severity generalization** (which these two datasets support) from **unseen-engine generalization** across manufacturing tolerances (which requires $N_{\text{engines}} \ge 2$ and remains an explicit blocker for fleet-level claims).
