import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FastForward,
  Info,
  Pause,
  Play,
  Sliders,
  StepForward,
  Wrench,
} from 'lucide-react';
import { drishtiApi } from '../api/client';
import { Engine3DViewport } from '../components/Engine3DViewport';
import {
  ExplainableAlert,
  FaultScenarioConfig,
  FourValueDigitalTwinState,
  ReplaySnapshot,
} from '../types/telemetry';
import { statusBadgeClass } from './FleetAndTwinScreens';

function mapFaultToSubsystemName(faultClass: string): string {
  switch (faultClass) {
    case 'Cylinder Overheating':
    case 'Valve Clearance Issue':
      return 'SUB-05 · Cylinder Heads, Valvetrain & Cooling Plenum';
    case 'Oil Pressure Drop':
      return 'SUB-07 · Dry-Sump Lubrication & Oil Cooler Circuit';
    case 'Crankshaft Bearing Wear':
      return 'SUB-02 · Crankshaft Journals & Reduction Gearbox';
    case 'Piston Ring Wear':
    case 'Cylinder Misfire':
      return 'SUB-03/04 · Horizontally-Opposed Power Cylinders';
    case 'Fuel Injector Clogging':
      return 'SUB-08 · Electronic Fuel Injection Rail & Nozzles';
    case 'Sensor Fault':
      return 'SUB-10 · FADEC Sensor Harness & Instrumentation';
    default:
      return 'Nominal Propulsion Assembly (All Subsystems Within Envelope)';
  }
}

/* =========================================================================
   SCREEN 4: FAULT INVESTIGATION & EXPLAINABLE ALERTS
   ========================================================================= */
export const FaultInvestigationScreen: React.FC<{
  engineId: string;
  latestState: FourValueDigitalTwinState | null;
  alerts: ExplainableAlert[];
  catalog?: Record<string, any> | null;
  onRefreshEngine: () => Promise<void>;
}> = ({ engineId, latestState, alerts, catalog, onRefreshEngine }) => {
  const [showCatalogMatrix, setShowCatalogMatrix] = useState<boolean>(false);

  if (!latestState) {
    return (
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Fault Investigation — {engineId}
          </div>
        </div>
        <div style={{ color: '#94a3b8', padding: 12 }}>
          Diagnostic state for {engineId}: <strong>Unavailable</strong>.
        </div>
      </div>
    );
  }

  const probData = Object.entries(latestState.predicted.class_probabilities).map(
    ([cls, prob]) => ({
      fault_class: cls,
      probability_pct: Number((prob * 100).toFixed(1)),
    })
  );

  const sDiag = latestState.predicted.sensor_diagnosis;
  const affectedSubsystem = mapFaultToSubsystemName(
    latestState.predicted.predicted_fault_class
  );

  const handleAck = async (alertId: string, curAck: boolean) => {
    await drishtiApi.acknowledgeAlert(alertId, !curAck);
    await onRefreshEngine();
  };

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Diagnostics · 9-Class Ensemble & Sensor-Fault Isolation
          </div>
          <h1 className="screen-title">
            Fault Investigation & Root-Cause Evidence — {engineId}
          </h1>
          <div className="screen-desc">
            9-Class Random Forest posterior probability distribution,
            IsolationForest anomaly scoring, dedicated Sensor-Fault Isolator,
            affected subsystem localization, and explainable maintenance
            decision support.
          </div>
        </div>
        <div className="screen-actions">
          <span className="badge badge-synthetic">
            DECISION SUPPORT ONLY — NOT CERTIFIED FLIGHT RELEASE
          </span>
        </div>
      </div>

      {/* 4 DIAGNOSTIC SUMMARY CARDS */}
      <div className="grid-4">
        <div className="kpi-card info">
          <div className="kpi-label">Primary Diagnostic Classification</div>
          <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
            {latestState.predicted.predicted_fault_class}
          </div>
          <div className="kpi-sub">
            Confidence: {(latestState.predicted.top_probability * 100).toFixed(1)}%
            · {latestState.predicted.diagnosis_certainty_status}
          </div>
        </div>

        <div
          className={`kpi-card ${
            latestState.predicted.is_anomaly ? 'caution' : 'nominal'
          }`}
        >
          <div className="kpi-label">Independent Anomaly Detector</div>
          <div
            className="kpi-value sm"
            style={{
              color: latestState.predicted.is_anomaly ? '#fbbf24' : '#4ade80',
            }}
          >
            {latestState.predicted.is_anomaly ? 'ANOMALY ACTIVE' : 'NOMINAL'}
          </div>
          <div className="kpi-sub">
            Score: {latestState.predicted.anomaly_score.toFixed(3)} (Thr:{' '}
            {latestState.predicted.anomaly_threshold.toFixed(3)})
          </div>
        </div>

        <div
          className={`kpi-card ${
            sDiag.is_sensor_fault_detected ? 'caution' : 'nominal'
          }`}
        >
          <div className="kpi-label">Sensor vs Engine Fault Isolation</div>
          <div
            className="kpi-value sm"
            style={{
              color: sDiag.is_sensor_fault_detected
                ? '#fbbf24'
                : sDiag.is_ambiguous
                ? '#fb923c'
                : '#4ade80',
            }}
          >
            {sDiag.diagnosis_status}
          </div>
          <div className="kpi-sub">
            Suspected Channels:{' '}
            {sDiag.suspected_channels.length > 0
              ? sDiag.suspected_channels.join(', ')
              : 'None'}
          </div>
        </div>

        <div className="kpi-card info">
          <div className="kpi-label">Affected Propulsion Subsystem</div>
          <div
            className="mono"
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: '#ffffff',
              marginBottom: 4,
            }}
          >
            {affectedSubsystem}
          </div>
          <div className="kpi-sub">
            Source: {latestState.data_source} (
            {latestState.is_synthetic ? 'SIMULATED' : 'RECORDED'})
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              9-Class Fault Classifier Probability Distribution (%)
            </div>
          </div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={probData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke="#8899bb"
                  unit="%"
                />
                <YAxis
                  type="category"
                  dataKey="fault_class"
                  width={155}
                  stroke="#8899bb"
                  fontSize={11}
                />
                <Tooltip />
                <Bar
                  dataKey="probability_pct"
                  name="Class Probability (%)"
                  fill="#38bdf8"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Sensor-Fault Isolator & Cross-Channel Evidence
            </div>
            <span className="badge badge-info">{sDiag.isolator_version}</span>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div className="kpi-label">Isolation Findings</div>
            {sDiag.evidence.map((ev, i) => (
              <div
                key={i}
                className="mono"
                style={{
                  padding: '6px 8px',
                  background: 'rgba(10, 15, 29, 0.8)',
                  borderRadius: 3,
                  marginBottom: 5,
                  fontSize: 11,
                }}
              >
                • {ev}
              </div>
            ))}
          </div>
          <div className="kpi-label">
            Instantaneous Residual Deviations (Actual − Expected)
          </div>
          <table className="data-table mono">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Actual</th>
                <th>Physics Expected</th>
                <th>Residual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CHT (°C)</td>
                <td>{latestState.actual.cht_c.toFixed(1)}</td>
                <td>{latestState.expected.cht_c.toFixed(1)}</td>
                <td>
                  {latestState.calculated.cht_residual_c >= 0 ? '+' : ''}
                  {latestState.calculated.cht_residual_c.toFixed(2)} °C
                </td>
              </tr>
              <tr>
                <td>EGT (°C)</td>
                <td>{latestState.actual.egt_c.toFixed(1)}</td>
                <td>{latestState.expected.egt_c.toFixed(1)}</td>
                <td>
                  {latestState.calculated.egt_residual_c >= 0 ? '+' : ''}
                  {latestState.calculated.egt_residual_c.toFixed(2)} °C
                </td>
              </tr>
              <tr>
                <td>Oil Pressure (bar)</td>
                <td>{latestState.actual.oil_pressure_bar.toFixed(2)}</td>
                <td>{latestState.expected.oil_pressure_bar.toFixed(2)}</td>
                <td>
                  {latestState.calculated.oil_pressure_residual_bar >= 0
                    ? '+'
                    : ''}
                  {latestState.calculated.oil_pressure_residual_bar.toFixed(3)}{' '}
                  bar
                </td>
              </tr>
              <tr>
                <td>Vibration (mm/s)</td>
                <td>{latestState.actual.vibration_rms_mms.toFixed(2)}</td>
                <td>{latestState.expected.vibration_rms_mms.toFixed(2)}</td>
                <td>
                  {latestState.calculated.vibration_residual_mms >= 0 ? '+' : ''}
                  {latestState.calculated.vibration_residual_mms.toFixed(3)} mm/s
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* EXPLAINABLE ALERT LOG & RECOMMENDED INVESTIGATION STEPS */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Wrench size={14} /> Explainable Alert Log & Recommended
            Investigation Steps ({alerts.length} Alerts)
          </div>
          {catalog?.sih26054_eight_fault_categories && (
            <button
              className="btn btn-sm"
              onClick={() => setShowCatalogMatrix((v) => !v)}
            >
              {showCatalogMatrix ? (
                <>
                  <ChevronUp size={12} /> Hide 8-Category Reference Matrix
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Show SIH26054 8-Fault Reference
                  Matrix
                </>
              )}
            </button>
          )}
        </div>
        {alerts.length === 0 ? (
          <div style={{ color: '#94a3b8', padding: '8px 0' }}>
            No alerts triggered for this engine mission. All residuals are
            within nominal physics reference envelopes.
          </div>
        ) : (
          alerts.slice(0, 12).map((alt) => (
            <div
              key={alt.alert_id}
              className={`alert-box ${alt.severity.toLowerCase()}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={statusBadgeClass(alt.severity)}>
                    {alt.severity}
                  </span>
                  <strong className="mono">{alt.alert_id}</strong>
                  <span>|</span>
                  <strong>{alt.fault_class}</strong>
                  <span className="badge badge-info">{alt.anomaly_type}</span>
                  <span className="badge badge-synthetic">
                    {mapFaultToSubsystemName(alt.fault_class).split('·')[0]}
                  </span>
                  {alt.acknowledged && (
                    <span className="badge badge-nominal">ACKNOWLEDGED</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: '#94a3b8' }}
                  >
                    {alt.timestamp} | Seq #{alt.sequence_number}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => handleAck(alt.alert_id, alt.acknowledged)}
                  >
                    <CheckCircle2 size={11} />{' '}
                    {alt.acknowledged ? 'Unacknowledge' : 'Acknowledge'}
                  </button>
                </div>
              </div>
              <div
                className="mono"
                style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 6 }}
              >
                <strong>Model Output & Score:</strong> {alt.score_label} |{' '}
                {alt.model_version} / {alt.rule_version}
              </div>
              <div style={{ marginBottom: 6 }}>
                {alt.supporting_evidence.map((ev, idx) => (
                  <div key={idx} style={{ fontSize: 11.5, color: '#e2e8f0' }}>
                    • {ev}
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: 'rgba(2, 132, 199, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '6px 10px',
                  borderRadius: 3,
                  marginBottom: 4,
                  color: '#38bdf8',
                  fontSize: 11.5,
                }}
              >
                <strong>Recommended Investigation Action:</strong>{' '}
                {alt.recommended_action}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: '#94a3b8' }}>
                {alt.evidence_source_statement} | Data Quality:{' '}
                {alt.data_quality_limitations.join('; ')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* SIH26054 OFFICIAL 8-FAULT-CATEGORY EVIDENCE MAPPING (ON DEMAND) */}
      {showCatalogMatrix && catalog?.sih26054_eight_fault_categories && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Info size={13} /> SIH26054 Official 8-Fault-Category Evidence &
              Detection Pathway Matrix
            </div>
            <span className="badge badge-info">
              ALL 8 INTENDED FAULT CATEGORIES MAPPED
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Official SIH26054 Category</th>
                  <th>Mapped DRISHTI Class(es)</th>
                  <th>Detection Pathway</th>
                  <th>Primary Sensor Evidence</th>
                  <th>Engineering Rationale & Limitations</th>
                </tr>
              </thead>
              <tbody>
                {catalog.sih26054_eight_fault_categories.map((fc: any) => (
                  <tr key={fc.category_id}>
                    <td>#{fc.category_id}</td>
                    <td>
                      <strong style={{ color: '#38bdf8' }}>
                        {fc.sih_problem_statement_category}
                      </strong>
                    </td>
                    <td>{(fc.mapped_ml_fault_classes || []).join(', ')}</td>
                    <td>{fc.detection_pathway}</td>
                    <td>{(fc.primary_sensor_evidence || []).join('; ')}</td>
                    <td style={{ color: '#94a3b8' }}>
                      {fc.causal_rationale} <em>({fc.limitation_disclosure})</em>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UNCERTAINTY AND KNOWN LIMITATIONS DISCLOSURE */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Info size={13} /> Diagnostic Uncertainty & Known Limitations
          </div>
        </div>
        <div
          className="mono"
          style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.65 }}
        >
          <div>
            • <strong>“Coding Degradation” → Cooling Degradation Interpretation:</strong>{' '}
            The official SIH26054 text lists “Coding degradation” among
            propulsion faults. In aero-piston thermodynamics, this is documented
            and modeled as <strong>Cooling Degradation</strong> (cooling baffle
            obstruction / fin fouling reducing heat rejection efficiency η_cool
            and driving positive CHT/Oil-T residuals).
          </div>
          <div>
            • <strong>Aggregate Sensor Scope:</strong> Telemetry schema v1.0.0
            provides single-channel engine CHT, EGT, Oil P/T, and Vibration RMS.
            Faults cannot be localized to a specific cylinder (#1–#4) without
            per-cylinder thermocouple instrumentation.
          </div>
          <div>
            • <strong>Correlation vs. Causation:</strong> IsolationForest anomaly
            triggers indicate statistical residual deviation from the physics
            reference baseline; physical fault confirmation requires the
            recommended borescope/mechanical inspection action above.
          </div>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 5: 6-STEP GUIDED MISSION & FAULT SIMULATOR WORKFLOW
   Step 1 — Select engine and mission profile
   Step 2 — Select operating conditions and diagnostic fault
   Step 3 — Configure fault severity and onset (with progressive disclosure)
   Step 4 — Review a concise scenario summary
   Step 5 — Execute the existing deterministic simulation
   Step 6 — Present results with baseline-vs-scenario comparison, parameter trends, fault diagnosis & health impact
   ========================================================================= */
const SIM_STEPS = [
  { step: 1, title: 'Engine & Profile' },
  { step: 2, title: 'Conditions & Fault' },
  { step: 3, title: 'Severity & Onset' },
  { step: 4, title: 'Review Summary' },
  { step: 5, title: 'Execute Simulation' },
  { step: 6, title: 'Comparison & Results' },
];

export const MissionSimulatorScreen: React.FC<{
  selectedEngineId: string;
  catalog: Record<string, any> | null;
  onSimulationCompleted: (
    engineId: string,
    missionId: string,
    reportId: string
  ) => Promise<void>;
}> = ({ selectedEngineId, catalog, onSimulationCompleted }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [config, setConfig] = useState<FaultScenarioConfig>({
    scenario_id: 'SIM-CUSTOM-01',
    engine_id: selectedEngineId || 'ENG-MALE-01',
    mission_id: 'MSN-SIM-CUSTOM',
    mission_profile: 'controlled_fault_injection',
    fault_class: 'Cylinder Overheating',
    sensor_fault_submode: 'drift',
    sensor_fault_channel: 'cht_c',
    onset_time_sec: 15.0,
    duration_sec: 60.0,
    sample_interval_sec: 1.0,
    severity: 0.8,
    random_seed: 2026,
    base_altitude_m: 3000.0,
    base_ambient_temp_c: 28.0,
    base_throttle_pct: 76.0,
    base_load_pct: 78.0,
  });

  const [running, setRunning] = useState(false);
  const [simResult, setSimResult] = useState<Record<string, any> | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, engine_id: selectedEngineId }));
  }, [selectedEngineId]);

  const applyPreset = (preset: Record<string, any>) => {
    setConfig((prev) => ({
      ...prev,
      scenario_id: `SIM-${preset.preset_id.toUpperCase()}`,
      mission_id: `MSN-${preset.preset_id.toUpperCase()}-${prev.random_seed}`,
      mission_profile: preset.mission_profile,
      fault_class: preset.fault_class,
      onset_time_sec: preset.default_onset_sec,
      duration_sec: preset.default_duration_sec,
      severity: preset.default_severity,
      base_altitude_m: preset.default_altitude_m,
      base_ambient_temp_c: preset.default_ambient_temp_c,
      base_throttle_pct: preset.default_throttle_pct,
      base_load_pct: preset.default_load_pct,
    }));
  };

  const handleRunSimulation = async () => {
    setRunning(true);
    setSimError(null);
    try {
      const res = await drishtiApi.runSimulation(config);
      setSimResult(res);
      await onSimulationCompleted(
        config.engine_id,
        config.mission_id,
        res.report_id
      );
      setCurrentStep(6);
    } catch (err: any) {
      setSimError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const faultClasses: string[] = catalog?.fault_classes || [
    'Normal',
    'Cylinder Overheating',
    'Oil Pressure Drop',
    'Crankshaft Bearing Wear',
    'Cylinder Misfire',
    'Sensor Fault',
    'Piston Ring Wear',
    'Valve Clearance Issue',
    'Fuel Injector Clogging',
  ];

  const presets: Record<string, any>[] = catalog?.mission_presets || [];

  const simTrendData = (simResult?.telemetry || []).map(
    (t: FourValueDigitalTwinState) => ({
      elapsed: t.mission_elapsed_sec,
      cht_actual: t.actual.cht_c,
      cht_expected: t.expected.cht_c,
      oil_p_actual: t.actual.oil_pressure_bar,
      oil_p_expected: t.expected.oil_pressure_bar,
      vib_actual: t.actual.vibration_rms_mms,
      vib_expected: t.expected.vibration_rms_mms,
      hi: t.predicted.health_index,
    })
  );

  return (
    <div>
      {/* HEADER */}
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Operations · 6-Step Guided Deterministic Scenario Workflow
          </div>
          <h1 className="screen-title">
            Mission & 9-Class Fault Simulator
          </h1>
          <div className="screen-desc">
            Step-by-step deterministic fault injection synchronized with the 3D
            Digital Twin, physics reference baseline, and SQLite mission store.
          </div>
        </div>
        <div className="screen-actions">
          <span className="badge badge-synthetic">
            SYNTHETIC SCENARIO GENERATOR (SEED {config.random_seed})
          </span>
          <button
            className="btn btn-primary"
            onClick={handleRunSimulation}
            disabled={running}
            title="Execute simulation immediately with current parameters"
          >
            <Play size={13} />{' '}
            {running ? 'Running Simulation…' : 'Quick Execute Simulation'}
          </button>
        </div>
      </div>

      {/* 6-STEP WIZARD BAR */}
      <div className="wizard-steps" role="tablist" aria-label="Simulator Workflow Steps">
        {SIM_STEPS.map((s) => {
          const isCompleted =
            s.step < currentStep || (s.step === 6 && simResult !== null);
          const isActive = s.step === currentStep;
          return (
            <div
              key={s.step}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={`wizard-step ${isActive ? 'active' : ''} ${
                isCompleted ? 'completed' : ''
              }`}
              onClick={() => setCurrentStep(s.step)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCurrentStep(s.step);
              }}
            >
              <div className="wizard-step-num">Step {s.step}</div>
              <div className="wizard-step-label">{s.title}</div>
            </div>
          );
        })}
      </div>

      {simError && (
        <div className="alert-box critical" style={{ marginBottom: 14 }}>
          <strong>Simulation Execution Error:</strong> {simError}
        </div>
      )}

      {/* STEP 1: SELECT ENGINE AND MISSION PROFILE */}
      {currentStep === 1 && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Cpu size={14} /> Step 1 — Select Target Engine & Mission Profile
            </div>
            <span className="badge badge-info">STEP 1 OF 6</span>
          </div>

          {presets.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>
                Quick-Load Validated Scenario Presets ({presets.length} Profiles)
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {presets.map((p) => (
                  <button
                    key={p.preset_id}
                    className="btn btn-sm"
                    onClick={() => applyPreset(p)}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="sim-engine-id">Target Engine ID</label>
              <input
                id="sim-engine-id"
                className="input-control mono"
                value={config.engine_id}
                onChange={(e) =>
                  setConfig({ ...config, engine_id: e.target.value })
                }
              />
              <span className="form-hint">
                Active fleet engine or custom test identifier
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="sim-mission-id">Mission Identifier</label>
              <input
                id="sim-mission-id"
                className="input-control mono"
                value={config.mission_id}
                onChange={(e) =>
                  setConfig({ ...config, mission_id: e.target.value })
                }
              />
              <span className="form-hint">
                Persisted in SQLite mission store for replay
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="sim-profile">Mission Operating Profile</label>
              <select
                id="sim-profile"
                className="select-control"
                value={config.mission_profile}
                onChange={(e) =>
                  setConfig({ ...config, mission_profile: e.target.value })
                }
              >
                <option value="normal_mission">Normal Cruise Mission</option>
                <option value="high_altitude">High-Altitude Operation</option>
                <option value="hot_weather">Hot-Weather Operation</option>
                <option value="long_endurance">Long-Duration Endurance</option>
                <option value="rapid_throttle">
                  Rapid Throttle Transitions
                </option>
                <option value="controlled_fault_injection">
                  Controlled Fault Injection
                </option>
                <option value="historical_replay">
                  Historical Mission Replay
                </option>
              </select>
              <span className="form-hint">
                Sets baseline atmospheric and throttle schedule
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 18,
              gap: 8,
            }}
          >
            <button
              className="btn btn-primary"
              onClick={() => setCurrentStep(2)}
            >
              Next: Operating Conditions & Fault <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: SELECT OPERATING CONDITIONS AND DIAGNOSTIC FAULT */}
      {currentStep === 2 && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Sliders size={14} /> Step 2 — Select Operating Conditions &
              Diagnostic Fault Mode
            </div>
            <span className="badge badge-info">STEP 2 OF 6</span>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="sim-fault-class">
                Diagnostic Fault Class (9 Modes)
              </label>
              <select
                id="sim-fault-class"
                className="select-control"
                value={config.fault_class}
                onChange={(e) =>
                  setConfig({ ...config, fault_class: e.target.value })
                }
              >
                {faultClasses.map((fc) => (
                  <option key={fc} value={fc}>
                    {fc}
                  </option>
                ))}
              </select>
            </div>

            {config.fault_class === 'Sensor Fault' && (
              <>
                <div className="form-field">
                  <label htmlFor="sim-sf-submode">Sensor Fault Sub-Mode</label>
                  <select
                    id="sim-sf-submode"
                    className="select-control"
                    value={config.sensor_fault_submode}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sensor_fault_submode: e.target.value,
                      })
                    }
                  >
                    <option value="drift">Sensor Drift</option>
                    <option value="stuck_at">Stuck-At Flatline</option>
                    <option value="high_noise">High-Frequency Noise</option>
                    <option value="missing_samples">Missing Samples</option>
                    <option value="implausible_values">
                      Implausible Out-of-Range
                    </option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="sim-sf-channel">
                    Corrupted Sensor Channel
                  </label>
                  <select
                    id="sim-sf-channel"
                    className="select-control"
                    value={config.sensor_fault_channel}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sensor_fault_channel: e.target.value,
                      })
                    }
                  >
                    <option value="cht_c">cht_c (Cylinder Head Temp)</option>
                    <option value="egt_c">egt_c (Exhaust Gas Temp)</option>
                    <option value="oil_pressure_bar">
                      oil_pressure_bar (Oil Pressure)
                    </option>
                    <option value="vibration_rms_mms">
                      vibration_rms_mms (Vibration)
                    </option>
                  </select>
                </div>
              </>
            )}

            <div className="form-field">
              <label htmlFor="sim-alt">Base Altitude (m AMSL)</label>
              <input
                id="sim-alt"
                type="number"
                className="input-control mono"
                value={config.base_altitude_m}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    base_altitude_m: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="sim-amb">Ambient Temperature (°C)</label>
              <input
                id="sim-amb"
                type="number"
                className="input-control mono"
                value={config.base_ambient_temp_c}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    base_ambient_temp_c: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="sim-thr">Throttle Position (%)</label>
              <input
                id="sim-thr"
                type="number"
                className="input-control mono"
                value={config.base_throttle_pct}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    base_throttle_pct: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="sim-load">Engine Load (%)</label>
              <input
                id="sim-load"
                type="number"
                className="input-control mono"
                value={config.base_load_pct}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    base_load_pct: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          {catalog?.fault_signal_transformations?.[config.fault_class] && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(56, 189, 248, 0.06)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 4,
                fontSize: 12,
                color: '#cbd5e1',
              }}
            >
              <strong>
                Physics Transfer Function ({config.fault_class}):
              </strong>{' '}
              {
                catalog.fault_signal_transformations[config.fault_class]
                  .description
              }
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 18,
            }}
          >
            <button className="btn" onClick={() => setCurrentStep(1)}>
              <ArrowLeft size={13} /> Back: Engine & Profile
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setCurrentStep(3)}
            >
              Next: Severity & Onset <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CONFIGURE FAULT SEVERITY AND ONSET (WITH PROGRESSIVE DISCLOSURE) */}
      {currentStep === 3 && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Sliders size={14} /> Step 3 — Configure Fault Severity & Onset
              Timing
            </div>
            <span className="badge badge-info">STEP 3 OF 6</span>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="sim-severity">
                Fault Severity Magnitude (0.00 – 1.00)
              </label>
              <input
                id="sim-severity"
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="input-control mono"
                value={config.severity}
                onChange={(e) =>
                  setConfig({ ...config, severity: Number(e.target.value) })
                }
              />
              <span className="form-hint">
                0.0 = Nominal, 0.5 = Moderate, 0.85+ = Severe Fault
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="sim-onset">Fault Onset Time (sec)</label>
              <input
                id="sim-onset"
                type="number"
                className="input-control mono"
                value={config.onset_time_sec}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    onset_time_sec: Number(e.target.value),
                  })
                }
              />
              <span className="form-hint">
                Timestamp when fault injection begins (t=0..{config.duration_sec}s)
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="sim-duration">Mission Duration (sec)</label>
              <input
                id="sim-duration"
                type="number"
                className="input-control mono"
                value={config.duration_sec}
                onChange={(e) =>
                  setConfig({ ...config, duration_sec: Number(e.target.value) })
                }
              />
              <span className="form-hint">
                Total simulated mission horizon in seconds
              </span>
            </div>
          </div>

          {/* Progressive Disclosure for Advanced Reproducibility Settings */}
          <div style={{ marginTop: 14 }}>
            <button
              className="btn btn-sm"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? (
                <>
                  <ChevronUp size={12} /> Hide Advanced Reproducibility Controls
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Show Advanced Reproducibility
                  Controls (Seed & Sampling)
                </>
              )}
            </button>

            {showAdvanced && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <div className="form-field">
                  <label htmlFor="sim-seed">Deterministic Random Seed</label>
                  <input
                    id="sim-seed"
                    type="number"
                    className="input-control mono"
                    value={config.random_seed}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        random_seed: Number(e.target.value),
                      })
                    }
                  />
                  <span className="form-hint">
                    Identical seed guarantees bit-for-bit reproducible output
                  </span>
                </div>
                <div className="form-field">
                  <label htmlFor="sim-interval">Sample Interval (sec)</label>
                  <input
                    id="sim-interval"
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="10"
                    className="input-control mono"
                    value={config.sample_interval_sec}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        sample_interval_sec: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="sim-scen-id">Scenario ID</label>
                  <input
                    id="sim-scen-id"
                    className="input-control mono"
                    value={config.scenario_id}
                    onChange={(e) =>
                      setConfig({ ...config, scenario_id: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 18,
            }}
          >
            <button className="btn" onClick={() => setCurrentStep(2)}>
              <ArrowLeft size={13} /> Back: Conditions & Fault
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setCurrentStep(4)}
            >
              Next: Review Scenario Summary <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW CONCISE SCENARIO SUMMARY */}
      {currentStep === 4 && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <CheckCircle2 size={14} /> Step 4 — Concise Scenario Configuration
              Summary
            </div>
            <span className="badge badge-info">STEP 4 OF 6</span>
          </div>

          <div className="grid-3">
            <div
              style={{
                background: 'rgba(0,0,0,0.22)',
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="kpi-label">1. Target & Profile</div>
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div>
                  Engine ID: <strong>{config.engine_id}</strong>
                </div>
                <div>
                  Mission ID: <strong>{config.mission_id}</strong>
                </div>
                <div>
                  Profile: <strong>{config.mission_profile}</strong>
                </div>
                <div>
                  Random Seed: <strong>{config.random_seed}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0,0,0,0.22)',
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="kpi-label">2. Operating Envelope</div>
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div>
                  Altitude: <strong>{config.base_altitude_m} m AMSL</strong>
                </div>
                <div>
                  Ambient Temp: <strong>{config.base_ambient_temp_c} °C</strong>
                </div>
                <div>
                  Throttle: <strong>{config.base_throttle_pct}%</strong>
                </div>
                <div>
                  Engine Load: <strong>{config.base_load_pct}%</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(0,0,0,0.22)',
                padding: 12,
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="kpi-label">3. Fault Injection</div>
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.8 }}>
                <div>
                  Fault Class:{' '}
                  <strong style={{ color: '#38bdf8' }}>
                    {config.fault_class}
                  </strong>
                </div>
                <div>
                  Severity: <strong>{config.severity.toFixed(2)}</strong>
                </div>
                <div>
                  Onset / Duration:{' '}
                  <strong>
                    t = {config.onset_time_sec}s / {config.duration_sec}s
                  </strong>
                </div>
                <div>
                  Subsystem: <strong>{mapFaultToSubsystemName(config.fault_class).split('·')[0]}</strong>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 18,
            }}
          >
            <button className="btn" onClick={() => setCurrentStep(3)}>
              <ArrowLeft size={13} /> Back: Severity & Onset
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setCurrentStep(5)}
            >
              Proceed to Step 5: Execute Simulation <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: EXECUTE DETERMINISTIC SIMULATION */}
      {currentStep === 5 && (
        <div className="panel-card" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ maxWidth: 580, margin: '0 auto' }}>
            <span className="badge badge-info" style={{ marginBottom: 10 }}>
              STEP 5 OF 6 · READY FOR EXECUTION
            </span>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#ffffff',
                marginBottom: 8,
              }}
            >
              Execute Deterministic Digital Twin Simulation
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 12.5, marginBottom: 18 }}>
              Running this scenario will generate{' '}
              <strong>
                {Math.round(config.duration_sec / config.sample_interval_sec)}
              </strong>{' '}
              telemetry frames for <strong>{config.engine_id}</strong> with
              fault mode <strong>{config.fault_class}</strong> (severity{' '}
              {config.severity}, seed {config.random_seed}), evaluate every
              frame through the physics reference model and 9-class ML ensemble,
              and persist the resulting mission and engineering report.
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button className="btn" onClick={() => setCurrentStep(4)}>
                <ArrowLeft size={13} /> Back to Summary
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRunSimulation}
                disabled={running}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                <Play size={14} />{' '}
                {running
                  ? 'Executing Deterministic Simulation…'
                  : 'Run Deterministic Simulation Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: PRESENT RESULTS WITH BASELINE-VS-SCENARIO COMPARISON, PARAMETER TRENDS, FAULT DIAGNOSIS & HEALTH IMPACT */}
      {currentStep === 6 && (
        <div>
          {!simResult ? (
            <div className="panel-card">
              <div style={{ color: '#94a3b8', marginBottom: 12 }}>
                No simulation has been executed in this session yet. Click below
                to run the configured scenario and inspect Baseline-vs-Scenario
                results.
              </div>
              <button
                className="btn btn-primary"
                onClick={handleRunSimulation}
                disabled={running}
              >
                <Play size={13} />{' '}
                {running ? 'Executing…' : 'Execute Configured Simulation'}
              </button>
            </div>
          ) : (
            <div className="panel-card" style={{ borderColor: '#38bdf8' }}>
              <div className="panel-card-header">
                <div className="panel-card-title" style={{ color: '#38bdf8' }}>
                  Step 6 — Simulation Execution Results & Baseline Comparison:{' '}
                  {simResult.simulation_id} (Report: {simResult.report_id})
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="badge badge-nominal">
                    COMPLETED & PERSISTED
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => setCurrentStep(1)}
                  >
                    Configure New Scenario
                  </button>
                </div>
              </div>

              {/* 4 SUMMARY KPI CARDS */}
              <div className="grid-4">
                <div className="kpi-card info">
                  <div className="kpi-label">Generated Frames</div>
                  <div className="kpi-value sm">
                    {simResult.summary.total_frames} Frames
                  </div>
                  <div className="kpi-sub">
                    Throughput: {simResult.summary.processing_throughput_fps} fps
                  </div>
                </div>

                <div className="kpi-card caution">
                  <div className="kpi-label">Final Predicted Fault Class</div>
                  <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
                    {simResult.summary.final_predicted_class}
                  </div>
                  <div className="kpi-sub">
                    Confidence:{' '}
                    {(simResult.summary.final_top_probability * 100).toFixed(1)}%
                  </div>
                </div>

                <div className="kpi-card critical">
                  <div className="kpi-label">Health Index Impact</div>
                  <div className="kpi-value sm">
                    {simResult.summary.initial_health_index.toFixed(1)}% →{' '}
                    {simResult.summary.final_health_index.toFixed(1)}%
                  </div>
                  <div className="kpi-sub">
                    Alerts Triggered: {simResult.summary.alert_count}
                  </div>
                </div>

                <div className="kpi-card info">
                  <div className="kpi-label">Post-Scenario RUL Estimate</div>
                  <div className="kpi-value sm">
                    {simResult.summary.final_rul_status === 'ESTIMATED' &&
                    simResult.summary.final_rul_hours !== null
                      ? `${simResult.summary.final_rul_hours.toFixed(1)} hrs`
                      : 'NOT ESTIMABLE'}
                  </div>
                  <div className="kpi-sub">
                    Mean Latency: {simResult.summary.mean_frame_latency_ms} ms
                  </div>
                </div>
              </div>

              {/* 3D VIEWPORT OF FINAL SCENARIO STATE */}
              <div style={{ marginBottom: 14 }}>
                <Engine3DViewport compact twinState={simResult.latest_state} />
              </div>

              {/* BASELINE VS SCENARIO OUTCOME COMPARISON TABLE */}
              {simResult.latest_state && (
                <div style={{ marginBottom: 14 }}>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>
                    Baseline (Nominal Physics Reference / Initial State) vs.
                    Post-Scenario Outcome Comparison
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table mono" style={{ fontSize: 11.5 }}>
                      <thead>
                        <tr>
                          <th>Parameter / Metric</th>
                          <th>Baseline / Physics Expected</th>
                          <th>Scenario Final Measured</th>
                          <th>Residual / Health Impact Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Cylinder Head Temp (CHT)</td>
                          <td>
                            {simResult.latest_state.expected.cht_c.toFixed(1)} °C
                          </td>
                          <td>
                            {simResult.latest_state.actual.cht_c.toFixed(1)} °C
                          </td>
                          <td style={{ color: '#fbbf24', fontWeight: 700 }}>
                            {simResult.latest_state.calculated.cht_residual_c >=
                            0
                              ? '+'
                              : ''}
                            {simResult.latest_state.calculated.cht_residual_c.toFixed(
                              2
                            )}{' '}
                            °C (Peak |Δ|:{' '}
                            {simResult.summary.peak_abs_cht_residual_c} °C)
                          </td>
                        </tr>
                        <tr>
                          <td>Exhaust Gas Temp (EGT)</td>
                          <td>
                            {simResult.latest_state.expected.egt_c.toFixed(1)} °C
                          </td>
                          <td>
                            {simResult.latest_state.actual.egt_c.toFixed(1)} °C
                          </td>
                          <td>
                            {simResult.latest_state.calculated.egt_residual_c >=
                            0
                              ? '+'
                              : ''}
                            {simResult.latest_state.calculated.egt_residual_c.toFixed(
                              2
                            )}{' '}
                            °C
                          </td>
                        </tr>
                        <tr>
                          <td>Oil Pressure</td>
                          <td>
                            {simResult.latest_state.expected.oil_pressure_bar.toFixed(
                              2
                            )}{' '}
                            bar
                          </td>
                          <td>
                            {simResult.latest_state.actual.oil_pressure_bar.toFixed(
                              2
                            )}{' '}
                            bar
                          </td>
                          <td>
                            {simResult.latest_state.calculated
                              .oil_pressure_residual_bar >= 0
                              ? '+'
                              : ''}
                            {simResult.latest_state.calculated.oil_pressure_residual_bar.toFixed(
                              3
                            )}{' '}
                            bar
                          </td>
                        </tr>
                        <tr>
                          <td>Vibration RMS</td>
                          <td>
                            {simResult.latest_state.expected.vibration_rms_mms.toFixed(
                              2
                            )}{' '}
                            mm/s
                          </td>
                          <td>
                            {simResult.latest_state.actual.vibration_rms_mms.toFixed(
                              2
                            )}{' '}
                            mm/s
                          </td>
                          <td>
                            {simResult.latest_state.calculated
                              .vibration_residual_mms >= 0
                              ? '+'
                              : ''}
                            {simResult.latest_state.calculated.vibration_residual_mms.toFixed(
                              3
                            )}{' '}
                            mm/s
                          </td>
                        </tr>
                        <tr>
                          <td>Composite Health Index (HI)</td>
                          <td>
                            {simResult.summary.initial_health_index.toFixed(1)}%
                            (t = 0s)
                          </td>
                          <td>
                            {simResult.summary.final_health_index.toFixed(1)}% (t
                            = end)
                          </td>
                          <td style={{ color: '#f87171', fontWeight: 700 }}>
                            {(
                              simResult.summary.final_health_index -
                              simResult.summary.initial_health_index
                            ).toFixed(1)}
                            %
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PARAMETER TRENDS ACROSS SIMULATED MISSION */}
              {simTrendData.length > 0 && (
                <div className="grid-2">
                  <div className="panel-card" style={{ marginBottom: 0 }}>
                    <div className="panel-card-header">
                      <div className="panel-card-title">
                        <Activity size={13} /> Scenario Thermal Response: Actual
                        vs Baseline CHT (°C)
                      </div>
                    </div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simTrendData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#1a2440"
                          />
                          <XAxis
                            dataKey="elapsed"
                            stroke="#8899bb"
                            unit="s"
                          />
                          <YAxis
                            stroke="#8899bb"
                            domain={['auto', 'auto']}
                            unit="°C"
                          />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="cht_actual"
                            name="Scenario CHT (°C)"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="cht_expected"
                            name="Baseline Expected CHT (°C)"
                            stroke="#22c55e"
                            strokeDasharray="4 4"
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="panel-card" style={{ marginBottom: 0 }}>
                    <div className="panel-card-header">
                      <div className="panel-card-title">
                        <Activity size={13} /> Scenario Health Index & Vibration
                        Trajectory
                      </div>
                    </div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simTrendData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#1a2440"
                          />
                          <XAxis
                            dataKey="elapsed"
                            stroke="#8899bb"
                            unit="s"
                          />
                          <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                          <Tooltip />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="hi"
                            name="Health Index (%)"
                            stroke="#fbbf24"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="vib_actual"
                            name="Vibration RMS (mm/s)"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* =========================================================================
   SCREEN 6: HISTORICAL MISSION REPLAY (SYNCHRONIZED 3D + CHARTS + ALERTS)
   ========================================================================= */
export const HistoricalMissionReplayScreen: React.FC<{
  missions: Record<string, any>[];
}> = ({ missions }) => {
  const [selectedMissionId, setSelectedMissionId] = useState<string>(
    missions[0]?.mission_id || 'MSN-DESERT-102'
  );
  const [snapshot, setSnapshot] = useState<ReplaySnapshot | null>(null);
  const [speed, setSpeed] = useState<number>(1.0);
  const [playingLocal, setPlayingLocal] = useState<boolean>(false);

  useEffect(() => {
    drishtiApi
      .getReplayStatus()
      .then((s) => {
        if (s && s.mission_id) {
          setSnapshot(s);
          setSelectedMissionId(s.mission_id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!playingLocal) return;
    const intervalMs = Math.max(120, Math.round(600 / speed));
    const timer = setInterval(async () => {
      try {
        const nextSnap = await drishtiApi.stepReplay(1);
        setSnapshot(nextSnap);
        if (
          !nextSnap.is_playing ||
          nextSnap.current_index >= nextSnap.total_frames - 1
        ) {
          setPlayingLocal(false);
        }
      } catch {
        setPlayingLocal(false);
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [playingLocal, speed]);

  const handleLoadAndStart = async (startIdx = 0, autoPlay = true) => {
    const snap = await drishtiApi.startReplay(
      selectedMissionId,
      speed,
      startIdx
    );
    setSnapshot(snap);
    setPlayingLocal(autoPlay);
  };

  const handlePause = async () => {
    setPlayingLocal(false);
    const snap = await drishtiApi.stopReplay();
    setSnapshot(snap);
  };

  const handleSeekIndex = async (idx: number) => {
    const snap = await drishtiApi.seekReplay({
      target_index: idx,
      playback_speed: speed,
    });
    setSnapshot(snap);
  };

  const handleStep = async () => {
    setPlayingLocal(false);
    const snap = await drishtiApi.stepReplay(1);
    setSnapshot(snap);
  };

  const syncHistory = snapshot?.synchronized_history || [];
  const chartData = syncHistory.map((t) => ({
    seq: t.sequence_number,
    elapsed: t.mission_elapsed_sec,
    cht_actual: t.actual.cht_c,
    cht_expected: t.expected.cht_c,
    oil_p_actual: t.actual.oil_pressure_bar,
    oil_p_expected: t.expected.oil_pressure_bar,
    vib_actual: t.actual.vibration_rms_mms,
    hi: t.predicted.health_index,
  }));

  const cur = snapshot?.current_state || null;

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Operations · Synchronized Mission Timeline Playback
          </div>
          <h1 className="screen-title">
            Historical Mission Replay — 3D Twin, Telemetry & Alerts
          </h1>
          <div className="screen-desc">
            Deterministic mission playback with play, pause, restart, timestamp
            seek, adjustable speed, and synchronized 3D subsystem highlighting.
          </div>
        </div>
        <div className="screen-actions">
          <select
            className="select-control"
            value={selectedMissionId}
            onChange={(e) => setSelectedMissionId(e.target.value)}
            aria-label="Select Mission to Replay"
          >
            {missions.map((m) => (
              <option key={m.mission_id} value={m.mission_id}>
                {m.mission_id} — {m.engine_id} ({m.fault_class})
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => handleLoadAndStart(0, true)}
          >
            <Play size={13} /> Load & Play Mission
          </button>
        </div>
      </div>

      {/* Playback Transport Bar */}
      <div className="panel-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          {playingLocal ? (
            <button className="btn btn-danger" onClick={handlePause}>
              <Pause size={13} /> Pause
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() =>
                handleLoadAndStart(snapshot?.current_index || 0, true)
              }
            >
              <Play size={13} /> Play
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              setPlayingLocal(false);
              handleLoadAndStart(0, false);
            }}
          >
            Restart (t=0s)
          </button>
          <button className="btn" onClick={handleStep}>
            <StepForward size={13} /> Step +1 Frame
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FastForward size={13} />
            <span className="mono" style={{ fontSize: 11 }}>
              Speed:
            </span>
            {[0.5, 1.0, 2.0, 4.0].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${speed === s ? 'btn-primary' : ''}`}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="mono" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            Position:{' '}
            <strong>
              Frame {(snapshot?.current_index ?? 0) + 1} /{' '}
              {snapshot?.total_frames ?? 0}
            </strong>{' '}
            |{' '}
            <strong>
              t = {(snapshot?.current_elapsed_sec ?? 0).toFixed(1)}s
            </strong>{' '}
            | {snapshot?.current_timestamp || '—'}
          </div>
        </div>

        <input
          type="range"
          aria-label="Replay Timeline Seek"
          min={0}
          max={Math.max(0, (snapshot?.total_frames || 1) - 1)}
          value={snapshot?.current_index || 0}
          onChange={(e) => handleSeekIndex(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#38bdf8' }}
        />
      </div>

      {/* SYNCHRONIZED 3D ENGINE VIEWPORT AT REPLAY CURSOR */}
      <div style={{ marginBottom: 14 }}>
        <Engine3DViewport compact twinState={cur} />
      </div>

      {cur && (
        <div className="grid-4">
          <div className="kpi-card info">
            <div className="kpi-label">Replay Timestamp</div>
            <div className="kpi-value sm" style={{ fontSize: 14 }}>
              {cur.timestamp}
            </div>
            <div className="kpi-sub">
              Seq #{cur.sequence_number} | Elapsed:{' '}
              {cur.mission_elapsed_sec.toFixed(1)}s
            </div>
          </div>
          <div className="kpi-card info">
            <div className="kpi-label">Actual vs Expected CHT</div>
            <div className="kpi-value sm">
              {cur.actual.cht_c.toFixed(1)} °C / {cur.expected.cht_c.toFixed(1)}{' '}
              °C
            </div>
            <div className="kpi-sub">
              Residual: {cur.calculated.cht_residual_c >= 0 ? '+' : ''}
              {cur.calculated.cht_residual_c.toFixed(2)} °C
            </div>
          </div>
          <div className="kpi-card caution">
            <div className="kpi-label">Predicted Fault at Cursor</div>
            <div className="kpi-value sm" style={{ color: '#38bdf8' }}>
              {cur.predicted.predicted_fault_class}
            </div>
            <div className="kpi-sub">
              Confidence: {(cur.predicted.top_probability * 100).toFixed(1)}%
            </div>
          </div>
          <div className="kpi-card nominal">
            <div className="kpi-label">Health Index & RUL at Cursor</div>
            <div className="kpi-value sm">
              HI: {cur.predicted.health_index.toFixed(1)}%
            </div>
            <div className="kpi-sub">
              RUL:{' '}
              {cur.predicted.rul_status === 'ESTIMATED' &&
              cur.predicted.rul_hours !== null
                ? `${cur.predicted.rul_hours.toFixed(1)} hrs`
                : 'NOT ESTIMABLE'}
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Synchronized Replay Telemetry (t = 0s →{' '}
              {(snapshot?.current_elapsed_sec ?? 0).toFixed(1)}s)
            </div>
          </div>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cht_actual"
                  name="Actual CHT (°C)"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="cht_expected"
                  name="Expected CHT (°C)"
                  stroke="#22c55e"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="hi"
                  name="Health Index (%)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <AlertTriangle size={14} /> Synchronized Alert Timeline up to Seq
              #{cur?.sequence_number ?? 0} (
              {snapshot?.synchronized_alerts.length ?? 0} /{' '}
              {snapshot?.all_mission_alerts.length ?? 0} Alerts)
            </div>
          </div>
          <div style={{ maxHeight: 230, overflowY: 'auto' }}>
            {(snapshot?.synchronized_alerts || []).length === 0 ? (
              <div style={{ color: '#94a3b8' }}>
                No alerts triggered up to current playback timestamp (t ={' '}
                {(snapshot?.current_elapsed_sec ?? 0).toFixed(1)}s). Advance the
                timeline past fault onset to observe alert triggers.
              </div>
            ) : (
              (snapshot?.synchronized_alerts || [])
                .slice()
                .reverse()
                .map((alt) => (
                  <div
                    key={alt.alert_id}
                    className={`alert-box ${alt.severity.toLowerCase()}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <strong>
                        Seq #{alt.sequence_number} — {alt.fault_class}
                      </strong>
                      <span className={statusBadgeClass(alt.severity)}>
                        {alt.severity}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#cbd5e1' }}>
                      {alt.supporting_evidence[0]}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
