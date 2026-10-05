import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Cpu,
  Layers,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { drishtiApi } from '../../api/client';
import {
  ENGINE_SUBSYSTEMS,
  EngineSubsystemId,
  evaluateSubsystemStates,
} from '../../components/Engine3DViewport';
import {
  EmptyState,
  GlassPanel,
  Scrubber,
  SeverityBadge,
  Skeleton,
  StatusChip,
  SyntheticBadge,
} from '../../components/ui';
import {
  EngineRecord,
  FourValueDigitalTwinState,
} from '../../types/telemetry';

// Lazy-load the 3D viewport for performance and code-splitting
const LazyEngine3DViewport = React.lazy(() =>
  import('../../components/Engine3DViewport').then((m) => ({
    default: m.Engine3DViewport,
  }))
);

export interface EngineDigitalTwinScreenProps {
  engineId: string;
  engineRecord?: EngineRecord | null;
  telemetry: FourValueDigitalTwinState[];
  latestState: FourValueDigitalTwinState | null;
  onRefreshEngine: () => Promise<void>;
  onNavigate: (screen: string) => void;
  backendError?: string | null;
}

export const EngineDigitalTwinScreen: React.FC<EngineDigitalTwinScreenProps> = ({
  engineId,
  engineRecord,
  telemetry = [],
  latestState = null,
  onRefreshEngine,
  onNavigate,
  backendError = null,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [wsStreaming, setWsStreaming] = useState<boolean>(false);
  const [wsFrame, setWsFrame] = useState<FourValueDigitalTwinState | null>(null);
  const [selectedSubsystemId, setSelectedSubsystemId] =
    useState<EngineSubsystemId>('cylinder_heads_valves');

  // Reset index and live frame when switching propulsion units
  useEffect(() => {
    setSelectedIndex(-1);
    setWsFrame(null);
    setWsStreaming(false);
  }, [engineId]);

  // WebSocket Live Telemetry Streaming
  useEffect(() => {
    if (!wsStreaming) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(drishtiApi.getWebSocketUrl(engineId));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'telemetry_frame' && msg.twin_state) {
            setWsFrame(msg.twin_state as FourValueDigitalTwinState);
          }
        } catch {
          // ignore non-json or malformed frames
        }
      };
      ws.onclose = () => {
        setWsStreaming(false);
      };
      ws.onerror = () => {
        setWsStreaming(false);
      };
    } catch {
      setWsStreaming(false);
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [wsStreaming, engineId]);

  // Resolve active 4-value state: WebSocket live frame takes priority, then timeline scrubber, then latest state
  const activePoint: FourValueDigitalTwinState | null =
    wsFrame ||
    (selectedIndex >= 0 && selectedIndex < telemetry.length
      ? telemetry[selectedIndex]
      : latestState);

  // Evaluate subsystem health states deterministically from active 4-value point
  const subsystemStates = useMemo(
    () => evaluateSubsystemStates(activePoint),
    [activePoint]
  );

  const selectedSubMeta = useMemo(
    () =>
      ENGINE_SUBSYSTEMS.find((s) => s.id === selectedSubsystemId) ||
      ENGINE_SUBSYSTEMS[0],
    [selectedSubsystemId]
  );

  const selectedSubStatus = subsystemStates[selectedSubsystemId] || {
    status: 'NOMINAL',
    reason: 'Nominal operational envelope',
  };

  // --- STATE 1: BACKEND OFFLINE ---
  if (!activePoint && backendError) {
    return (
      <div className="fleet-offline-wrap">
        <EmptyState
          icon={<WifiOff size={44} color="var(--color-critical)" />}
          title="FastAPI Backend Offline"
          description={`Cannot stream digital twin state for ${engineId}. If deployed on Render, the backend service may be cold-starting (45–60s). Click retry to reconnect.`}
          action={
            <button className="btn btn-primary" onClick={onRefreshEngine}>
              <RefreshCw size={13} /> Retry Connection
            </button>
          }
        />
      </div>
    );
  }

  // --- STATE 2: LOADING SKELETON ---
  if (!activePoint && telemetry.length === 0) {
    return (
      <div className="twin-screen-container" aria-busy="true" aria-label="Loading Engine Digital Twin">
        <GlassPanel style={{ padding: 18 }}>
          <Skeleton variant="text" width="40%" height={24} />
          <Skeleton variant="text" width="70%" height={14} style={{ marginTop: 8 }} />
        </GlassPanel>
        <div className="twin-viewport-skeleton" style={{ marginTop: 12 }}>
          <Skeleton variant="rect" height={520} />
        </div>
        <div className="twin-matrix-grid" style={{ marginTop: 12 }}>
          <Skeleton variant="rect" height={220} count={4} />
        </div>
      </div>
    );
  }

  // --- STATE 3: NO DATA AVAILABLE ---
  if (!activePoint) {
    return (
      <div className="fleet-offline-wrap">
        <EmptyState
          icon={<AlertTriangle size={44} color="var(--color-caution)" />}
          title={`No Telemetry Frames for ${engineId}`}
          description={`Propulsion unit ${engineId} has no recorded or active telemetry frames. Reseed the fleet from the Command Center or start a mission simulation.`}
          action={
            <button className="btn btn-primary" onClick={() => onNavigate('fleet')}>
              Return to Fleet Command Center
            </button>
          }
        />
      </div>
    );
  }

  // Time-series chart datasets synchronized with historical frames
  const chartData = telemetry.map((t) => ({
    seq: t.sequence_number,
    elapsed: t.mission_elapsed_sec,
    cht_actual: t.actual.cht_c,
    cht_expected: t.expected.cht_c,
    egt_actual: t.actual.egt_c,
    egt_expected: t.expected.egt_c,
    oil_p_actual: t.actual.oil_pressure_bar,
    oil_p_expected: t.expected.oil_pressure_bar,
    vib_actual: t.actual.vibration_rms_mms,
    vib_expected: t.expected.vibration_rms_mms,
  }));

  // Residual comparison bar data for current active point
  const residualComparison = [
    {
      channel: 'CHT (°C)',
      residual: activePoint.calculated.cht_residual_c,
    },
    {
      channel: 'EGT/5 (°C)',
      residual: Number((activePoint.calculated.egt_residual_c / 5).toFixed(2)),
    },
    {
      channel: 'Oil T (°C)',
      residual: activePoint.calculated.oil_temp_residual_c,
    },
    {
      channel: 'Oil P×10 (bar)',
      residual: Number((activePoint.calculated.oil_pressure_residual_bar * 10).toFixed(2)),
    },
    {
      channel: 'Vib×5 (mm/s)',
      residual: Number((activePoint.calculated.vibration_residual_mms * 5).toFixed(2)),
    },
    {
      channel: 'Fuel (L/h)',
      residual: activePoint.calculated.fuel_flow_residual_lph,
    },
  ];

  const qualityScore = activePoint.actual.quality.quality_score;
  const isCanValid = activePoint.actual.quality.is_valid;
  const tailNumber = engineRecord?.tail_number || engineId;
  const platformName = engineRecord?.uav_platform || 'Tactical UAV';

  return (
    <div className="twin-screen-container">
      {/* 1. SCREEN HEADER & TOP WORKSPACE ACTIONS */}
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Propulsion Diagnostics · 3D Digital Twin Workstation
          </div>
          <h1 className="screen-title">
            3D Engine Digital Twin — {engineId} {tailNumber !== engineId ? `(${tailNumber})` : ''} · {platformName}
          </h1>
          <div className="screen-desc">
            Procedural 4-cylinder boxer turbo assembly synchronized with Four-Value State: ACTUAL (CAN Telemetry) · EXPECTED (Physics Baseline) · CALCULATED (Deterministic Residuals) · PREDICTED (ML Ensemble Diagnostics & RUL).
          </div>
        </div>

        <div className="screen-actions">
          {activePoint.is_synthetic && (
            <SyntheticBadge
              isSynthetic={true}
              label={activePoint.data_source || 'SIMULATED'}
            />
          )}

          <button
            className={`btn ${wsStreaming ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setWsStreaming((v) => !v)}
            title="Real-time WebSocket telemetry push"
          >
            <Radio size={13} />
            {wsStreaming ? 'Stop WebSocket Stream' : 'Stream via WebSocket'}
          </button>

          <button
            className="btn"
            onClick={() => onNavigate('telemetry')}
            title="Jump to comprehensive 8-Parameter Group telemetry view"
          >
            <Layers size={13} /> 8-Group Health View
          </button>

          <button
            className="btn"
            onClick={() => onRefreshEngine()}
            title="Poll fresh telemetry frames"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* 2. MISSION FRAME TIMELINE SCRUBBER */}
      <GlassPanel className="twin-scrubber-card">
        <div className="twin-scrubber-row">
          <div className="twin-scrubber-info mono">
            <Activity size={14} color="var(--cyan)" />
            <span>
              Frame: <strong>Seq #{activePoint.sequence_number}</strong> · <strong>t = {activePoint.mission_elapsed_sec.toFixed(1)}s</strong> · {activePoint.timestamp}
            </span>
            {selectedIndex >= 0 && (
              <StatusChip status="caution" label="HISTORICAL SCRUB" />
            )}
            {wsStreaming && (
              <StatusChip status="info" label="LIVE WS" pulse />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 200, padding: '0 12px' }}>
            <Scrubber
              value={selectedIndex >= 0 ? selectedIndex : Math.max(0, telemetry.length - 1)}
              min={0}
              max={Math.max(1, telemetry.length - 1)}
              step={1}
              formatValue={(idx) => `Seq #${telemetry[idx]?.sequence_number ?? idx}`}
              ariaLabel="Mission Frame Scrubber"
              onChange={(val) => {
                setWsFrame(null);
                setSelectedIndex(val);
              }}
            />
          </div>

          <button
            className="btn btn-sm"
            onClick={() => {
              setWsFrame(null);
              setSelectedIndex(-1);
            }}
            title="Jump to the latest available telemetry frame"
          >
            Jump to Latest Frame
          </button>
        </div>
      </GlassPanel>

      {/* 3. HERO: 3D DIGITAL TWIN VIEWPORT & SUBSYSTEM WORKSPACE */}
      <Suspense
        fallback={
          <div className="twin-viewport-skeleton">
            <Skeleton variant="rect" height={520} />
          </div>
        }
      >
        <LazyEngine3DViewport
          twinState={activePoint}
          engineHours={engineRecord?.total_operating_hours ?? 420.0}
          selectedSubsystemId={selectedSubsystemId}
          onSubsystemChange={setSelectedSubsystemId}
        />
      </Suspense>

      {/* 4. SYNCHRONIZED SUBSYSTEM FOCUS BANNER */}
      <GlassPanel className="twin-focus-banner">
        <div className="twin-focus-left">
          <StatusChip status="info" label="SYNCHRONIZED FOCUS" />
          <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {selectedSubMeta.code} — {selectedSubMeta.name}
          </strong>
          <StatusChip
            status={
              selectedSubStatus.status === 'CRITICAL'
                ? 'critical'
                : selectedSubStatus.status === 'WARNING'
                ? 'warning'
                : 'nominal'
            }
            label={selectedSubStatus.status}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
            ({selectedSubMeta.localizationDisclosure})
          </span>
        </div>

        <div className="twin-focus-right">
          {selectedSubMeta.relatedFaultClasses.map((fc) => (
            <span
              key={fc}
              className="mono"
              style={{
                fontSize: 10.5,
                padding: '2px 7px',
                borderRadius: 'var(--radius-xs)',
                background: 'rgba(54, 217, 255, 0.08)',
                border: '1px solid var(--border-accent)',
                color: 'var(--cyan)',
              }}
            >
              {fc}
            </span>
          ))}
        </div>
      </GlassPanel>

      {/* 5. THE FOUR-VALUE DIGITAL TWIN MATRIX */}
      <div className="twin-matrix-grid">
        {/* COLUMN 1: ACTUAL (MEASURED / SIMULATED CAN TELEMETRY) */}
        <GlassPanel className="twin-matrix-card" style={{ borderTop: '2px solid var(--cyan)' }}>
          <div className="twin-matrix-header">
            <div className="twin-matrix-title" style={{ color: 'var(--cyan)' }}>
              1. ACTUAL (TELEMETRY)
            </div>
            <StatusChip
              status={isCanValid ? 'nominal' : 'caution'}
              label={`Q=${qualityScore.toFixed(2)}`}
            />
          </div>

          <div className="twin-matrix-body">
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">RPM:</span>
              <span className="twin-matrix-val">{activePoint.actual.rpm.toFixed(0)} RPM</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Throttle / Load:</span>
              <span className="twin-matrix-val">
                {activePoint.actual.throttle_pct.toFixed(1)}% / {activePoint.actual.engine_load_pct.toFixed(1)}%
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Alt / Ambient:</span>
              <span className="twin-matrix-val">
                {activePoint.actual.altitude_m.toFixed(0)} m / {activePoint.actual.ambient_temp_c.toFixed(1)} °C
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">CHT:</span>
              <span className="twin-matrix-val">{activePoint.actual.cht_c.toFixed(1)} °C</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">EGT:</span>
              <span className="twin-matrix-val">{activePoint.actual.egt_c.toFixed(1)} °C</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Oil P / T:</span>
              <span className="twin-matrix-val">
                {activePoint.actual.oil_pressure_bar.toFixed(2)} bar / {activePoint.actual.oil_temp_c.toFixed(1)} °C
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Fuel Flow:</span>
              <span className="twin-matrix-val">{activePoint.actual.fuel_flow_lph.toFixed(2)} L/h</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Vibration RMS:</span>
              <span className="twin-matrix-val">{activePoint.actual.vibration_rms_mms.toFixed(2)} mm/s</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Pulse / Battery:</span>
              <span className="twin-matrix-val">
                {activePoint.actual.injection_pulse_ms.toFixed(2)} ms / {activePoint.actual.battery_voltage_v.toFixed(2)} V
              </span>
            </div>
          </div>

          <div className="twin-matrix-footer">
            Schema v{activePoint.actual.schema_version} · Source: {activePoint.actual.data_source}
          </div>
        </GlassPanel>

        {/* COLUMN 2: EXPECTED (PHYSICS REFERENCE BASELINE) */}
        <GlassPanel className="twin-matrix-card" style={{ borderTop: '2px solid var(--color-nominal)' }}>
          <div className="twin-matrix-header">
            <div className="twin-matrix-title" style={{ color: 'var(--color-nominal)' }}>
              2. EXPECTED (PHYSICS REF)
            </div>
            <StatusChip
              status={activePoint.expected.is_extrapolated ? 'warning' : 'nominal'}
              label={activePoint.expected.is_extrapolated ? 'EXTRAPOLATED' : 'IN ENVELOPE'}
            />
          </div>

          <div className="twin-matrix-body">
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ISA Air Density σ:</span>
              <span className="twin-matrix-val">{activePoint.expected.air_density_ratio.toFixed(3)}</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Cooling Eff η:</span>
              <span className="twin-matrix-val">{activePoint.expected.cooling_effectiveness.toFixed(3)}</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected CHT:</span>
              <span className="twin-matrix-val">{activePoint.expected.cht_c.toFixed(1)} °C</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected EGT:</span>
              <span className="twin-matrix-val">{activePoint.expected.egt_c.toFixed(1)} °C</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected Oil P:</span>
              <span className="twin-matrix-val">{activePoint.expected.oil_pressure_bar.toFixed(2)} bar</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected Oil T:</span>
              <span className="twin-matrix-val">{activePoint.expected.oil_temp_c.toFixed(1)} °C</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected Fuel:</span>
              <span className="twin-matrix-val">{activePoint.expected.fuel_flow_lph.toFixed(2)} L/h</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected Vib:</span>
              <span className="twin-matrix-val">{activePoint.expected.vibration_rms_mms.toFixed(2)} mm/s</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Expected Pulse:</span>
              <span className="twin-matrix-val">{activePoint.expected.injection_pulse_ms.toFixed(2)} ms</span>
            </div>
          </div>

          <div className="twin-matrix-footer">
            Model: {activePoint.expected.model_version}
          </div>
        </GlassPanel>

        {/* COLUMN 3: CALCULATED (DETERMINISTIC PHYSICS RESIDUALS) */}
        <GlassPanel className="twin-matrix-card" style={{ borderTop: '2px solid var(--color-caution)' }}>
          <div className="twin-matrix-header">
            <div className="twin-matrix-title" style={{ color: 'var(--color-caution)' }}>
              3. CALCULATED (RESIDUALS)
            </div>
            <StatusChip status="info" label="DETERMINISTIC" />
          </div>

          <div className="twin-matrix-body">
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔCHT Residual:</span>
              <span
                className="twin-matrix-val"
                style={{
                  color:
                    Math.abs(activePoint.calculated.cht_residual_c) > 15
                      ? 'var(--color-critical)'
                      : Math.abs(activePoint.calculated.cht_residual_c) > 10
                      ? 'var(--color-caution)'
                      : 'var(--text-primary)',
                }}
              >
                {activePoint.calculated.cht_residual_c >= 0 ? '+' : ''}
                {activePoint.calculated.cht_residual_c.toFixed(2)} °C
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔEGT Residual:</span>
              <span className="twin-matrix-val">
                {activePoint.calculated.egt_residual_c >= 0 ? '+' : ''}
                {activePoint.calculated.egt_residual_c.toFixed(2)} °C
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔOil Pressure:</span>
              <span
                className="twin-matrix-val"
                style={{
                  color:
                    activePoint.calculated.oil_pressure_residual_bar < -0.5
                      ? 'var(--color-critical)'
                      : 'var(--text-primary)',
                }}
              >
                {activePoint.calculated.oil_pressure_residual_bar >= 0 ? '+' : ''}
                {activePoint.calculated.oil_pressure_residual_bar.toFixed(3)} bar
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔOil Temp:</span>
              <span className="twin-matrix-val">
                {activePoint.calculated.oil_temp_residual_c >= 0 ? '+' : ''}
                {activePoint.calculated.oil_temp_residual_c.toFixed(2)} °C
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔVibration:</span>
              <span
                className="twin-matrix-val"
                style={{
                  color:
                    activePoint.calculated.vibration_residual_mms > 1.2
                      ? 'var(--color-caution)'
                      : 'var(--text-primary)',
                }}
              >
                {activePoint.calculated.vibration_residual_mms >= 0 ? '+' : ''}
                {activePoint.calculated.vibration_residual_mms.toFixed(3)} mm/s
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">ΔFuel Flow:</span>
              <span className="twin-matrix-val">
                {activePoint.calculated.fuel_flow_residual_lph >= 0 ? '+' : ''}
                {activePoint.calculated.fuel_flow_residual_lph.toFixed(2)} L/h
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">CHT Slope:</span>
              <span className="twin-matrix-val">
                {activePoint.calculated.cht_rolling_slope_c_per_s.toFixed(3)} °C/s
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Thermal Margin:</span>
              <span className="twin-matrix-val">{activePoint.calculated.thermal_margin_pct.toFixed(1)}%</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Oil Margin:</span>
              <span className="twin-matrix-val">{activePoint.calculated.oil_pressure_margin_pct.toFixed(1)}%</span>
            </div>
          </div>

          <div className="twin-matrix-footer">
            Engine: {activePoint.calculated.calculator_version}
          </div>
        </GlassPanel>

        {/* COLUMN 4: PREDICTED (ML ENSEMBLE DIAGNOSTICS & RUL) */}
        <GlassPanel className="twin-matrix-card" style={{ borderTop: '2px solid var(--border-accent)' }}>
          <div className="twin-matrix-header">
            <div className="twin-matrix-title" style={{ color: 'var(--cyan)' }}>
              4. PREDICTED (ML ENSEMBLE)
            </div>
            <SeverityBadge
              severity={
                activePoint.predicted.is_anomaly
                  ? activePoint.predicted.health_index < 48
                    ? 'critical'
                    : 'warning'
                  : 'nominal'
              }
              customLabel={activePoint.predicted.is_anomaly ? 'ANOMALY' : 'NOMINAL'}
            />
          </div>

          <div className="twin-matrix-body">
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Class:</span>
              <span
                className="twin-matrix-val"
                style={{
                  color:
                    activePoint.predicted.predicted_fault_class === 'Normal'
                      ? 'var(--color-nominal)'
                      : 'var(--cyan)',
                }}
              >
                {activePoint.predicted.predicted_fault_class}
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Confidence:</span>
              <span className="twin-matrix-val">
                {(activePoint.predicted.top_probability * 100).toFixed(1)}%
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Certainty:</span>
              <span className="twin-matrix-val" style={{ fontSize: 10 }}>
                {activePoint.predicted.diagnosis_certainty_status}
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">IsoForest Score:</span>
              <span className="twin-matrix-val">
                {activePoint.predicted.anomaly_score.toFixed(3)} (Thr: {activePoint.predicted.anomaly_threshold.toFixed(3)})
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Sensor Status:</span>
              <span className="twin-matrix-val" style={{ fontSize: 10 }}>
                {activePoint.predicted.sensor_diagnosis.diagnosis_status}
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">Health Index:</span>
              <span className="twin-matrix-val" style={{ color: 'var(--cyan)' }}>
                {activePoint.predicted.health_index.toFixed(1)}%
              </span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">RUL Status:</span>
              <span className="twin-matrix-val">{activePoint.predicted.rul_status}</span>
            </div>
            <div className="twin-matrix-row">
              <span className="twin-matrix-label">RUL Horizon:</span>
              <span className="twin-matrix-val">
                {activePoint.predicted.rul_status === 'NOT_ESTIMABLE' ? (
                  <span style={{ color: 'var(--text-muted)' }}>NOT ESTIMABLE</span>
                ) : activePoint.predicted.rul_hours !== null ? (
                  `${activePoint.predicted.rul_hours.toFixed(1)} hrs [${activePoint.predicted.rul_lower_10_hours?.toFixed(1) ?? '—'}–${activePoint.predicted.rul_upper_90_hours?.toFixed(1) ?? '—'}]`
                ) : (
                  '—'
                )}
              </span>
            </div>
            {activePoint.predicted.rul_status === 'NOT_ESTIMABLE' && activePoint.predicted.rul_reason && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                Reason: {activePoint.predicted.rul_reason}
              </div>
            )}
          </div>

          <div className="twin-matrix-footer">
            Model: {activePoint.predicted.model_version}
          </div>
        </GlassPanel>
      </div>

      {/* 6. SYNCHRONIZED ACTUAL VS PHYSICS-EXPECTED CHARTS */}
      <div className="twin-charts-grid">
        {/* CHART 1: CYLINDER HEAD TEMPERATURE (CHT) */}
        <GlassPanel className="twin-chart-card">
          <div className="twin-chart-header">
            <div className="twin-chart-title">
              <Activity size={14} color="var(--cyan)" />
              <span>Cylinder Head Temp (CHT °C): Actual vs Physics Baseline</span>
            </div>
          </div>
          <div className="twin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="elapsed" stroke="var(--text-muted)" unit="s" fontSize={11} />
                <YAxis stroke="var(--text-muted)" domain={['auto', 'auto']} unit="°C" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border-medium)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    fontSize: 11,
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
                />
                <Line
                  type="monotone"
                  dataKey="cht_expected"
                  name="Expected CHT (°C)"
                  stroke="#22c55e"
                  strokeWidth={1.8}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* CHART 2: OIL PRESSURE & VIBRATION */}
        <GlassPanel className="twin-chart-card">
          <div className="twin-chart-header">
            <div className="twin-chart-title">
              <Activity size={14} color="var(--color-caution)" />
              <span>Oil Pressure (bar) & Vibration (mm/s): Actual vs Expected</span>
            </div>
          </div>
          <div className="twin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="elapsed" stroke="var(--text-muted)" unit="s" fontSize={11} />
                <YAxis stroke="var(--text-muted)" domain={['auto', 'auto']} fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border-medium)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="oil_p_actual"
                  name="Actual Oil P (bar)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="oil_p_expected"
                  name="Expected Oil P (bar)"
                  stroke="#22c55e"
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="vib_actual"
                  name="Actual Vib (mm/s)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="vib_expected"
                  name="Expected Vib (mm/s)"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* CHART 3: INSTANTANEOUS RESIDUAL PROFILE */}
        <GlassPanel className="twin-chart-card">
          <div className="twin-chart-header">
            <div className="twin-chart-title">
              <BarChart2 size={14} color="var(--cyan)" />
              <span>Instantaneous Residual Profile (Seq #{activePoint.sequence_number})</span>
            </div>
          </div>
          <div className="twin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residualComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="channel" stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border-medium)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                />
                <ReferenceLine y={0} stroke="var(--border-strong)" />
                <Bar dataKey="residual" name="Residual Deviation" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>

        {/* CHART 4: EXHAUST GAS TEMPERATURE (EGT) */}
        <GlassPanel className="twin-chart-card">
          <div className="twin-chart-header">
            <div className="twin-chart-title">
              <Activity size={14} color="#f59e0b" />
              <span>Exhaust Gas Temp (EGT °C): Actual vs Physics Baseline</span>
            </div>
          </div>
          <div className="twin-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="elapsed" stroke="var(--text-muted)" unit="s" fontSize={11} />
                <YAxis stroke="var(--text-muted)" domain={['auto', 'auto']} unit="°C" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border-medium)',
                    color: 'var(--text-primary)',
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="egt_actual"
                  name="Actual EGT (°C)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="egt_expected"
                  name="Expected EGT (°C)"
                  stroke="#38bdf8"
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
