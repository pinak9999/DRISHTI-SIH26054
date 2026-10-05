import React, { useEffect, useMemo, useState } from 'react';
import {
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
  Pause,
  Play,
  ShieldAlert,
  Sliders,
  StepForward,
} from 'lucide-react';
import { drishtiApi } from '../api/client';
import { Engine3DViewport } from '../components/Engine3DViewport';
import {
  EmptyState,
  GlassPanel,
  KpiTile,
  Scrubber,
  ScrubberMarker,
  SeverityBadge,
  Skeleton,
  StatusChip,
  SyntheticBadge,
} from '../components/ui';
import {
  ExplainableAlert,
  FaultScenarioConfig,
  FourValueDigitalTwinState,
  MissionPresetItem,
  MissionRecordItem,
  RESIDUAL_ALERT_THRESHOLDS,
  ReplaySnapshot,
  SimulationResultData,
  extractUnifiedDiagnosis,
} from '../types/telemetry';
import { statusBadgeClass } from './FleetAndTwinScreens';

export { FaultInvestigationScreen } from './faults/FaultInvestigationScreen';

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

function getAlertBoxSeverityClass(severity: string): string {
  const s = (severity || '').toUpperCase();
  if (s === 'CRITICAL') return 'alert-box critical';
  if (s === 'WARNING') return 'alert-box warning';
  if (s === 'CAUTION') return 'alert-box caution';
  return 'alert-box advisory';
}

function mapAlertSeverityToScrubber(
  severity: string
): 'nominal' | 'caution' | 'warning' | 'critical' {
  const s = (severity || '').toUpperCase();
  if (s === 'CRITICAL') return 'critical';
  if (s === 'WARNING') return 'warning';
  if (s === 'CAUTION') return 'caution';
  return 'nominal';
}

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
  catalog: Record<string, unknown> | null;
  backendError?: string | null;
  onRefreshBackend?: () => void;
  onSimulationCompleted: (
    engineId: string,
    missionId: string,
    reportId: string
  ) => Promise<void>;
}> = ({
  selectedEngineId,
  catalog,
  backendError = null,
  onRefreshBackend,
  onSimulationCompleted,
}) => {
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
  const [simResult, setSimResult] = useState<SimulationResultData | null>(null);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    setConfig((prev) => ({ ...prev, engine_id: selectedEngineId }));
  }, [selectedEngineId]);

  const applyPreset = (preset: MissionPresetItem) => {
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
      const res = (await drishtiApi.runSimulation(
        config
      )) as unknown as SimulationResultData;
      setSimResult(res);
      await onSimulationCompleted(
        config.engine_id,
        config.mission_id,
        res.report_id
      );
      setCurrentStep(6);
    } catch (err: unknown) {
      setSimError(
        err instanceof Error ? err.message : 'Simulation execution failed.'
      );
    } finally {
      setRunning(false);
    }
  };

  const faultClasses: string[] = Array.isArray(catalog?.fault_classes)
    ? (catalog.fault_classes as string[])
    : [
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

  const presets: MissionPresetItem[] = Array.isArray(catalog?.mission_presets)
    ? (catalog.mission_presets as MissionPresetItem[])
    : [];

  const transformationsMap = (catalog?.fault_signal_transformations ||
    {}) as Record<string, { description?: string }>;
  const activeTransformDesc =
    transformationsMap[config.fault_class]?.description || null;

  const simTrendData = useMemo(
    () =>
      (simResult?.telemetry || []).map((t: FourValueDigitalTwinState) => ({
        elapsed: t.mission_elapsed_sec,
        cht_actual: t.actual.cht_c,
        cht_expected: t.expected.cht_c,
        oil_p_actual: t.actual.oil_pressure_bar,
        oil_p_expected: t.expected.oil_pressure_bar,
        vib_actual: t.actual.vibration_rms_mms,
        vib_expected: t.expected.vibration_rms_mms,
        hi: t.predicted.health_index,
      })),
    [simResult]
  );

  if (backendError && !catalog) {
    return (
      <GlassPanel className="panel-card">
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="Mission Simulator Offline"
          description={backendError}
          action={
            onRefreshBackend ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRefreshBackend}
              >
                Retry Connection
              </button>
            ) : undefined
          }
        />
      </GlassPanel>
    );
  }

  if (!catalog) {
    return (
      <GlassPanel className="panel-card">
        <Skeleton variant="text" width="40%" height={24} />
        <Skeleton
          variant="rect"
          width="100%"
          height={64}
          style={{ marginTop: 12 }}
        />
        <Skeleton
          variant="rect"
          width="100%"
          height={220}
          style={{ marginTop: 12 }}
        />
      </GlassPanel>
    );
  }

  return (
    <div>
      {/* HEADER */}
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Operations · 6-Step Guided Deterministic Scenario Workflow
          </div>
          <h1 className="screen-title">Mission &amp; 9-Class Fault Simulator</h1>
          <div className="screen-desc">
            Step-by-step deterministic fault injection synchronized with the 3D
            Digital Twin, physics reference baseline, and SQLite mission store.
          </div>
        </div>
        <div className="screen-actions">
          <SyntheticBadge
            isSynthetic={true}
            label={`SYNTHETIC SCENARIO GENERATOR (SEED ${config.random_seed})`}
          />
          <button
            type="button"
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
      <div
        className="wizard-steps"
        role="tablist"
        aria-label="Simulator Workflow Steps"
      >
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
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Cpu size={14} /> Step 1 — Select Target Engine &amp; Mission
              Profile
            </div>
            <StatusChip status="nominal" label="STEP 1 OF 6" />
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
                    type="button"
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
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(2)}
            >
              Next: Operating Conditions &amp; Fault <ArrowRight size={13} />
            </button>
          </div>
        </GlassPanel>
      )}

      {/* STEP 2: SELECT OPERATING CONDITIONS AND DIAGNOSTIC FAULT */}
      {currentStep === 2 && (
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Sliders size={14} /> Step 2 — Select Operating Conditions &amp;
              Diagnostic Fault Mode
            </div>
            <StatusChip status="nominal" label="STEP 2 OF 6" />
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

          {activeTransformDesc && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'rgba(56, 189, 248, 0.06)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 4,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <strong>Physics Transfer Function ({config.fault_class}):</strong>{' '}
              {activeTransformDesc}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 18,
            }}
          >
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentStep(1)}
            >
              <ArrowLeft size={13} /> Back: Engine &amp; Profile
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(3)}
            >
              Next: Severity &amp; Onset <ArrowRight size={13} />
            </button>
          </div>
        </GlassPanel>
      )}

      {/* STEP 3: CONFIGURE FAULT SEVERITY AND ONSET (WITH PROGRESSIVE DISCLOSURE) */}
      {currentStep === 3 && (
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Sliders size={14} /> Step 3 — Configure Fault Severity &amp; Onset
              Timing
            </div>
            <StatusChip status="nominal" label="STEP 3 OF 6" />
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
                Timestamp when fault injection begins (t=0..{config.duration_sec}
                s)
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
              type="button"
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
                  Controls (Seed &amp; Sampling)
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
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentStep(2)}
            >
              <ArrowLeft size={13} /> Back: Conditions &amp; Fault
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(4)}
            >
              Next: Review Scenario Summary <ArrowRight size={13} />
            </button>
          </div>
        </GlassPanel>
      )}

      {/* STEP 4: REVIEW CONCISE SCENARIO SUMMARY */}
      {currentStep === 4 && (
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <CheckCircle2 size={14} /> Step 4 — Concise Scenario Configuration
              Summary
            </div>
            <StatusChip status="nominal" label="STEP 4 OF 6" />
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
              <div className="kpi-label">1. Target &amp; Profile</div>
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
                  <strong style={{ color: 'var(--cyan)' }}>
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
                  Subsystem:{' '}
                  <strong>
                    {mapFaultToSubsystemName(config.fault_class).split('·')[0]}
                  </strong>
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
            <button
              type="button"
              className="btn"
              onClick={() => setCurrentStep(3)}
            >
              <ArrowLeft size={13} /> Back: Severity &amp; Onset
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCurrentStep(5)}
            >
              Proceed to Step 5: Execute Simulation <ArrowRight size={13} />
            </button>
          </div>
        </GlassPanel>
      )}

      {/* STEP 5: EXECUTE DETERMINISTIC SIMULATION */}
      {currentStep === 5 && (
        <GlassPanel
          className="panel-card"
          style={{ textAlign: 'center', padding: 28 }}
        >
          <div style={{ maxWidth: 580, margin: '0 auto' }}>
            <div style={{ marginBottom: 10 }}>
              <StatusChip
                status="nominal"
                label="STEP 5 OF 6 · READY FOR EXECUTION"
              />
            </div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 8,
              }}
            >
              Execute Deterministic Digital Twin Simulation
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 12.5,
                marginBottom: 18,
              }}
            >
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
              <button
                type="button"
                className="btn"
                onClick={() => setCurrentStep(4)}
              >
                <ArrowLeft size={13} /> Back to Summary
              </button>
              <button
                type="button"
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
        </GlassPanel>
      )}

      {/* STEP 6: PRESENT RESULTS WITH BASELINE-VS-SCENARIO COMPARISON, PARAMETER TRENDS, FAULT DIAGNOSIS & HEALTH IMPACT */}
      {currentStep === 6 && (
        <div>
          {!simResult ? (
            <GlassPanel className="panel-card">
              <EmptyState
                icon={<Play size={28} />}
                title="No Simulation Executed Yet"
                description="Click below to run the configured scenario and inspect Baseline-vs-Scenario results."
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRunSimulation}
                    disabled={running}
                  >
                    <Play size={13} />{' '}
                    {running ? 'Executing…' : 'Execute Configured Simulation'}
                  </button>
                }
              />
            </GlassPanel>
          ) : (
            <GlassPanel className="panel-card" glow="cyan">
              <div className="panel-card-header">
                <div className="panel-card-title" style={{ color: 'var(--cyan)' }}>
                  Step 6 — Simulation Execution Results &amp; Baseline
                  Comparison: {simResult.simulation_id} (Report:{' '}
                  {simResult.report_id})
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <StatusChip status="nominal" label="COMPLETED & PERSISTED" />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setCurrentStep(1)}
                  >
                    Configure New Scenario
                  </button>
                </div>
              </div>

              {/* 4 SUMMARY KPI CARDS */}
              <div className="grid-4">
                <KpiTile
                  label="Generated Frames"
                  value={simResult.summary.total_frames}
                  precision={0}
                  unit="Frames"
                  status="info"
                  subtext={`Throughput: ${simResult.summary.processing_throughput_fps} fps`}
                />
                <KpiTile
                  label="Final Predicted Fault Class"
                  value={simResult.summary.final_predicted_class}
                  status={
                    simResult.summary.final_predicted_class === 'Normal'
                      ? 'nominal'
                      : 'caution'
                  }
                  subtext={`Confidence: ${(
                    simResult.summary.final_top_probability * 100
                  ).toFixed(1)}%`}
                />
                <KpiTile
                  label="Health Index Impact"
                  value={`${simResult.summary.initial_health_index.toFixed(
                    1
                  )}% → ${simResult.summary.final_health_index.toFixed(1)}%`}
                  status={
                    simResult.summary.final_health_index < 55
                      ? 'critical'
                      : simResult.summary.final_health_index < 75
                      ? 'caution'
                      : 'nominal'
                  }
                  subtext={`Alerts Triggered: ${simResult.summary.alert_count}`}
                />
                <KpiTile
                  label="Post-Scenario RUL Estimate"
                  value={
                    simResult.summary.final_rul_status === 'ESTIMATED' &&
                    simResult.summary.final_rul_hours !== null
                      ? `${simResult.summary.final_rul_hours.toFixed(1)} hrs`
                      : 'NOT ESTIMABLE'
                  }
                  status="info"
                  subtext={`Mean Latency: ${simResult.summary.mean_frame_latency_ms} ms`}
                />
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
                    Post-Scenario Outcome Comparison (Alert Bands: alert_engine.py)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table
                      className="data-table mono"
                      style={{ fontSize: 11.5 }}
                    >
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
                          <td
                            style={{
                              color:
                                Math.abs(
                                  simResult.latest_state.calculated
                                    .cht_residual_c
                                ) >= RESIDUAL_ALERT_THRESHOLDS.cht_c
                                  ? 'var(--color-caution)'
                                  : 'var(--color-nominal)',
                              fontWeight: 700,
                            }}
                          >
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
                          <td
                            style={{
                              color:
                                Math.abs(
                                  simResult.latest_state.calculated
                                    .egt_residual_c
                                ) >= RESIDUAL_ALERT_THRESHOLDS.egt_c
                                  ? 'var(--color-caution)'
                                  : 'var(--text-primary)',
                            }}
                          >
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
                          <td
                            style={{
                              color:
                                simResult.latest_state.calculated
                                  .oil_pressure_residual_bar <=
                                RESIDUAL_ALERT_THRESHOLDS.oil_pressure_bar
                                  ? 'var(--color-critical)'
                                  : 'var(--text-primary)',
                            }}
                          >
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
                          <td
                            style={{
                              color:
                                simResult.latest_state.calculated
                                  .vibration_residual_mms >=
                                RESIDUAL_ALERT_THRESHOLDS.vibration_mms
                                  ? 'var(--color-caution)'
                                  : 'var(--text-primary)',
                            }}
                          >
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
                            {simResult.summary.final_health_index.toFixed(1)}%
                            (t = end)
                          </td>
                          <td
                            style={{
                              color: 'var(--color-critical)',
                              fontWeight: 700,
                            }}
                          >
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
                  <GlassPanel className="panel-card" style={{ marginBottom: 0 }}>
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
                            stroke="var(--border-subtle, #1a2440)"
                          />
                          <XAxis
                            dataKey="elapsed"
                            stroke="var(--text-muted, #8899bb)"
                            unit="s"
                          />
                          <YAxis
                            stroke="var(--text-muted, #8899bb)"
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
                  </GlassPanel>

                  <GlassPanel className="panel-card" style={{ marginBottom: 0 }}>
                    <div className="panel-card-header">
                      <div className="panel-card-title">
                        <Activity size={13} /> Scenario Health Index &amp;
                        Vibration Trajectory
                      </div>
                    </div>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={simTrendData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--border-subtle, #1a2440)"
                          />
                          <XAxis
                            dataKey="elapsed"
                            stroke="var(--text-muted, #8899bb)"
                            unit="s"
                          />
                          <YAxis
                            stroke="var(--text-muted, #8899bb)"
                            domain={['auto', 'auto']}
                          />
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
                  </GlassPanel>
                </div>
              )}
            </GlassPanel>
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
  missions: MissionRecordItem[];
  backendError?: string | null;
  onRefreshBackend?: () => void;
}> = ({ missions, backendError = null, onRefreshBackend }) => {
  const [selectedMissionId, setSelectedMissionId] = useState<string>(
    missions[0]?.mission_id || 'MSN-DESERT-102'
  );
  const [snapshot, setSnapshot] = useState<ReplaySnapshot | null>(null);
  const [speed, setSpeed] = useState<number>(1.0);
  const [playingLocal, setPlayingLocal] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    drishtiApi
      .getReplayStatus()
      .then((s) => {
        if (!active) return;
        if (s && s.mission_id) {
          setSnapshot(s);
          setSelectedMissionId(s.mission_id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
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
    setLoading(true);
    try {
      const snap = await drishtiApi.startReplay(
        selectedMissionId,
        speed,
        startIdx
      );
      setSnapshot(snap);
      setPlayingLocal(autoPlay);
    } finally {
      setLoading(false);
    }
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
  const chartData = useMemo(
    () =>
      syncHistory.map((t) => ({
        seq: t.sequence_number,
        elapsed: t.mission_elapsed_sec,
        cht_actual: t.actual.cht_c,
        cht_expected: t.expected.cht_c,
        oil_p_actual: t.actual.oil_pressure_bar,
        oil_p_expected: t.expected.oil_pressure_bar,
        vib_actual: t.actual.vibration_rms_mms,
        hi: t.predicted.health_index,
      })),
    [syncHistory]
  );

  const cur = snapshot?.current_state || null;
  const unifiedDiag = useMemo(() => extractUnifiedDiagnosis(cur), [cur]);

  const scrubberMarkers: ScrubberMarker[] = useMemo(() => {
    const alerts = snapshot?.all_mission_alerts || [];
    return alerts.map((alt) => ({
      position: alt.sequence_number,
      severity: mapAlertSeverityToScrubber(alt.severity),
      label: `Seq #${alt.sequence_number}: ${alt.fault_class} (${alt.severity})`,
    }));
  }, [snapshot]);

  if (backendError && !snapshot && missions.length === 0) {
    return (
      <GlassPanel className="panel-card">
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="Historical Mission Replay Offline"
          description={backendError}
          action={
            onRefreshBackend ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRefreshBackend}
              >
                Retry Connection
              </button>
            ) : undefined
          }
        />
      </GlassPanel>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Operations · Synchronized Mission Timeline Playback
          </div>
          <h1 className="screen-title">
            Historical Mission Replay — 3D Twin, Telemetry &amp; Alerts
          </h1>
          <div className="screen-desc">
            Deterministic mission playback with play, pause, restart, timestamp
            seek, adjustable speed, and synchronized 3D subsystem highlighting.
          </div>
        </div>
        <div className="screen-actions">
          <SyntheticBadge isSynthetic={cur ? cur.is_synthetic : true} />
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
            type="button"
            className="btn btn-primary"
            onClick={() => handleLoadAndStart(0, true)}
          >
            <Play size={13} /> Load &amp; Play Mission
          </button>
        </div>
      </div>

      {/* Playback Transport Bar */}
      <GlassPanel className="panel-card">
        {loading && !snapshot ? (
          <Skeleton variant="rect" width="100%" height={68} />
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 10,
              }}
            >
              {playingLocal ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handlePause}
                >
                  <Pause size={13} /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    handleLoadAndStart(snapshot?.current_index || 0, true)
                  }
                >
                  <Play size={13} /> Play
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPlayingLocal(false);
                  handleLoadAndStart(0, false);
                }}
              >
                Restart (t=0s)
              </button>
              <button type="button" className="btn" onClick={handleStep}>
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
                    type="button"
                    className={`btn btn-sm ${speed === s ? 'btn-primary' : ''}`}
                    onClick={() => setSpeed(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <div
                className="mono"
                style={{ marginLeft: 'auto', fontSize: 11.5 }}
              >
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

            <Scrubber
              min={0}
              max={Math.max(0, (snapshot?.total_frames || 1) - 1)}
              value={snapshot?.current_index || 0}
              onChange={(idx) => {
                handleSeekIndex(idx);
              }}
              markers={scrubberMarkers}
              formatValue={(val) =>
                `Frame ${val + 1} / ${snapshot?.total_frames || 0}`
              }
              ariaLabel="Replay Timeline Seek"
            />
          </>
        )}
      </GlassPanel>

      {/* SYNCHRONIZED 3D ENGINE VIEWPORT AT REPLAY CURSOR */}
      <div style={{ marginBottom: 14 }}>
        <Engine3DViewport compact twinState={cur} />
      </div>

      {cur ? (
        <div className="grid-4">
          <KpiTile
            label="Replay Timestamp"
            value={cur.timestamp}
            status="info"
            subtext={`Seq #${cur.sequence_number} | Elapsed: ${cur.mission_elapsed_sec.toFixed(
              1
            )}s`}
          />
          <KpiTile
            label="Actual vs Expected CHT"
            value={`${cur.actual.cht_c.toFixed(1)} °C / ${cur.expected.cht_c.toFixed(
              1
            )} °C`}
            status={
              Math.abs(cur.calculated.cht_residual_c) >=
              RESIDUAL_ALERT_THRESHOLDS.cht_c
                ? 'caution'
                : 'info'
            }
            subtext={`Residual: ${
              cur.calculated.cht_residual_c >= 0 ? '+' : ''
            }${cur.calculated.cht_residual_c.toFixed(2)} °C`}
          />
          <KpiTile
            label="Predicted Fault at Cursor"
            value={unifiedDiag.faultClass}
            status={unifiedDiag.faultClass === 'Normal' ? 'nominal' : 'caution'}
            subtext={`Confidence: ${unifiedDiag.confidencePct}% · ${unifiedDiag.certainty}`}
          />
          <KpiTile
            label="Health Index & RUL at Cursor"
            value={`HI: ${cur.predicted.health_index.toFixed(1)}%`}
            status={
              cur.predicted.health_index >= 75
                ? 'nominal'
                : cur.predicted.health_index >= 55
                ? 'caution'
                : 'critical'
            }
            subtext={`RUL: ${
              cur.predicted.rul_status === 'ESTIMATED' &&
              cur.predicted.rul_hours !== null
                ? `${cur.predicted.rul_hours.toFixed(1)} hrs`
                : 'NOT ESTIMABLE'
            }`}
          />
        </div>
      ) : (
        !loading && (
          <GlassPanel className="panel-card" style={{ marginBottom: 14 }}>
            <EmptyState
              icon={<Play size={28} />}
              title="No Replay Cursor State Active"
              description="Select a mission above and click 'Load & Play Mission' to inspect synchronized 4-value telemetry frames."
            />
          </GlassPanel>
        )
      )}

      <div className="grid-2">
        <GlassPanel className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Synchronized Replay Telemetry (t = 0s →{' '}
              {(snapshot?.current_elapsed_sec ?? 0).toFixed(1)}s)
            </div>
          </div>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border-subtle, #1a2440)"
                />
                <XAxis
                  dataKey="elapsed"
                  stroke="var(--text-muted, #8899bb)"
                  unit="s"
                />
                <YAxis
                  stroke="var(--text-muted, #8899bb)"
                  domain={['auto', 'auto']}
                />
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
        </GlassPanel>

        <GlassPanel className="panel-card">
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
              <div style={{ color: 'var(--text-muted)' }}>
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
                    className={getAlertBoxSeverityClass(alt.severity)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong>
                        Seq #{alt.sequence_number} — {alt.fault_class}
                      </strong>
                      <SeverityBadge severity={alt.severity} />
                    </div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
                    >
                      {alt.supporting_evidence[0]}
                    </div>
                  </div>
                ))
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
