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
  AlertTriangle,
  CheckCircle2,
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
  if (!latestState) {
    return (
      <div className="panel-card">
        No diagnostic state available for {engineId}.
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

  const handleAck = async (alertId: string, curAck: boolean) => {
    await drishtiApi.acknowledgeAlert(alertId, !curAck);
    await onRefreshEngine();
  };

  return (
    <div>
      <div className="screen-header">
        <div>
          <div className="screen-title">
            Fault Investigation & Sensor-Fault Isolation — {engineId}
          </div>
          <div className="screen-desc">
            9-Class Random Forest posterior probability distribution,
            IsolationForest anomaly scoring, dedicated Sensor-Fault Isolator,
            and explainable maintenance decision support.
          </div>
        </div>
        <span className="badge badge-synthetic">
          DECISION SUPPORT ONLY — NOT CERTIFIED FLIGHT RELEASE
        </span>
      </div>

      <div className="grid-3">
        <div className="panel-card">
          <div className="kpi-label">Primary Diagnostic Classification</div>
          <div className="kpi-value" style={{ color: '#38bdf8', fontSize: 18 }}>
            {latestState.predicted.predicted_fault_class}
          </div>
          <div className="kpi-sub">
            Confidence: {(latestState.predicted.top_probability * 100).toFixed(1)}%
            | Certainty: {latestState.predicted.diagnosis_certainty_status}
          </div>
        </div>

        <div className="panel-card">
          <div className="kpi-label">Independent Anomaly Detector</div>
          <div
            className="kpi-value"
            style={{
              color: latestState.predicted.is_anomaly ? '#fbbf24' : '#34d399',
            }}
          >
            {latestState.predicted.is_anomaly ? 'ANOMALY ACTIVE' : 'NOMINAL'}
          </div>
          <div className="kpi-sub">
            Score: {latestState.predicted.anomaly_score.toFixed(3)} vs Calibrated
            Threshold: {latestState.predicted.anomaly_threshold.toFixed(3)}
          </div>
        </div>

        <div className="panel-card">
          <div className="kpi-label">Sensor vs Engine Fault Isolation</div>
          <div
            className="kpi-value"
            style={{
              fontSize: 16,
              color: sDiag.is_sensor_fault_detected
                ? '#f59e0b'
                : sDiag.is_ambiguous
                ? '#fb923c'
                : '#34d399',
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
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              9-Class Fault Classifier Probability Distribution (%)
            </div>
          </div>
          <div style={{ height: 245 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={probData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" unit="%" />
                <YAxis
                  type="category"
                  dataKey="fault_class"
                  width={150}
                  stroke="#cbd5e1"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#2a3d60',
                  }}
                />
                <Bar
                  dataKey="probability_pct"
                  name="Class Probability (%)"
                  fill="#38bdf8"
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
          <table className="eng-table mono">
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

      {/* SIH26054 OFFICIAL 8-FAULT-CATEGORY EVIDENCE MAPPING */}
      {catalog?.sih26054_eight_fault_categories && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Info size={13} /> SIH26054 Official 8-Fault-Category Evidence & Detection Pathway Matrix
            </div>
            <span className="badge badge-info">ALL 8 INTENDED FAULT CATEGORIES MAPPED</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="eng-table mono" style={{ fontSize: 10.5 }}>
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
        <div className="mono" style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.65 }}>
          <div>
            • <strong>“Coding Degradation” → Cooling Degradation Interpretation:</strong>{' '}
            The official SIH26054 text lists “Coding degradation” among propulsion faults.
            In aero-piston thermodynamics, this is documented and modeled as{' '}
            <strong>Cooling Degradation</strong> (cooling baffle obstruction / fin fouling
            reducing heat rejection efficiency η_cool and driving positive CHT/Oil-T residuals).
          </div>
          <div>
            • <strong>Aggregate Sensor Scope:</strong> Telemetry schema v1.0.0
            provides single-channel engine CHT, EGT, Oil P/T, and Vibration RMS.
            Faults cannot be localized to a specific cylinder (#1–#4) without
            per-cylinder thermocouple instrumentation.
          </div>
          <div>
            • <strong>Correlation vs. Causation & Anomaly vs. Confirmed Fault:</strong>{' '}
            IsolationForest anomaly triggers indicate statistical residual deviation from
            the physics reference baseline; physical fault confirmation requires the
            recommended borescope/mechanical inspection action below.
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Wrench size={14} /> Explainable Alert Log & Decision-Support
            Recommendations ({alerts.length} Alerts)
          </div>
        </div>
        {alerts.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>
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
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={statusBadgeClass(alt.severity)}>
                    {alt.severity}
                  </span>
                  <strong className="mono">{alt.alert_id}</strong>
                  <span>|</span>
                  <strong>{alt.fault_class}</strong>
                  <span className="badge badge-info">{alt.anomaly_type}</span>
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
                    className="btn"
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
                <strong>Model & Score:</strong> {alt.score_label} |{' '}
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
                <strong>Decision-Support Inspection Action:</strong>{' '}
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
    </div>
  );
};

/* =========================================================================
   SCREEN 5: MISSION & FAULT SIMULATOR (SYNCHRONIZED WITH 3D STATE)
   ========================================================================= */
export const MissionSimulatorScreen: React.FC<{
  selectedEngineId: string;
  catalog: Record<string, any> | null;
  onSimulationCompleted: (
    engineId: string,
    missionId: string,
    reportId: string
  ) => Promise<void>;
}> = ({ selectedEngineId, catalog, onSimulationCompleted }) => {
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

  return (
    <div>
      <div className="screen-header">
        <div>
          <div className="screen-title">
            Deterministic Mission & 9-Class Fault Simulator
          </div>
          <div className="screen-desc">
            Configure operating conditions, mission profile, fault class, onset
            time, severity, and random seed. Synchronizes directly with the 3D
            Digital Twin and SQLite mission store.
          </div>
        </div>
        <span className="badge badge-synthetic">
          SYNTHETIC SCENARIO GENERATOR
        </span>
      </div>

      {/* Preset Quick-Load Bar */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Sliders size={13} /> Mission Scenario Presets (7 Profiles)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {presets.map((p) => (
            <button
              key={p.preset_id}
              className="btn"
              onClick={() => applyPreset(p)}
            >
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Scenario Configuration Parameters
          </div>
          <button
            className="btn btn-primary"
            onClick={handleRunSimulation}
            disabled={running}
          >
            <Play size={13} />{' '}
            {running
              ? 'Running Deterministic Simulation...'
              : 'Execute Deterministic Simulation'}
          </button>
        </div>

        <div className="form-grid">
          <div className="form-field">
            <label>Target Engine ID</label>
            <input
              className="input-control mono"
              value={config.engine_id}
              onChange={(e) =>
                setConfig({ ...config, engine_id: e.target.value })
              }
            />
          </div>
          <div className="form-field">
            <label>Mission ID</label>
            <input
              className="input-control mono"
              value={config.mission_id}
              onChange={(e) =>
                setConfig({ ...config, mission_id: e.target.value })
              }
            />
          </div>
          <div className="form-field">
            <label>Mission Profile</label>
            <select
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
              <option value="rapid_throttle">Rapid Throttle Transitions</option>
              <option value="controlled_fault_injection">
                Controlled Fault Injection
              </option>
              <option value="historical_replay">
                Historical Mission Replay
              </option>
            </select>
          </div>
          <div className="form-field">
            <label>Diagnostic Fault Class (9 Classes)</label>
            <select
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
                <label>Sensor Fault Sub-Mode</label>
                <select
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
                <label>Corrupted Sensor Channel</label>
                <select
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
            <label>Fault Onset Time (sec)</label>
            <input
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
          </div>
          <div className="form-field">
            <label>Mission Duration (sec)</label>
            <input
              type="number"
              className="input-control mono"
              value={config.duration_sec}
              onChange={(e) =>
                setConfig({ ...config, duration_sec: Number(e.target.value) })
              }
            />
          </div>
          <div className="form-field">
            <label>Fault Severity (0.0 – 1.0)</label>
            <input
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
          </div>
          <div className="form-field">
            <label>Deterministic Random Seed</label>
            <input
              type="number"
              className="input-control mono"
              value={config.random_seed}
              onChange={(e) =>
                setConfig({ ...config, random_seed: Number(e.target.value) })
              }
            />
          </div>
          <div className="form-field">
            <label>Base Altitude (m AMSL)</label>
            <input
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
            <label>Ambient Temperature (°C)</label>
            <input
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
            <label>Throttle Position (%)</label>
            <input
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
            <label>Engine Load (%)</label>
            <input
              type="number"
              className="input-control mono"
              value={config.base_load_pct}
              onChange={(e) =>
                setConfig({ ...config, base_load_pct: Number(e.target.value) })
              }
            />
          </div>
        </div>

        {catalog?.fault_signal_transformations?.[config.fault_class] && (
          <div
            style={{
              marginTop: 10,
              padding: '7px 10px',
              background: 'rgba(10, 15, 29, 0.8)',
              borderRadius: 3,
              fontSize: 11.5,
              color: '#cbd5e1',
            }}
          >
            <strong>
              Documented Signal Transformation ({config.fault_class}):
            </strong>{' '}
            {
              catalog.fault_signal_transformations[config.fault_class]
                .description
            }
          </div>
        )}
      </div>

      {simError && (
        <div className="alert-box critical">
          <strong>Simulation Error:</strong> {simError}
        </div>
      )}

      {simResult && (
        <div className="panel-card" style={{ borderColor: '#38bdf8' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#38bdf8' }}>
              Simulation Execution Result & 3D State — {simResult.simulation_id}{' '}
              (Report: {simResult.report_id})
            </div>
            <span className="badge badge-nominal">COMPLETED & PERSISTED</span>
          </div>
          <div className="grid-4">
            <div>
              <div className="kpi-label">Generated Frames</div>
              <div className="kpi-value">{simResult.summary.total_frames}</div>
              <div className="kpi-sub">
                Throughput: {simResult.summary.processing_throughput_fps} fps
              </div>
            </div>
            <div>
              <div className="kpi-label">Final Predicted Class</div>
              <div
                className="kpi-value"
                style={{ fontSize: 16, color: '#38bdf8' }}
              >
                {simResult.summary.final_predicted_class}
              </div>
              <div className="kpi-sub">
                Prob:{' '}
                {(simResult.summary.final_top_probability * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="kpi-label">Health Index Trajectory</div>
              <div className="kpi-value">
                {simResult.summary.initial_health_index.toFixed(1)}% →{' '}
                {simResult.summary.final_health_index.toFixed(1)}%
              </div>
              <div className="kpi-sub">
                Alerts Triggered: {simResult.summary.alert_count}
              </div>
            </div>
            <div>
              <div className="kpi-label">Final RUL Estimate</div>
              <div className="kpi-value" style={{ fontSize: 17 }}>
                {simResult.summary.final_rul_status === 'ESTIMATED' &&
                simResult.summary.final_rul_hours !== null
                  ? `${simResult.summary.final_rul_hours.toFixed(1)} hrs`
                  : 'NOT ESTIMABLE'}
              </div>
              <div className="kpi-sub">
                Mean Frame Latency: {simResult.summary.mean_frame_latency_ms} ms
              </div>
            </div>
          </div>

          <Engine3DViewport compact twinState={simResult.latest_state} />

          {/* BASELINE VS SCENARIO OUTCOME COMPARISON TABLE */}
          {simResult.latest_state && (
            <div style={{ marginTop: 12 }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>
                Baseline (Nominal Physics Reference / Initial State) vs. Post-Scenario Outcome Comparison
              </div>
              <table className="eng-table mono" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Parameter / Metric</th>
                    <th>Baseline / Physics Expected</th>
                    <th>Scenario Final Measured</th>
                    <th>Residual / Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Cylinder Head Temp (CHT)</td>
                    <td>{simResult.latest_state.expected.cht_c.toFixed(1)} °C</td>
                    <td>{simResult.latest_state.actual.cht_c.toFixed(1)} °C</td>
                    <td style={{ color: '#f59e0b', fontWeight: 700 }}>
                      {simResult.latest_state.calculated.cht_residual_c >= 0 ? '+' : ''}
                      {simResult.latest_state.calculated.cht_residual_c.toFixed(2)} °C (Peak |Δ|:{' '}
                      {simResult.summary.peak_abs_cht_residual_c} °C)
                    </td>
                  </tr>
                  <tr>
                    <td>Exhaust Gas Temp (EGT)</td>
                    <td>{simResult.latest_state.expected.egt_c.toFixed(1)} °C</td>
                    <td>{simResult.latest_state.actual.egt_c.toFixed(1)} °C</td>
                    <td>
                      {simResult.latest_state.calculated.egt_residual_c >= 0 ? '+' : ''}
                      {simResult.latest_state.calculated.egt_residual_c.toFixed(2)} °C
                    </td>
                  </tr>
                  <tr>
                    <td>Oil Pressure</td>
                    <td>{simResult.latest_state.expected.oil_pressure_bar.toFixed(2)} bar</td>
                    <td>{simResult.latest_state.actual.oil_pressure_bar.toFixed(2)} bar</td>
                    <td>
                      {simResult.latest_state.calculated.oil_pressure_residual_bar >= 0 ? '+' : ''}
                      {simResult.latest_state.calculated.oil_pressure_residual_bar.toFixed(3)} bar
                    </td>
                  </tr>
                  <tr>
                    <td>Vibration RMS</td>
                    <td>{simResult.latest_state.expected.vibration_rms_mms.toFixed(2)} mm/s</td>
                    <td>{simResult.latest_state.actual.vibration_rms_mms.toFixed(2)} mm/s</td>
                    <td>
                      {simResult.latest_state.calculated.vibration_residual_mms >= 0 ? '+' : ''}
                      {simResult.latest_state.calculated.vibration_residual_mms.toFixed(3)} mm/s
                    </td>
                  </tr>
                  <tr>
                    <td>Composite Health Index (HI)</td>
                    <td>{simResult.summary.initial_health_index.toFixed(1)}% (t = 0s)</td>
                    <td>{simResult.summary.final_health_index.toFixed(1)}% (t = end)</td>
                    <td style={{ color: '#fb7185', fontWeight: 700 }}>
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
        <div>
          <div className="screen-title">
            Historical Mission Replay — Synchronized 3D Twin, Telemetry & Alerts
          </div>
          <div className="screen-desc">
            Deterministic mission playback with play, pause, restart, timestamp
            seek, adjustable speed, and synchronized 3D subsystem highlighting.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            className="select-control"
            value={selectedMissionId}
            onChange={(e) => setSelectedMissionId(e.target.value)}
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
                className={`btn ${speed === s ? 'btn-primary' : ''}`}
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
          min={0}
          max={Math.max(0, (snapshot?.total_frames || 1) - 1)}
          value={snapshot?.current_index || 0}
          onChange={(e) => handleSeekIndex(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#38bdf8' }}
        />
      </div>

      {/* SYNCHRONIZED 3D ENGINE VIEWPORT AT REPLAY CURSOR */}
      <Engine3DViewport compact twinState={cur} />

      {cur && (
        <div className="grid-4">
          <div className="panel-card">
            <div className="kpi-label">Replay Timestamp</div>
            <div className="kpi-value" style={{ fontSize: 14 }}>
              {cur.timestamp}
            </div>
            <div className="kpi-sub">
              Seq #{cur.sequence_number} | Elapsed:{' '}
              {cur.mission_elapsed_sec.toFixed(1)}s
            </div>
          </div>
          <div className="panel-card">
            <div className="kpi-label">Actual vs Expected CHT</div>
            <div className="kpi-value" style={{ fontSize: 17 }}>
              {cur.actual.cht_c.toFixed(1)} °C / {cur.expected.cht_c.toFixed(1)}{' '}
              °C
            </div>
            <div className="kpi-sub">
              Residual: {cur.calculated.cht_residual_c >= 0 ? '+' : ''}
              {cur.calculated.cht_residual_c.toFixed(2)} °C
            </div>
          </div>
          <div className="panel-card">
            <div className="kpi-label">Predicted Fault at Cursor</div>
            <div className="kpi-value" style={{ fontSize: 16, color: '#38bdf8' }}>
              {cur.predicted.predicted_fault_class}
            </div>
            <div className="kpi-sub">
              Confidence: {(cur.predicted.top_probability * 100).toFixed(1)}%
            </div>
          </div>
          <div className="panel-card">
            <div className="kpi-label">Health Index & RUL at Cursor</div>
            <div className="kpi-value" style={{ fontSize: 17 }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="elapsed" stroke="#94a3b8" unit="s" />
                <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#2a3d60',
                  }}
                />
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
                  stroke="#10b981"
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
