# DRISHTI — Real-Data Compatibility Report (SIH26054)

**Date:** 2026-10-03  
**Scope:** Field-by-field engineering compatibility mapping between the two verified open-access experimental internal-combustion engine datasets (**LiU-ICE Benchmark** and **Marine Engine Fault Dataset**) and the DRISHTI Telemetry Schema (`DRISHTI-TELEMETRY-v1.0`).

> [!IMPORTANT]
> **Non-Fabrication Rule:** This compatibility mapping never invents unavailable sensors, engine IDs, fault labels, or RUL ground truth. Missing channels remain explicitly `None` (`UNAVAILABLE`), and neither automotive spark-ignition air-path data nor heavy marine diesel test-bench data are claimed as validated MALE UAV aero-piston flight telemetry.

---

## 1. Verified Dataset Overview & Provenance Summary

| Attribute | Dataset 1: LiU-ICE Industrial Fault Diagnosis Benchmark | Dataset 2: Marine Engine Fault Dataset (v1.0) |
|:---|:---|:---|
| **Official Title** | The LiU-ICE Benchmark — An Industrial Fault Diagnosis Case Study (DXC25 / IFAC SafeProcess) | Marine Engine Fault |
| **Official Publisher** | Linköping University, Dept. of Electrical Engineering (Vehicular Systems), Sweden | Zenodo (Authors from Aalto University, NMRI Tokyo, Univ. of Turku, Politecnico di Milano) |
| **Authors** | Daniel Jung, Erik Frisk, Mattias Krysander | Ahmad BahooToroody, Oleksiy Bondarenko, Mohammad Mahdi Abaei, Yoichi Niki, Enrico Zio |
| **DOI / Preprint** | `10.48550/arXiv.2408.13269` (`arXiv:2408.13269v1`); *Control Engineering Practice* Vol. 164, 106427 (2025) | Dataset DOI: `10.5281/zenodo.19857425`; Preprint DOI: `10.48550/arXiv.2607.19444` |
| **Official Landing Page** | `https://vehsys.gitlab-pages.liu.se/diagnostic_competition/` & `https://gitlab.com/daner29/dxc25liu-ice` | `https://zenodo.org/records/19857425` |
| **Direct Download URL** | `https://gitlab.com/daner29/dxc25liu-ice/-/archive/main/dxc25liu-ice-main.zip` | `https://zenodo.org/api/records/19857425/files/Marine_Engine_Fault_Data_v1.zip/content` |
| **License** | arXiv paper: `CC BY-NC-SA 4.0`; Benchmark code/data: Open academic/research benchmark | `CC-BY-4.0` (Creative Commons Attribution 4.0 International) |
| **Local Raw Archive** | `data/raw/liu_ice/dxc25liu-ice-main.zip` (17,814,194 bytes) | `data/raw/marine_engine_fault/Marine_Engine_Fault_Data_v1.zip` (26,538,633 bytes) |
| **Verified SHA-256** | `2861857c5c9e2d952ea2ad99ddc3699a4435bd17fc4f169265ec4664438b3e24` | `3fba7aa0c288ae1bc05383fb54bf67cbde209d61b26e3e811d4bc2f22f97442b` |
| **Verified MD5** | `04deed4dc73c880da0d4a4eaba3f4356` | `f4d246c1bb46e05b26e56221acc2606c` (matches Zenodo API record) |
| **Data Type** | **Measured experimental test-bench data** | **Measured experimental test-bench data** |
| **Physical Engine Type** | 4-cylinder turbocharged spark-ignition (SI) automotive piston engine | 3-cylinder turbocharged, intercooled four-stroke marine diesel piston engine (**Matsui Iron Works MU323DGSC**, 257 kW) |
| **Independent Physical Engines** | **1 physical test-bench engine** (`ENG-LIU-ICE-01`) | **1 physical test-bench engine** (`ENG-MATSUI-MU323-01`) |
| **Independent Runs / Files** | **8 CSV driving-cycle runs** (1 fault-free WLTP run + 7 fault-injected WLTP runs) | **16 CSV test-bench runs** (1 reference run across 30–90% load + 15 fault scenario runs at 40/60/75/85% load) |
| **Total Verified Samples** | **288,623 rows** across 8 CSV files (11 columns each) | **114,770 rows** across 16 CSV files (70 columns in reference, 73 columns in scenarios) |
| **Sampling Rate** | **20 Hz** ($\Delta t = 0.05\text{ s}$, ~1,803 s per WLTP run) | **0.5 Hz** ($\Delta t = 2.0\text{ s}$ median sampling interval) |

---

## 2. Channel-by-Channel Mapping to DRISHTI Telemetry Schema

### 2.1 Dataset 1: LiU-ICE Benchmark (`dxc25liu-ice-main.zip`)

The LiU-ICE CSV files contain 11 columns logged in **SI units**:
`time`, `Intercooler_pressure`, `intercooler_temperature`, `intake_manifold_pressure`, `air_mass_flow`, `engine_speed`, `throttle_position`, `wastegate_position`, `injected_fuel_mass`, `ambient_pressure`, `ambient_temperature`.

| DRISHTI Schema Field | DRISHTI Unit | LiU-ICE Source Column | LiU-ICE Raw Unit | Observed Raw Range (`wltp_NF.csv`) | Conversion to DRISHTI Unit | Compatibility Status |
|:---|:---|:---|:---|:---|:---|:---|
| `rpm` | $\text{RPM}$ | `engine_speed` ($\omega_e$) | $\text{rad/s}$ | $80.16 \text{ to } 330.69\text{ rad/s}$ | $\text{RPM} = \omega_e \times \frac{60}{2\pi}$ ($765.5 \text{ to } 3157.9\text{ RPM}$) | **COMPATIBLE (with unit conversion)** |
| `cht_c` | $^\circ\text{C}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `egt_c` | $^\circ\text{C}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `oil_pressure_bar` | $\text{bar}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `oil_temp_c` | $^\circ\text{C}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `fuel_flow_lph` | $\text{L/h}$ | `injected_fuel_mass` ($W_{fc}$) | $\text{kg/s}$ | $0.000340 \text{ to } 0.005114\text{ kg/s}$ | $\text{L/h} = \frac{W_{fc} \times 3600}{\rho_{\text{gasoline}}}$ ($\rho = 0.745\text{ kg/L} \Rightarrow 1.64 \text{ to } 24.71\text{ L/h}$); raw $\text{kg/s}$ also preserved | **COMPATIBLE (with density-assumed conversion; raw mass flow preserved)** |
| `vibration_rms_mms` | $\text{mm/s}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `throttle_pct` | $\%$ | `throttle_position` ($\alpha_{th}$) | $\%$ | $0.15 \text{ to } 100.11\%$ | Direct ($1:1$, clamped to $[0, 105]$) | **DIRECTLY COMPATIBLE** |
| `engine_load_pct` | $\%$ | *None* | — | — | Remains `None` | **MISSING IN SOURCE** |
| `altitude_m` | $\text{m}$ | `ambient_pressure` ($p_{\text{amb}}$) | $\text{Pa}$ | $100,644.5 \text{ to } 100,717.8\text{ Pa}$ | Test-bench altitude via ISA barometric formula $h = 44330 \times (1 - (p_{\text{amb}}/101325)^{0.190284}) \approx 50\text{ m}$ | **COMPATIBLE (derived from barometer)** |
| `ambient_temp_c` | $^\circ\text{C}$ | `ambient_temperature` ($T_{\text{amb}}$) | $\text{K}$ | $297.16 \text{ to } 301.60\text{ K}$ | $^\circ\text{C} = T_{\text{amb}} - 273.15$ ($24.01 \text{ to } 28.45^\circ\text{C}$) | **COMPATIBLE (Kelvin to Celsius)** |
| **Additional Present Channels** | | | | | | |
| `intercooler_pressure_pa` | $\text{Pa}$ | `Intercooler_pressure` ($p_{ic}$) | $\text{Pa}$ | $92,473.6 \text{ to } 165,065.1\text{ Pa}$ | Preserved in extended air-path feature set | **ADDITIONAL SENSOR** |
| `intercooler_temp_c` | $^\circ\text{C}$ | `intercooler_temperature` ($T_{ic}$) | $\text{K}$ | $296.28 \text{ to } 305.03\text{ K}$ | $T_{ic} - 273.15$ ($23.13 \text{ to } 31.88^\circ\text{C}$) | **ADDITIONAL SENSOR** |
| `intake_manifold_pressure_pa` | $\text{Pa}$ | `intake_manifold_pressure` ($p_{im}$) | $\text{Pa}$ | $19,598.1 \text{ to } 164,409.5\text{ Pa}$ | Preserved in extended air-path feature set | **ADDITIONAL SENSOR** |
| `air_mass_flow_kgs` | $\text{kg/s}$ | `air_mass_flow` ($W_{af}$) | $\text{kg/s}$ | $0.001559 \text{ to } 0.058458\text{ kg/s}$ | Preserved in extended air-path feature set | **ADDITIONAL SENSOR** |
| `wastegate_position` | $[0, 1]$ | `wastegate_position` ($u_{wg}$) | $[-]$ | $0.0 \text{ to } 0.6617$ | Preserved in extended air-path feature set | **ADDITIONAL ACTUATOR** |

---

### 2.2 Dataset 2: Marine Engine Fault Dataset (`Marine_Engine_Fault_Data_v1.zip`)

The Marine Engine Fault dataset contains 70 columns in `Reference_Data.csv` and 73 columns in the 15 fault scenario files.

| DRISHTI Schema Field | DRISHTI Unit | Marine Dataset Source Column | Raw Logged Unit | Observed Raw Range (`Reference_Data.csv`) | Conversion & Quality Notes | Compatibility Status |
|:---|:---|:---|:---|:---|:---|:---|
| `rpm` | $\text{RPM}$ | `Engine Speed` (`N`) | $\text{rpm}$ | $261.56 \text{ to } 403.75\text{ RPM}$ | Direct ($1:1$). Note: Low-speed large-bore marine diesel ($260\text{–}404\text{ RPM}$ vs $2,000\text{–}5,800\text{ RPM}$ in aero piston engines). | **DIRECTLY COMPATIBLE (different speed regime)** |
| `cht_c` | $^\circ\text{C}$ | *None* (Liquid-cooled jacket: `Cooling Water Temp. Engine Out I/II/III`, `T7/T8/T9`) | $^\circ\text{C}$ | $33.9 \text{ to } 66.3^\circ\text{C}$ (plus `999.0` sentinels in `T9`) | **Incompatible as CHT:** Water jacket outlet temp ($60^\circ\text{C}$) is not air-cooled cylinder-head metal temp ($150\text{–}230^\circ\text{C}$). `cht_c` kept `None`; cooling water temps preserved as auxiliary channels. | **INCOMPATIBLE (kept separate; `cht_c=None`)** |
| `egt_c` | $^\circ\text{C}$ | `No.1 Exh.Gas Temp.` (`T1`), `No.2 Exh.Gas Temp.` (`T2`), `No.3 Exh.Gas Temp.` (`T3`), `Exh.Gas Temp. Turbine In` (`T4`) | $^\circ\text{C}$ | Cyl 1–3: $257.7 \text{ to } 528.9^\circ\text{C}$; Turbine In: $293.2 \text{ to } 623.0^\circ\text{C}$ | Mean of `T1, T2, T3` mapped to `egt_c` (or individual cylinder EGTs preserved). `T5` (`Exh.Gas Temp. Turbine Out`) contains `999.0` thermocouple dropout sentinels that must be masked as `NaN`. | **DIRECTLY COMPATIBLE** |
| `oil_pressure_bar` | $\text{bar}$ | `LO Circulating Pump Press.` (`Pl_lo`) | $\text{V}$ (**raw voltage**) | $0.1226 \text{ to } 0.1829\text{ V}$ | **INCOMPATIBLE UNIT:** Logged as uncalibrated raw transducer voltage ($\text{V}$), not $\text{bar}$, with no calibration curve provided. `oil_pressure_bar` kept `None`; raw voltage `Pl_lo` preserved separately. | **INCOMPATIBLE UNIT (raw voltage only; `oil_pressure_bar=None`)** |
| `oil_temp_c` | $^\circ\text{C}$ | `LO Temp. Engine Out` (`T11`) and `LO Temp. Engine In` (`T10`) | $^\circ\text{C}$ | `T11`: $32.23 \text{ to } 67.52^\circ\text{C}$; `T10`: $31.3 \text{ to } 68^\circ\text{C}$ (with `999.0` sentinels) | `LO Temp. Engine Out` (`T11`) has zero `999.0` sentinels and maps cleanly to `oil_temp_c`. `T10` has `999.0` sentinels that are flagged and masked by the ingestion validator. | **DIRECTLY COMPATIBLE (`LO Temp. Engine Out`)** |
| `fuel_flow_lph` | $\text{L/h}$ | `Fuel Flow` (`Qfuel`) | Header says `m3/h` (**actual values are `L/h`**) | $11.59 \text{ to } 95.39$ | **Audit Discovery:** At $154.7\text{ kW}$ shaft power ($\sim 386\text{ kW}$ thermal input), diesel flow is $\sim 39\text{ L/h}$, confirming the raw numbers ($11.6\text{–}95.4$) are already in $\text{L/h}$ (header `m3/h` is a $10^3$ unit-label typo in the bench logger). Mapped $1:1$ with provenance note. | **COMPATIBLE (unit header typo documented)** |
| `vibration_rms_mms` | $\text{mm/s}$ | *None* | — | — | Remains `None` (never fabricated) | **MISSING IN SOURCE** |
| `engine_load_pct` | $\%$ | Nominal load from file metadata (`40%`, `60%`, `75%`, `85%`) or derived from `Shaft Power` / $257\text{ kW}$ | $\%$ / $\text{kW}$ | `Shaft Power`: $56.2 \text{ to } 243.7\text{ kW}$ ($21.9\% \text{ to } 94.8\%$ of $257\text{ kW}$) | $\text{load\_pct} = 100 \times \frac{\text{Shaft Power [kW]}}{257.0}$ | **COMPATIBLE** |
| `ambient_temp_c` | $^\circ\text{C}$ | `Engine room Temp.` (`T22`) | $^\circ\text{C}$ | $25.75 \text{ to } 35.81^\circ\text{C}$ | Direct ($1:1$) | **DIRECTLY COMPATIBLE** |
| **Additional Present Channels** | | | | | | |
| In-Cylinder Pressures | $\text{MPa}$ | `Max./Min. In-Cylinder Press. No.1–3` | $\text{MPa}$ | $P_{\max}: 6.37 \text{ to } 11.89\text{ MPa}$ | 6 channels preserved | **ADDITIONAL COMBUSTION SENSORS** |
| Charge Air Pressure & Temps | $\text{kgf/cm}^2$, $^\circ\text{C}$ | `Charge Air Press.` (`Pturb`), `T14`, `T15` | $\text{kgf/cm}^2$, $^\circ\text{C}$ | $P_{\text{turb}}: 0.06 \text{ to } 0.88\text{ kgf/cm}^2$ ($\times 0.980665 = \text{bar}$) | Converted to $\text{bar}$ and preserved | **ADDITIONAL TURBO SENSORS** |
| Work, Power & Efficiencies | $\text{J}, \text{kW}, \%$ | `Indicated Work No.1–3`, `Effective Work No.1–3`, `Shaft Torque`, `Effn`, `Effi`, `Efft` | $\text{J}, \text{kW}, \text{Nm}, \%$ | `Effi`: $\sim 44\%$, `Efft`: $\sim 39\%$ | Preserved for thermodynamic consistency checks | **ADDITIONAL PERFORMANCE CHANNELS** |

---

## 3. Data Quality Anomalies Discovered During Inspection

### 3.1 `999.0` Thermocouple Dropout Sentinels in Marine Engine Dataset
Across all 16 CSV files in `Marine_Engine_Fault_Data_v1.zip`, five temperature channels contain exact `999.0` values:
- `Exh.Gas Temp. Turbine Out` (`T5`): up to 124 occurrences per file
- `Cooling Water Temp. Engine Out III` (`T9`): up to 64 occurrences per file
- `LO Temp. Engine In` (`T10`): up to 298 occurrences per file
- `LO Cooling Water Temp. Out` (`T13`): up to 1,154 occurrences per file
- `LO Temp. TCH In` (`T19`): up to 10 occurrences per file

**Ingestion Handling:** The ingestion validator explicitly detects `value == 999.0` on all temperature channels (while excluding time columns `Time` and `Time_rel` where `999.0 s` is a valid elapsed second), logs the exact count per channel in the data-quality report, replaces them with `NaN`, and applies causal forward-fill/interpolation only after recording the raw corruption count.

### 3.2 Unrecorded Channels (`dPf`, `dPex`) in 5 Marine Scenario Runs
As documented in the dataset's `README.md` and verified in our scan:
`Compressor Filter Loss` (`dPf`) and `Turbine Back Pressure` (`dPex`) are completely empty (`100% NaN`) in 5 of the 15 fault scenario files:
1. `AC_Fouling/AC_Fouling_85_Load.csv` (5,801 rows)
2. `Injector_Nozzle/Clogged_Injector_Nozzle1_40_60_85_Load.csv` (6,492 rows)
3. `Injector_Nozzle/Clogged_Injector_Nozzle2_LoadProgram.csv` (6,791 rows)
4. `Pump_Cavitation/CW_Pump_Cavitation_60_Load.csv` (5,845 rows)
5. `Pump_Cavitation/CW_Pump_Cavitation_85_Load.csv` (6,263 rows)

**Ingestion Handling:** These two columns **must not** be used as classification features (otherwise a classifier would trivially cheat by checking whether `dPf`/`dPex` is NaN or zero-imputed to identify `Injector_Nozzle` and `Pump_Cavitation`!). Our ingestion pipeline explicitly excludes `Compressor Filter Loss` and `Turbine Back Pressure` from cross-scenario ML feature matrices to prevent missingness leakage.

---

## 4. Fault Label & Task Suitability Matrix

| ML / PHM Task | Dataset 1: LiU-ICE (8 runs, 288,623 samples) | Dataset 2: Marine Engine Fault (16 runs, 114,770 samples) |
|:---|:---|:---|
| **Unsupervised / Semi-Supervised Anomaly Detection** | **SUPPORTED** — Nominal WLTP (`wltp_NF.csv` and $t < 120\text{ s}$ pre-fault segments) vs. post-injection fault segments ($t \ge 120\text{ s}$). | **SUPPORTED** — `Reference_Data.csv` and `Anomaly State == 0` pre-anomaly segments vs. `Anomaly State == 1` anomalous segments across held-out load runs. |
| **Sensor-Fault Isolation** | **SUPPORTED** — 3 multiplicative ECU sensor faults (`f_pic`: intercooler pressure sensor $\pm 10\%$, `f_pim`: intake manifold pressure sensor $-10\%/-20\%$, `f_waf`: air mass flow sensor $+5\%/+10\%$) vs. physical intake manifold leakage (`f_iml_6mm`). | **NOT SUPPORTED** — All 5 fault scenarios are physical subsystem interventions, not sensor faults. |
| **Subsystem Fault Classification** | **PARTIALLY SUPPORTED** — 3 sensor fault classes have 2 magnitude runs each (`train` on one magnitude, `test` on the other), but physical leakage (`f_iml_6mm`) has only **1 run** in the public repository, so `f_iml` cannot be evaluated across independent runs without splitting within the single driving cycle. | **SUPPORTED** — 5 physical fault classes (`Compressor air-filter clogging`, `Air-cooler fouling`, `Injection-valve nozzle clogging`, `Cooling-water pump cavitation`, `Turbine degradation`) + `Normal`, each recorded across multiple distinct load runs (`40%`, `60%`, `75%`, `85%`), allowing strict **run-level train/test splitting**. |
| **Remaining Useful Life (RUL) Estimation** | **NOT SUPPORTED** — Step/constant faults injected at $t \approx 120\text{ s}$; no run-to-failure life depletion or ground-truth RUL labels exist. | **NOT SUPPORTED** — Controlled physical fault interventions at fixed loads; no run-to-failure trajectory or ground-truth RUL labels exist. |

---

## 5. Domain Transfer Limitations to MALE UAV Aero Piston Engines

1. **Single Physical Engine per Dataset ($N_{\text{engines}} = 1$):** Neither dataset contains multiple engines of the same type. Train/test splits can only separate **distinct test runs / load conditions / fault severities** on the same physical engine, which does not validate inter-engine manufacturing or wear variance.
2. **Propulsion Class Differences:**
   - **LiU-ICE** is a 4-cylinder turbocharged spark-ignition **automotive** engine run on WLTP road-driving cycles at sea level ($p_{\text{amb}} \approx 100.7\text{ kPa}$), lacking altitude density variations, propeller load laws, CHT, EGT, oil pressure/temp, and vibration channels.
   - **Marine Engine Fault** is a heavy-duty, low-speed ($260\text{–}404\text{ RPM}$), liquid-cooled, 3-cylinder **marine diesel** engine ($257\text{ kW}$) loaded by a water brake at sea level, lacking air-cooled cylinder-head temperatures, calibrated oil pressure in bar, vibration sensors, and high-altitude turbocharger operating regimes.
3. **Absence of Internal Mechanical Wear & Run-to-Failure Data:** Neither dataset includes piston ring wear, crankshaft journal bearing wear, valve clearance degradation, or run-to-failure RUL trajectories.
