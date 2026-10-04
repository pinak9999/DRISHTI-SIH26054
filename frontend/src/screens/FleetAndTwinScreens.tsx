import React, { useEffect, useMemo, useState } from 'react';
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
  CheckCircle2,
  Cpu,
  Download,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { drishtiApi } from '../api/client';
import { Engine3DViewport } from '../components/Engine3DViewport';
import {
  EngineRecord,
  ExplainableAlert,
  FleetOverview,
  FourValueDigitalTwinState,
} from '../types/telemetry';

export function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes('CRITICAL') || s.includes('NO-GO'))
    return 'badge badge-critical';
  if (s.includes('WARNING')) return 'badge badge-warning';
  if (s.includes('CAUTION') || s.includes('CONDITIONAL'))
    return 'badge badge-caution';
  return 'badge badge-nominal';
}

export function evaluateMissionReadiness(eng: EngineRecord): {
  readiness: 'MISSION GO' | 'CONDITIONAL CHECK' | 'NO-GO HOLD';
  rationale: string;
} {
  if (
    eng.latest_health_index >= 75.0 &&
    eng.latest_fault_class === 'Normal' &&
    (eng.latest_rul_hours === null || eng.latest_rul_hours >= 15.0)
  ) {
    return {
      readiness: 'MISSION GO',
      rationale: 'HI >= 75%, Normal class, RUL >= 15h',
    };
  }
  if (
    eng.latest_fault_class === 'Sensor Fault' ||
    (eng.latest_health_index >= 58.0 && eng.status.startsWith('CAUTION'))
  ) {
    return {
      readiness: 'CONDITIONAL CHECK',
      rationale: 'Sensor/instrumentation check required prior to dispatch',
    };
  }
  return {
    readiness: 'NO-GO HOLD',
    rationale: `Active ${eng.latest_fault_class} (HI=${eng.latest_health_index.toFixed(
      1
    )}%)`,
  };
}

/* =========================================================================
   SCREEN 1: FLEET COMMAND CENTER
   ========================================================================= */
export const FleetCommandCenterScreen: React.FC<{
  fleet: FleetOverview | null;
  selectedEngineId: string;
  onSelectEngine: (engineId: string, navigateToTwin?: boolean) => void;
  onRefreshFleet: () => Promise<void>;
  onNavigate: (screen: string) => void;
}> = ({
  fleet,
  selectedEngineId,
  onSelectEngine,
  onRefreshFleet,
  onNavigate,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [alertFilter, setAlertFilter] = useState<
    'ALL' | 'UNACKNOWLEDGED' | 'ACKNOWLEDGED'
  >('ALL');

  const handleReseedFleet = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      await drishtiApi.seedFleet();
      await onRefreshFleet();
      setSeedMessage(
        'Deterministic 6-engine MALE UAV fleet re-seeded and verified.'
      );
    } catch (err: any) {
      setSeedMessage(`Error seeding fleet: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleAcknowledge = async (
    alertId: string,
    currentAck: boolean
  ) => {
    try {
      await drishtiApi.acknowledgeAlert(alertId, !currentAck);
      await onRefreshFleet();
    } catch (err: any) {
      setSeedMessage(`Alert update failed: ${err.message}`);
    }
  };

  const faultDistribution = useMemo(() => {
    if (!fleet) return [];
    const counts: Record<string, number> = {};
    for (const e of fleet.engines) {
      counts[e.latest_fault_class] = (counts[e.latest_fault_class] || 0) + 1;
    }
    return Object.entries(counts).map(([fault_class, count]) => ({
      fault_class,
      count,
    }));
  }, [fleet]);

  if (!fleet) {
    return (
      <div className="panel-card">
        Loading fleet telemetry and 3D digital twin states...
      </div>
    );
  }

  const filteredAlerts = fleet.recent_alerts.filter((a) => {
    if (alertFilter === 'UNACKNOWLEDGED') return !a.acknowledged;
    if (alertFilter === 'ACKNOWLEDGED') return a.acknowledged;
    return true;
  });

  const unackCount = fleet.recent_alerts.filter((a) => !a.acknowledged).length;
  const ackCount = fleet.recent_alerts.filter((a) => a.acknowledged).length;

  return (
    <div>
      <div className="screen-header">
        <div>
          <div className="screen-title">
            Fleet Command Center — Multi-Engine MALE UAV Propulsion Matrix
          </div>
          <div className="screen-desc">
            Fleet-wide engine status, transparent mission readiness criteria,
            fault distribution, telemetry stream quality, and active vs.
            acknowledged diagnostic alerts.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => onRefreshFleet()}>
            <RefreshCw size={13} /> Refresh Telemetry
          </button>
          <button
            className="btn btn-primary"
            onClick={handleReseedFleet}
            disabled={seeding}
          >
            <Play size={13} />{' '}
            {seeding ? 'Seeding Fleet...' : 'Reset / Seed Demo Fleet'}
          </button>
        </div>
      </div>

      {seedMessage && (
        <div
          className="panel-card"
          style={{ borderColor: '#38bdf8', padding: '8px 12px' }}
        >
          <span className="mono">{seedMessage}</span>
        </div>
      )}

      <div className="grid-4">
        <div className="panel-card">
          <div className="kpi-label">Monitored MALE UAV Fleet</div>
          <div className="kpi-value">{fleet.fleet_size} Engines</div>
          <div className="kpi-sub">
            {fleet.nominal_count} Nominal | {fleet.caution_count} Caution |{' '}
            {fleet.warning_count + fleet.critical_count} Degraded/Critical
          </div>
        </div>
        <div className="panel-card">
          <div className="kpi-label">Mean Fleet Health Index</div>
          <div
            className="kpi-value"
            style={{
              color:
                fleet.mean_fleet_health_index >= 75
                  ? '#34d399'
                  : fleet.mean_fleet_health_index >= 55
                  ? '#fbbf24'
                  : '#ef4444',
            }}
          >
            {fleet.mean_fleet_health_index.toFixed(1)} / 100
          </div>
          <div className="kpi-sub">Weighted Thermal/Oil/Vib/Anomaly Index</div>
        </div>
        <div className="panel-card">
          <div className="kpi-label">Alert Queue Status</div>
          <div className="kpi-value" style={{ color: '#fbbf24' }}>
            {unackCount} Active / {ackCount} Ack
          </div>
          <div className="kpi-sub">
            Total Logged Fleet Alerts: {fleet.total_active_alerts}
          </div>
        </div>
        <div className="panel-card">
          <div className="kpi-label">Telemetry Stream Health</div>
          <div className="kpi-value" style={{ fontSize: 16, color: '#38bdf8' }}>
            {(
              (1 - (fleet.data_quality_stats?.degraded_or_rejection_rate || 0)) *
              100
            ).toFixed(1)}
            % Clean
          </div>
          <div className="kpi-sub">
            Frames: {fleet.data_quality_stats?.total_received ?? 0} | CAN:{' '}
            {fleet.can_adapter_status?.mode || 'SIMULATED'}
          </div>
        </div>
      </div>

      {/* FLEET ROSTER WITH TRANSPARENT MISSION READINESS CRITERIA */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Cpu size={14} /> Active Aero Piston Fleet & Mission Readiness
            Matrix
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="badge badge-info">
              READINESS CRITERIA: GO (HI≥75%, Normal, RUL≥15h) | CONDITIONAL
              (Sensor Check) | NO-GO (Mechanical Fault / HI&lt;58%)
            </span>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="eng-table">
            <thead>
              <tr>
                <th>Engine ID</th>
                <th>Tail Number</th>
                <th>Engine Hours</th>
                <th>Mission Readiness</th>
                <th>Readiness Basis</th>
                <th>Health Index</th>
                <th>Predicted Fault Class</th>
                <th>RUL Estimate</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fleet.engines.map((eng: EngineRecord) => {
                const rd = evaluateMissionReadiness(eng);
                return (
                  <tr
                    key={eng.engine_id}
                    style={{
                      backgroundColor:
                        eng.engine_id === selectedEngineId
                          ? 'rgba(56, 189, 248, 0.08)'
                          : undefined,
                    }}
                  >
                    <td
                      className="mono"
                      style={{ fontWeight: 700, color: '#38bdf8' }}
                    >
                      {eng.engine_id}
                    </td>
                    <td className="mono">{eng.tail_number}</td>
                    <td className="mono">
                      {eng.total_operating_hours.toFixed(1)} h
                    </td>
                    <td>
                      <span className={statusBadgeClass(rd.readiness)}>
                        {rd.readiness}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: '#94a3b8' }}>
                      {rd.rationale}
                    </td>
                    <td className="mono" style={{ fontWeight: 700 }}>
                      <span
                        style={{
                          color:
                            eng.latest_health_index >= 75
                              ? '#34d399'
                              : eng.latest_health_index >= 55
                              ? '#fbbf24'
                              : '#ef4444',
                        }}
                      >
                        {eng.latest_health_index.toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          eng.latest_fault_class === 'Normal'
                            ? 'badge badge-nominal'
                            : eng.latest_fault_class === 'Sensor Fault'
                            ? 'badge badge-caution'
                            : 'badge badge-warning'
                        }
                      >
                        {eng.latest_fault_class}
                      </span>
                    </td>
                    <td className="mono">
                      {eng.latest_rul_status === 'ESTIMATED' &&
                      eng.latest_rul_hours !== null
                        ? `${eng.latest_rul_hours.toFixed(1)} hrs`
                        : 'NOT ESTIMABLE'}
                    </td>
                    <td>
                      <span className="badge badge-synthetic">
                        {eng.data_source}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-primary"
                          onClick={() => onSelectEngine(eng.engine_id, true)}
                        >
                          Inspect 3D Twin
                        </button>
                        <button
                          className="btn"
                          onClick={() => {
                            onSelectEngine(eng.engine_id, false);
                            onNavigate('faults');
                          }}
                        >
                          Faults ({eng.alert_count ?? 0})
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <ShieldCheck size={14} /> Fleet Fault Class Distribution
            </div>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={faultDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  stroke="#94a3b8"
                />
                <YAxis
                  type="category"
                  dataKey="fault_class"
                  width={155}
                  stroke="#cbd5e1"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#2a3d60',
                  }}
                />
                <Bar dataKey="count" name="Engines in Class" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <AlertTriangle size={14} /> Active & Acknowledged Fleet Alerts
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {(['ALL', 'UNACKNOWLEDGED', 'ACKNOWLEDGED'] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    className={`btn ${
                      alertFilter === tab ? 'btn-primary' : ''
                    }`}
                    onClick={() => setAlertFilter(tab)}
                  >
                    {tab}
                  </button>
                )
              )}
            </div>
          </div>
          <div style={{ maxHeight: 225, overflowY: 'auto' }}>
            {filteredAlerts.length === 0 ? (
              <div style={{ color: '#94a3b8' }}>
                No alerts matching filter ({alertFilter}).
              </div>
            ) : (
              filteredAlerts.slice(0, 8).map((alt: ExplainableAlert) => (
                <div
                  key={alt.alert_id}
                  className={`alert-box ${alt.severity.toLowerCase()}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    >
                      <span className={statusBadgeClass(alt.severity)}>
                        {alt.severity}
                      </span>
                      <strong className="mono">{alt.engine_id}</strong>
                      <span>—</span>
                      <strong>{alt.fault_class}</strong>
                      {alt.acknowledged && (
                        <span className="badge badge-nominal">
                          ACKNOWLEDGED
                        </span>
                      )}
                    </div>
                    <button
                      className="btn"
                      onClick={() =>
                        handleToggleAcknowledge(alt.alert_id, alt.acknowledged)
                      }
                    >
                      <CheckCircle2 size={11} />{' '}
                      {alt.acknowledged ? 'Unacknowledge' : 'Acknowledge'}
                    </button>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: 11.5 }}>
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

/* =========================================================================
   SCREEN 2: 3D ENGINE DIGITAL TWIN WORKSTATION (FOUR-VALUE + 3D VIEWPORT)
   ========================================================================= */
export const EngineDigitalTwinScreen: React.FC<{
  engineId: string;
  engineRecord?: EngineRecord | null;
  telemetry: FourValueDigitalTwinState[];
  latestState: FourValueDigitalTwinState | null;
  onRefreshEngine: () => Promise<void>;
  onNavigate: (screen: string) => void;
}> = ({
  engineId,
  engineRecord,
  telemetry,
  latestState,
  onRefreshEngine,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [wsStreaming, setWsStreaming] = useState<boolean>(false);
  const [wsFrame, setWsFrame] = useState<FourValueDigitalTwinState | null>(
    null
  );

  useEffect(() => {
    setSelectedIndex(-1);
    setWsFrame(null);
    setWsStreaming(false);
  }, [engineId, telemetry.length]);

  useEffect(() => {
    if (!wsStreaming) return;
    const ws = new WebSocket(drishtiApi.getWebSocketUrl(engineId));
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'telemetry_frame' && msg.twin_state) {
          setWsFrame(msg.twin_state);
        }
      } catch {
        // ignore parse error
      }
    };
    ws.onclose = () => {
      setWsStreaming(false);
    };
    return () => {
      ws.close();
    };
  }, [wsStreaming, engineId]);

  const activePoint: FourValueDigitalTwinState | null =
    wsFrame ||
    (selectedIndex >= 0 && selectedIndex < telemetry.length
      ? telemetry[selectedIndex]
      : latestState);

  if (!activePoint) {
    return (
      <div className="panel-card">
        No telemetry available for engine {engineId}.
      </div>
    );
  }

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
      channel: 'OilT (°C)',
      residual: activePoint.calculated.oil_temp_residual_c,
    },
    {
      channel: 'OilP×10 (bar)',
      residual: Number(
        (activePoint.calculated.oil_pressure_residual_bar * 10).toFixed(2)
      ),
    },
    {
      channel: 'Vib×5 (mm/s)',
      residual: Number(
        (activePoint.calculated.vibration_residual_mms * 5).toFixed(2)
      ),
    },
    {
      channel: 'Fuel (L/h)',
      residual: activePoint.calculated.fuel_flow_residual_lph,
    },
  ];

  return (
    <div>
      <div className="screen-header">
        <div>
          <div className="screen-title">
            3D Engine Digital Twin Workstation — {engineId} (Mission{' '}
            {activePoint.mission_id})
          </div>
          <div className="screen-desc">
            Interactive 3D Aero Piston Assembly synchronized with Four-Value
            State: ACTUAL (Measured/Sim) | EXPECTED (Physics Model) | CALCULATED
            (Residuals) | PREDICTED (ML Diagnostics & RUL).
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-synthetic">
            SOURCE: {activePoint.data_source} (
            {activePoint.is_synthetic ? 'SYNTHETIC' : 'RECORDED'})
          </span>
          <button
            className={`btn ${wsStreaming ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => setWsStreaming((v) => !v)}
          >
            <Radio size={13} />{' '}
            {wsStreaming ? 'Stop WebSocket Stream' : 'Stream via WebSocket'}
          </button>
          <button className="btn" onClick={() => onRefreshEngine()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* MISSION FRAME TIMELINE SCRUBBER */}
      <div className="panel-card" style={{ padding: '8px 12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
          }}
        >
          <div className="mono" style={{ fontSize: 11.5 }}>
            Data Freshness: <strong>Seq #{activePoint.sequence_number}</strong>{' '}
            | <strong>t = {activePoint.mission_elapsed_sec.toFixed(1)}s</strong>{' '}
            | {activePoint.timestamp}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, telemetry.length - 1)}
            value={
              selectedIndex >= 0
                ? selectedIndex
                : Math.max(0, telemetry.length - 1)
            }
            onChange={(e) => {
              setWsFrame(null);
              setSelectedIndex(Number(e.target.value));
            }}
            style={{ flex: 1, accentColor: '#38bdf8' }}
          />
          <button
            className="btn"
            onClick={() => {
              setWsFrame(null);
              setSelectedIndex(-1);
            }}
          >
            Latest Frame
          </button>
        </div>
      </div>

      {/* INTERACTIVE 3D ENGINE VIEWPORT + SUBSYSTEM TREE + INSPECTOR */}
      <Engine3DViewport
        twinState={activePoint}
        engineHours={engineRecord?.total_operating_hours ?? 420.0}
      />

      {/* THE FOUR-VALUE DIGITAL TWIN MATRIX */}
      <div className="grid-4">
        {/* 1. ACTUAL */}
        <div className="panel-card" style={{ borderTop: '2px solid #38bdf8' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#38bdf8' }}>
              1. ACTUAL (TELEMETRY)
            </div>
            <span
              className={
                activePoint.actual.quality.is_valid
                  ? 'badge badge-nominal'
                  : 'badge badge-caution'
              }
            >
              Q={activePoint.actual.quality.quality_score.toFixed(2)}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <div>RPM: {activePoint.actual.rpm.toFixed(0)} RPM</div>
            <div>
              Throttle / Load: {activePoint.actual.throttle_pct.toFixed(1)}% /{' '}
              {activePoint.actual.engine_load_pct.toFixed(1)}%
            </div>
            <div>
              Alt / Ambient: {activePoint.actual.altitude_m.toFixed(0)} m /{' '}
              {activePoint.actual.ambient_temp_c.toFixed(1)} °C
            </div>
            <div>CHT: {activePoint.actual.cht_c.toFixed(1)} °C</div>
            <div>EGT: {activePoint.actual.egt_c.toFixed(1)} °C</div>
            <div>
              Oil P / T: {activePoint.actual.oil_pressure_bar.toFixed(2)} bar /{' '}
              {activePoint.actual.oil_temp_c.toFixed(1)} °C
            </div>
            <div>Fuel Flow: {activePoint.actual.fuel_flow_lph.toFixed(2)} L/h</div>
            <div>
              Vibration: {activePoint.actual.vibration_rms_mms.toFixed(2)} mm/s
            </div>
            <div>
              Inj Pulse / Bat: {activePoint.actual.injection_pulse_ms.toFixed(2)}{' '}
              ms / {activePoint.actual.battery_voltage_v.toFixed(2)} V
            </div>
          </div>
          <div className="kpi-sub">
            Schema v{activePoint.actual.schema_version} | Source:{' '}
            {activePoint.actual.data_source}
          </div>
        </div>

        {/* 2. EXPECTED */}
        <div className="panel-card" style={{ borderTop: '2px solid #10b981' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#10b981' }}>
              2. EXPECTED (PHYSICS REF)
            </div>
            <span
              className={
                activePoint.expected.is_extrapolated
                  ? 'badge badge-warning'
                  : 'badge badge-nominal'
              }
            >
              {activePoint.expected.is_extrapolated
                ? 'EXTRAPOLATED'
                : 'IN ENVELOPE'}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <div>
              ISA Air Density σ:{' '}
              {activePoint.expected.air_density_ratio.toFixed(3)}
            </div>
            <div>
              Cooling Eff η:{' '}
              {activePoint.expected.cooling_effectiveness.toFixed(3)}
            </div>
            <div>Expected CHT: {activePoint.expected.cht_c.toFixed(1)} °C</div>
            <div>Expected EGT: {activePoint.expected.egt_c.toFixed(1)} °C</div>
            <div>
              Expected Oil P: {activePoint.expected.oil_pressure_bar.toFixed(2)}{' '}
              bar
            </div>
            <div>
              Expected Oil T: {activePoint.expected.oil_temp_c.toFixed(1)} °C
            </div>
            <div>
              Expected Fuel: {activePoint.expected.fuel_flow_lph.toFixed(2)} L/h
            </div>
            <div>
              Expected Vib: {activePoint.expected.vibration_rms_mms.toFixed(2)}{' '}
              mm/s
            </div>
            <div>
              Expected Pulse:{' '}
              {activePoint.expected.injection_pulse_ms.toFixed(2)} ms
            </div>
          </div>
          <div className="kpi-sub">
            Model: {activePoint.expected.model_version}
          </div>
        </div>

        {/* 3. CALCULATED */}
        <div className="panel-card" style={{ borderTop: '2px solid #f59e0b' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#f59e0b' }}>
              3. CALCULATED (RESIDUALS)
            </div>
            <span className="badge badge-info">DETERMINISTIC</span>
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <div>
              ΔCHT Residual:{' '}
              <strong
                style={{
                  color:
                    Math.abs(activePoint.calculated.cht_residual_c) > 12
                      ? '#f59e0b'
                      : '#e2e8f0',
                }}
              >
                {activePoint.calculated.cht_residual_c >= 0 ? '+' : ''}
                {activePoint.calculated.cht_residual_c.toFixed(2)} °C
              </strong>
            </div>
            <div>
              ΔEGT Residual:{' '}
              {activePoint.calculated.egt_residual_c >= 0 ? '+' : ''}
              {activePoint.calculated.egt_residual_c.toFixed(2)} °C
            </div>
            <div>
              ΔOil Pressure:{' '}
              <strong
                style={{
                  color:
                    activePoint.calculated.oil_pressure_residual_bar < -0.5
                      ? '#ef4444'
                      : '#e2e8f0',
                }}
              >
                {activePoint.calculated.oil_pressure_residual_bar >= 0
                  ? '+'
                  : ''}
                {activePoint.calculated.oil_pressure_residual_bar.toFixed(3)}{' '}
                bar
              </strong>
            </div>
            <div>
              ΔOil Temp:{' '}
              {activePoint.calculated.oil_temp_residual_c >= 0 ? '+' : ''}
              {activePoint.calculated.oil_temp_residual_c.toFixed(2)} °C
            </div>
            <div>
              ΔVibration:{' '}
              <strong
                style={{
                  color:
                    activePoint.calculated.vibration_residual_mms > 1.0
                      ? '#f59e0b'
                      : '#e2e8f0',
                }}
              >
                {activePoint.calculated.vibration_residual_mms >= 0 ? '+' : ''}
                {activePoint.calculated.vibration_residual_mms.toFixed(3)} mm/s
              </strong>
            </div>
            <div>
              ΔFuel Flow:{' '}
              {activePoint.calculated.fuel_flow_residual_lph >= 0 ? '+' : ''}
              {activePoint.calculated.fuel_flow_residual_lph.toFixed(2)} L/h
            </div>
            <div>
              CHT Slope:{' '}
              {activePoint.calculated.cht_rolling_slope_c_per_s.toFixed(3)} °C/s
            </div>
            <div>
              Thermal Margin:{' '}
              {activePoint.calculated.thermal_margin_pct.toFixed(1)}%
            </div>
            <div>
              Oil Margin:{' '}
              {activePoint.calculated.oil_pressure_margin_pct.toFixed(1)}%
            </div>
          </div>
          <div className="kpi-sub">
            Engine: {activePoint.calculated.calculator_version}
          </div>
        </div>

        {/* 4. PREDICTED */}
        <div className="panel-card" style={{ borderTop: '2px solid #38bdf8' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#38bdf8' }}>
              4. PREDICTED (ML ENSEMBLE)
            </div>
            <span
              className={
                activePoint.predicted.is_anomaly
                  ? 'badge badge-warning'
                  : 'badge badge-nominal'
              }
            >
              {activePoint.predicted.is_anomaly ? 'ANOMALY' : 'NORMAL'}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
            <div>
              Class:{' '}
              <strong style={{ color: '#38bdf8' }}>
                {activePoint.predicted.predicted_fault_class}
              </strong>
            </div>
            <div>
              Confidence:{' '}
              {(activePoint.predicted.top_probability * 100).toFixed(1)}%
            </div>
            <div>
              Certainty: {activePoint.predicted.diagnosis_certainty_status}
            </div>
            <div>
              IsoForest Score: {activePoint.predicted.anomaly_score.toFixed(3)}{' '}
              (Thr: {activePoint.predicted.anomaly_threshold.toFixed(3)})
            </div>
            <div>
              Sensor Status:{' '}
              {activePoint.predicted.sensor_diagnosis.diagnosis_status}
            </div>
            <div>
              Health Index:{' '}
              <strong>{activePoint.predicted.health_index.toFixed(1)}%</strong>
            </div>
            <div>
              RUL Status: <strong>{activePoint.predicted.rul_status}</strong>
            </div>
            <div>
              RUL Horizon:{' '}
              {activePoint.predicted.rul_status === 'ESTIMATED' &&
              activePoint.predicted.rul_hours !== null
                ? `${activePoint.predicted.rul_hours.toFixed(1)} hrs [${activePoint.predicted.rul_lower_10_hours?.toFixed(1)}–${activePoint.predicted.rul_upper_90_hours?.toFixed(1)}]`
                : 'NOT ESTIMABLE'}
            </div>
          </div>
          <div className="kpi-sub">
            Model: {activePoint.predicted.model_version}
          </div>
        </div>
      </div>

      {/* SYNCHRONIZED ACTUAL VS EXPECTED CHARTS */}
      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Activity size={13} /> Cylinder Head Temp (CHT °C): Actual vs
              Physics-Expected
            </div>
          </div>
          <div style={{ height: 215 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="elapsed" stroke="#94a3b8" unit="s" />
                <YAxis stroke="#94a3b8" domain={['auto', 'auto']} unit="°C" />
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
                />
                <Line
                  type="monotone"
                  dataKey="cht_expected"
                  name="Expected CHT (°C)"
                  stroke="#10b981"
                  strokeWidth={1.8}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <Activity size={13} /> Oil Pressure (bar) & Vibration (mm/s):
              Actual vs Expected
            </div>
          </div>
          <div style={{ height: 215 }}>
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
                  stroke="#10b981"
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
        </div>
      </div>

      <div className="grid-2">
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Instantaneous Residual Profile (Actual − Physics Expected) at Seq
              #{activePoint.sequence_number}
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residualComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="channel" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#2a3d60',
                  }}
                />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar
                  dataKey="residual"
                  name="Residual Deviation"
                  fill="#38bdf8"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              Exhaust Gas Temperature (EGT °C): Actual vs Physics-Expected
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="elapsed" stroke="#94a3b8" unit="s" />
                <YAxis stroke="#94a3b8" domain={['auto', 'auto']} unit="°C" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0a0f1d',
                    borderColor: '#2a3d60',
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
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 3: ENGINE HEALTH MONITORING (ALL 8 GROUPS) & TELEMETRY EXPLORER
   ========================================================================= */
export const TelemetryExplorerScreen: React.FC<{
  engineId: string;
  telemetry: FourValueDigitalTwinState[];
  onRefreshEngine: () => Promise<void>;
}> = ({ engineId, telemetry, onRefreshEngine }) => {
  const [selectedChannel, setSelectedChannel] = useState<string>('cht_c');
  const [paramGroups, setParamGroups] = useState<Record<string, any>[]>([]);
  const [csvText, setCsvText] = useState<string>(
    `sequence_number,mission_elapsed_sec,timestamp,rpm,cht_c,egt_c,oil_pressure_bar,oil_temp_c,fuel_flow_lph,vibration_rms_mms,throttle_pct,engine_load_pct,altitude_m,ambient_temp_c\n0,0.0,2026-10-03T08:00:00Z,5010,178.5,816.0,4.15,99.0,22.2,2.30,74.0,76.0,3000,14.0\n1,1.0,2026-10-03T08:00:01Z,5020,218.4,845.0,3.95,114.0,22.8,2.95,74.5,76.5,3005,14.0\n2,2.0,2026-10-03T08:00:02Z,4990,229.0,856.0,3.88,119.5,23.0,3.20,75.0,77.0,3010,14.0`
  );
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!engineId) return;
    drishtiApi
      .getEngineParameterGroups(engineId)
      .then((res) => setParamGroups(res.groups || []))
      .catch(() => setParamGroups([]));
  }, [engineId, telemetry.length]);

  const channelOptions = [
    { key: 'rpm', label: 'Group 1: Engine Speed (RPM)' },
    { key: 'cht_c', label: 'Group 2: Cylinder Head Temperature (degC)' },
    { key: 'egt_c', label: 'Group 3: Exhaust Gas Temperature (degC)' },
    { key: 'oil_pressure_bar', label: 'Group 4a: Oil Pressure (bar)' },
    { key: 'oil_temp_c', label: 'Group 4b: Oil Temperature (degC)' },
    { key: 'fuel_flow_lph', label: 'Group 5: Fuel Flow Rate (L/h)' },
    { key: 'vibration_rms_mms', label: 'Group 6: Broadband Vibration RMS (mm/s)' },
    { key: 'battery_voltage_v', label: 'Group 7a: Battery Bus Voltage (V)' },
    { key: 'alternator_current_a', label: 'Group 7b: Alternator Current (A)' },
    { key: 'injection_pulse_ms', label: 'Group 8a: Injection Pulse Width (ms)' },
    { key: 'ignition_advance_deg', label: 'Group 8b: Ignition Advance (deg BTDC)' },
  ];

  const handleExportCsv = () => {
    if (telemetry.length === 0) return;
    const headers = [
      'sequence_number',
      'mission_elapsed_sec',
      'timestamp',
      'rpm',
      'cht_c',
      'expected_cht_c',
      'cht_residual_c',
      'egt_c',
      'expected_egt_c',
      'oil_pressure_bar',
      'expected_oil_pressure_bar',
      'oil_temp_c',
      'fuel_flow_lph',
      'vibration_rms_mms',
      'battery_voltage_v',
      'alternator_current_a',
      'injection_pulse_ms',
      'ignition_advance_deg',
      'predicted_fault_class',
      'health_index',
      'rul_hours',
      'rul_cycles',
    ];
    const rows = telemetry.map((t) =>
      [
        t.sequence_number,
        t.mission_elapsed_sec,
        t.timestamp,
        t.actual.rpm,
        t.actual.cht_c,
        t.expected.cht_c,
        t.calculated.cht_residual_c,
        t.actual.egt_c,
        t.expected.egt_c,
        t.actual.oil_pressure_bar,
        t.expected.oil_pressure_bar,
        t.actual.oil_temp_c,
        t.actual.fuel_flow_lph,
        t.actual.vibration_rms_mms,
        t.actual.battery_voltage_v,
        t.actual.alternator_current_a,
        t.actual.injection_pulse_ms,
        t.actual.ignition_advance_deg,
        t.predicted.predicted_fault_class,
        t.predicted.health_index,
        t.predicted.rul_hours ?? '',
        t.predicted.rul_cycles ?? '',
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${engineId}_telemetry_twin_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleIngestCsv = async () => {
    setIngestStatus('Ingesting CSV telemetry...');
    try {
      const res = await drishtiApi.ingestCsv({
        csv_text: csvText,
        engine_id: engineId,
        mission_id: `MSN-CSV-${Date.now().toString().slice(-4)}`,
        title: 'User CSV Telemetry Import',
      });
      await onRefreshEngine();
      setIngestStatus(
        `Ingested ${res.summary.total_frames} frames into mission ${res.mission.mission_id}. Final Class: ${res.summary.final_predicted_class}`
      );
    } catch (err: any) {
      setIngestStatus(`CSV Ingest Error: ${err.message}`);
    }
  };

  const seriesData = telemetry.map((t) => ({
    elapsed: t.mission_elapsed_sec,
    actual: (t.actual as any)[selectedChannel],
    expected: (t.expected as any)[selectedChannel] ?? null,
    quality: t.actual.quality.quality_score,
  }));

  return (
    <div>
      <div className="screen-header">
        <div>
          <div className="screen-title">
            Engine Health Monitoring (All 8 SIH26054 Groups) & Telemetry Explorer — {engineId}
          </div>
          <div className="screen-desc">
            End-to-end monitoring across all 8 required propulsion parameter
            groups with engineering units, physics baselines, configurable alert
            limits, historical min/mean/max comparisons, and CSV ingestion.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="select-control"
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
          >
            {channelOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleExportCsv}>
            <Download size={13} /> Export Twin CSV
          </button>
        </div>
      </div>

      {/* ALL 8 SIH26054 PARAMETER GROUPS MATRIX */}
      {paramGroups.length > 0 && (
        <div className="panel-card">
          <div className="panel-card-header">
            <div className="panel-card-title">
              <ShieldCheck size={14} /> SIH26054 Complete 8-Group Propulsion Health Monitoring Matrix
            </div>
            <span className="badge badge-info">ALL 8 PARAMETER GROUPS VERIFIED</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="eng-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Parameter Group</th>
                  <th>Current Value</th>
                  <th>Physics Expected</th>
                  <th>Residual & Trend</th>
                  <th>Operating Envelope & Limits</th>
                  <th>Mission Min / Mean / Max</th>
                  <th>Health Contribution</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paramGroups.map((g) => (
                  <tr key={g.group_id}>
                    <td>
                      <strong>{g.group_name}</strong>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        {g.quality_freshness}
                      </div>
                    </td>
                    <td style={{ color: '#38bdf8', fontWeight: 700 }}>
                      {g.current_value}
                    </td>
                    <td style={{ color: '#10b981' }}>{g.expected_value}</td>
                    <td>{g.residual_value}</td>
                    <td style={{ fontSize: 10.5, color: '#cbd5e1' }}>
                      {g.operating_range}
                    </td>
                    <td style={{ fontSize: 10.5 }}>
                      {g.historical_stats?.min} / {g.historical_stats?.mean} /{' '}
                      {g.historical_stats?.max}
                    </td>
                    <td style={{ fontSize: 10.5, color: '#94a3b8' }}>
                      {g.health_contribution}
                    </td>
                    <td>
                      <span className={statusBadgeClass(g.severity)}>
                        {g.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Channel Time-Series Inspector: {selectedChannel}
          </div>
        </div>
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={seriesData}>
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
                dataKey="actual"
                name={`Actual ${selectedChannel}`}
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                name={`Physics Expected ${selectedChannel}`}
                stroke="#10b981"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            <Upload size={13} /> Historical CSV Telemetry Ingestion
          </div>
          <button className="btn btn-primary" onClick={handleIngestCsv}>
            Validate & Ingest CSV Payload
          </button>
        </div>
        <textarea
          className="input-control mono"
          rows={4}
          style={{ width: '100%', marginBottom: 8 }}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        {ingestStatus && (
          <div className="mono" style={{ color: '#38bdf8', fontSize: 11.5 }}>
            {ingestStatus}
          </div>
        )}
      </div>

      <div className="panel-card">
        <div className="panel-card-header">
          <div className="panel-card-title">
            Telemetry Contract Frame Log (Latest 20 Frames)
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="eng-table mono">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Time (s)</th>
                <th>RPM</th>
                <th>CHT (°C)</th>
                <th>EGT (°C)</th>
                <th>Oil P (bar)</th>
                <th>Oil T (°C)</th>
                <th>Fuel (L/h)</th>
                <th>Vib (mm/s)</th>
                <th>Quality</th>
                <th>Predicted Class</th>
              </tr>
            </thead>
            <tbody>
              {telemetry
                .slice(-20)
                .reverse()
                .map((t) => (
                  <tr key={t.sequence_number}>
                    <td>#{t.sequence_number}</td>
                    <td>{t.mission_elapsed_sec.toFixed(1)}s</td>
                    <td>{t.actual.rpm.toFixed(0)}</td>
                    <td>
                      {t.actual.cht_c.toFixed(1)} (
                      {t.calculated.cht_residual_c >= 0 ? '+' : ''}
                      {t.calculated.cht_residual_c.toFixed(1)})
                    </td>
                    <td>{t.actual.egt_c.toFixed(1)}</td>
                    <td>{t.actual.oil_pressure_bar.toFixed(2)}</td>
                    <td>{t.actual.oil_temp_c.toFixed(1)}</td>
                    <td>{t.actual.fuel_flow_lph.toFixed(2)}</td>
                    <td>{t.actual.vibration_rms_mms.toFixed(2)}</td>
                    <td>
                      <span
                        className={
                          t.actual.quality.is_valid
                            ? 'badge badge-nominal'
                            : 'badge badge-caution'
                        }
                      >
                        {t.actual.quality.quality_score.toFixed(2)}
                      </span>
                    </td>
                    <td>{t.predicted.predicted_fault_class}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
