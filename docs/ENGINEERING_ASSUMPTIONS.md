# DRISHTI Digital Twin — Engineering Assumptions, Equations & Limitations (SIH26054)

> [!IMPORTANT]
> **Disclosure of Scope & Validation Status:**  
> This software is an engineering digital-twin demonstrator for MALE UAV aero piston propulsion health monitoring (SIH26054). The physics-informed reference equations and fault-injection transfer functions are **simplified lumped-parameter analytical models** inspired by 4-cylinder, 4-stroke, horizontally-opposed turbocharged aero piston engines (e.g., Rotax 914 UL/F class, 1.211 L displacement, 115 HP max takeoff at 5800 RPM, 100 HP continuous at 5500 RPM). They are **not** experimentally calibrated thermodynamic cycle simulations or flight-certified FADEC control laws.

---

## 1. Reference Aero Piston Engine Parameters (`Rotax914-Simplified-Ref-v1.0`)

### 1.1 Supported Operating Envelope
The physics reference model validates inputs against the following supported operating envelope. Any sample exceeding these bounds triggers `is_extrapolated = True` and lists the violated parameters in `extrapolation_reasons`:

| Parameter | Symbol | Unit | Supported Min | Supported Max | Nominal Cruise | Sensor Fault Plausible Range |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Engine Speed | $N_{\text{rpm}}$ | RPM | $1400$ | $6000$ | $5000$ | $[0, 7500]$ |
| Throttle Position | $\theta_{\text{thr}}$ | % | $0.0$ | $100.0$ | $72.0$ | $[0.0, 105.0]$ |
| Engine Load | $L_{\text{eng}}$ | % | $0.0$ | $115.0$ | $75.0$ | $[0.0, 130.0]$ |
| Pressure Altitude | $h$ | m AMSL | $-100.0$ | $7000.0$ | $3500.0$ | $[-500.0, 12000.0]$ |
| Ambient Temperature | $T_{\text{amb}}$ | °C | $-35.0$ | $+50.0$ | $+15.0$ | $[-60.0, +70.0]$ |
| Cylinder Head Temp | $\text{CHT}$ | °C | $50.0$ | $240.0$ | $178.0$ | $[-40.0, +350.0]$ |
| Exhaust Gas Temp | $\text{EGT}$ | °C | $250.0$ | $980.0$ | $815.0$ | $[-40.0, +1300.0]$ |
| Oil Pressure | $P_{\text{oil}}$ | bar | $0.8$ | $7.5$ | $4.2$ | $[0.0, 12.0]$ |
| Oil Temperature | $T_{\text{oil}}$ | °C | $40.0$ | $150.0$ | $102.0$ | $[-40.0, +220.0]$ |
| Fuel Flow Rate | $\dot{V}_{\text{fuel}}$ | L/h | $2.0$ | $42.0$ | $22.5$ | $[0.0, 80.0]$ |
| Broadband Vibration | $V_{\text{rms}}$ | mm/s | $0.2$ | $18.0$ | $2.4$ | $[0.0, 50.0]$ |
| Bus / Alternator Voltage | $V_{\text{bat}}$ | V | $11.0$ | $15.5$ | $13.8$ | $[0.0, 24.0]$ |
| Injection Pulse Width | $\tau_{\text{inj}}$ | ms | $1.5$ | $16.0$ | $8.4$ | $[0.0, 30.0]$ |

---

## 2. Explicit Physics-Informed Expected-Value Equations

### 2.1 Atmospheric Density Ratio & Cooling Effectiveness
Using the International Standard Atmosphere (ISA) troposphere approximation:

$$\sigma_{\text{alt}} = \max\left(0.30,\; \left(1 - 2.2558 \times 10^{-5} \, h\right)^{4.2559}\right)$$

$$\Delta T_{\text{ISA}} = T_{\text{amb}} - \left(15.0 - 0.0065 \, h\right)$$

Cooling air mass-flow effectiveness decreases at high altitude and elevated ambient temperatures:

$$\eta_{\text{cool}} = \sigma_{\text{alt}}^{0.35}$$

### 2.2 Expected Cylinder Head Temperature ($\text{CHT}_{\text{exp}}$, °C)
Steady-state target CHT depends on normalized RPM ($u_{\text{rpm}} = N_{\text{rpm}} / 5500$), normalized load ($u_{\text{load}} = L_{\text{eng}} / 100$), ambient temperature, and altitude cooling penalty:

$$\text{CHT}_{\text{ss}} = 105.0 + 48.0 \, u_{\text{load}}^{0.85} + 24.0 \, u_{\text{rpm}} + 0.65 \, (T_{\text{amb}} - 15.0) + 18.0 \, (1.0 - \eta_{\text{cool}})$$

When tracking time-series telemetry with time step $\Delta t$, first-order thermal lag ($\tau_{\text{cht}} = 12.0\text{ s}$) is applied when prior state is available, or steady-state reference when evaluated point-wise.

### 2.3 Expected Exhaust Gas Temperature ($\text{EGT}_{\text{exp}}$, °C)
EGT responds rapidly ($\tau_{\text{egt}} = 2.5\text{ s}$) to combustion stoichiometry, engine load, RPM, and turbocharger backpressure at altitude:

$$\text{EGT}_{\text{exp}} = 510.0 + 255.0 \, u_{\text{load}}^{0.75} + 75.0 \, u_{\text{rpm}} + 0.45 \, (T_{\text{amb}} - 15.0) + 28.0 \, (1.0 - \sigma_{\text{alt}}) - 22.0 \, \max(0, u_{\text{load}} - 0.85)$$

*(Note: Above 85% load, full-power enrichment lowers EGT slightly to protect exhaust valves and turbocharger turbine inlet.)*

### 2.4 Expected Oil Temperature ($T_{\text{oil,exp}}$, °C) & Oil Pressure ($P_{\text{oil,exp}}$, bar)
Oil temperature tracks thermal load and ambient rejection ($\tau_{\text{oil}} = 25.0\text{ s}$):

$$T_{\text{oil,exp}} = 68.0 + 28.0 \, u_{\text{load}} + 10.0 \, u_{\text{rpm}} + 0.55 \, (T_{\text{amb}} - 15.0) + 10.0 \, (1.0 - \eta_{\text{cool}})$$

Oil pressure increases with gear-pump speed ($u_{\text{rpm}}$) up to the pressure-relief valve regulation knee and decreases with oil temperature due to lubricant viscosity thinning:

$$P_{\text{oil,exp}} = \text{clip}\left(1.6 + 3.4 \, \min(1.05, u_{\text{rpm}}) - 0.018 \, (T_{\text{oil,exp}} - 95.0),\; 1.5,\; 5.8\right)$$

### 2.5 Expected Fuel Flow ($\dot{V}_{\text{fuel,exp}}$, L/h) & Injection Pulse Width ($\tau_{\text{inj,exp}}$, ms)
Brake specific fuel consumption increases during high-load enrichment:

$$\phi_{\text{enrich}} = 1.0 + 0.14 \, \max(0, u_{\text{load}} - 0.82)$$

$$\dot{V}_{\text{fuel,exp}} = \left(3.2 + 23.5 \, u_{\text{load}}^{1.08} \, u_{\text{rpm}}^{0.65}\right) \phi_{\text{enrich}}$$

$$\tau_{\text{inj,exp}} = 2.1 + 7.8 \, u_{\text{load}} \, \phi_{\text{enrich}}$$

### 2.6 Expected Broadband Vibration ($V_{\text{rms,exp}}$, mm/s) & Electrical Voltage ($V_{\text{bat,exp}}$, V)

$$V_{\text{rms,exp}} = 0.85 + 1.45 \, u_{\text{rpm}}^{1.4} + 0.45 \, u_{\text{load}}$$

$$V_{\text{bat,exp}} = \text{clip}\left(12.6 + 1.4 \, \min\left(1.0, \frac{\max(0, N_{\text{rpm}} - 1200)}{1500}\right) - 0.002 \, \max(0, T_{\text{amb}} - 25.0),\; 12.2,\; 14.2\right)$$

---

## 3. Nine-Class Synthetic Fault Transfer Functions

All fault injections are parameterized by onset time $t_0$, severity $s \in [0.1, 1.0]$, progression profile $p(t) \in [0, 1]$, and deterministic RNG seed:

1. **Normal (`Normal`):** Bounded sensor Gaussian noise ($\sigma_{\text{CHT}} = 1.4^\circ\text{C}$, $\sigma_{\text{EGT}} = 4.5^\circ\text{C}$, $\sigma_{P_{\text{oil}}} = 0.06\text{ bar}$, $\sigma_{\text{vib}} = 0.12\text{ mm/s}$).
2. **Cylinder Overheating (`Cylinder Overheating`):** Cooling fin blockage / baffle leak $\rightarrow$ $\Delta \text{CHT} = + (22 + 38s)p$, $\Delta T_{\text{oil}} = + (10 + 18s)p$, $\Delta \text{EGT} = + (18 + 30s)p$, slight power loss ($\Delta N_{\text{rpm}} = -60sp$).
3. **Oil Pressure Drop (`Oil Pressure Drop`):** Oil pump wear / relief valve leak / loss of lubricant $\rightarrow$ $\Delta P_{\text{oil}} = - (1.1 + 1.6s)p$, $\Delta T_{\text{oil}} = + (12 + 22s)p$, secondary friction vibration $\Delta V_{\text{rms}} = + (0.8 + 1.2s)p$.
4. **Crankshaft Bearing Wear (`Crankshaft Bearing Wear`):** Journal clearance degradation $\rightarrow$ strong broadband & harmonic vibration increase $\Delta V_{\text{rms}} = + (2.6 + 4.8s)p$, moderate oil pressure bleed-off $\Delta P_{\text{oil}} = - (0.45 + 0.65s)p$, oil temperature rise $\Delta T_{\text{oil}} = + (9 + 15s)p$.
5. **Cylinder Misfire (`Cylinder Misfire`):** Fouled spark plug / ignition coil intermittent drop $\rightarrow$ sharp EGT drop in unburnt fuel expansion or erratic oscillation $\Delta \text{EGT} = - (55 + 85s)p$, RPM drop $\Delta N_{\text{rpm}} = - (140 + 220s)p$, severe torsional firing imbalance vibration $\Delta V_{\text{rms}} = + (2.2 + 3.6s)p$, CHT drop $\Delta \text{CHT} = - (14 + 22s)p$.
6. **Sensor Fault (`Sensor Fault`):** Corrupts a single measured channel (`CHT`, `EGT`, `oil_pressure`, or `vibration`) via configurable sub-mode (`drift`, `stuck_at`, `high_noise`, `implausible_spike`) while all other physical channels remain consistent with the nominal physics model.
7. **Piston Ring Wear (`Piston Ring Wear`):** Blow-by into crankcase $\rightarrow$ elevated oil temperature $\Delta T_{\text{oil}} = + (15 + 24s)p$, elevated CHT $\Delta \text{CHT} = + (12 + 20s)p$, reduced compression efficiency requiring higher fuel flow $\Delta \dot{V}_{\text{fuel}} = + (2.4 + 3.8s)p$, moderate vibration $\Delta V_{\text{rms}} = + (1.1 + 1.8s)p$, slight oil pressure reduction $\Delta P_{\text{oil}} = - (0.35 + 0.55s)p$.
8. **Valve Clearance Issue (`Valve Clearance Issue`):** Exhaust/intake tappet maladjustment $\rightarrow$ elevated EGT $\Delta \text{EGT} = + (45 + 75s)p$, valvetrain clatter vibration $\Delta V_{\text{rms}} = + (1.4 + 2.3s)p$, slight CHT rise $\Delta \text{CHT} = + (6 + 12s)p$, minor volumetric efficiency loss ($\Delta \dot{V}_{\text{fuel}} = - (1.2 + 1.8s)p$).
9. **Fuel Injector Clogging (`Fuel Injector Clogging`):** Partial nozzle restriction $\rightarrow$ reduced fuel flow $\Delta \dot{V}_{\text{fuel}} = - (3.2 + 5.2s)p$ despite ECU increasing command pulse width $\Delta \tau_{\text{inj}} = + (1.4 + 2.4s)p$, lean-burn EGT rise $\Delta \text{EGT} = + (38 + 68s)p$, lean roughness vibration $\Delta V_{\text{rms}} = + (0.9 + 1.5s)p$.

---

## 4. Machine Learning & RUL Assumptions

### 4.1 ML Architecture (`scikit-learn==1.9.1` & `xgboost==3.2.0`)
The pipeline implements the exact models specified in `Team_Drishti_SIH26054.pptx`:
- **9-Class Fault Classifier:** `RandomForestClassifier(n_estimators=120..140, max_depth=14, min_samples_leaf=2..4, class_weight="balanced_subsample", random_state=42)`
- **Anomaly Detector:** `IsolationForest(n_estimators=120..200, contamination=0.01..0.03, random_state=42)` fit exclusively on normal training trajectories, with anomaly threshold calibrated on the validation split.
- **RUL Regressor:** `xgboost.XGBRegressor(n_estimators=140, max_depth=6, learning_rate=0.06, subsample=0.85, colsample_bytree=0.85, random_state=42)` paired with `RandomForestRegressor(n_estimators=40, max_depth=12, min_samples_leaf=2, random_state=42)` where individual decision-tree predictions provide empirical 10th and 90th percentile prediction intervals.

### 4.2 Remaining Useful Life (RUL) Definition & Units (`cycles` and `hours`)
- **Target Variables:**
  - `rul_cycles`: Remaining Useful Life in **equivalent mission cycles** (PPT primary unit), where 1 standard mission cycle corresponds to 1 equivalent nominal flight hour scaled by the instantaneous thermal-mechanical stress factor $\kappa = \text{clip}(0.85 + 0.30 \, (u_{\text{load}} / 0.75) \, (\text{CHT} / 175^\circ\text{C}),\; 0.75,\; 1.45)$.
  - `rul_hours`: Remaining Useful Life in **mission operating hours** until composite degradation index reaches the critical maintenance threshold $D(t) = 1.0$.
- **Non-Estimable Handling (`NOT_ESTIMABLE`):** RUL estimation returns `status = "NOT_ESTIMABLE"` (with `rul_hours = None, rul_cycles = None`) when:
  1. Telemetry frame has critical sensor validity failures (`is_valid == False` or isolated `Sensor Fault`).
  2. During training and evaluation, all `Sensor Fault` rows are explicitly excluded from RUL regression (`gt_rul = -1.0`).

### 4.3 Transparent Hybrid Health Indicator (HI) Formula (`α = 0.30, β = 0.30, γ = 0.20, δ = 0.20`)
The Health Indicator $\text{HI} \in [0, 100]$ is a deterministic, transparent composite score aligned with Slide 4 of `Team_Drishti_SIH26054.pptx` ($\alpha = 0.30, \beta = 0.30, \gamma = 0.20, \delta = 0.20$):

$$\text{HI} = \text{clip}\left(100 - \left(0.30 \, P_{\text{thermal}} + 0.30 \, P_{\text{oil}} + 0.20 \, P_{\text{vib}} + 0.20 \, P_{\text{anom}}\right),\; 0,\; 100\right)$$

where:
- $P_{\text{thermal}} = 100 \times \text{clip}\left(\frac{\max(0, |\Delta \text{CHT}| - 6)}{40} + \frac{\max(0, |\Delta \text{EGT}| - 20)}{110},\; 0, 1\right)$
- $P_{\text{oil}} = 100 \times \text{clip}\left(\frac{\max(0, -\Delta P_{\text{oil}} - 0.18)}{1.6} + \frac{\max(0, \Delta T_{\text{oil}} - 5)}{30},\; 0, 1\right)$
- $P_{\text{vib}} = 100 \times \text{clip}\left(\frac{\max(0, \Delta V_{\text{rms}} - 0.35)}{5.0},\; 0, 1\right)$
- $P_{\text{anom}} = 100 \times \text{clip}(\text{anomaly\_score\_normalized},\; 0, 1)$
