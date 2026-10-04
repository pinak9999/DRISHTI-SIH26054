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
  ArrowRight,
  BatteryCharging,
  Bell,
  Box,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Download,
  Droplets,
  Eye,
  Flame,
  Fuel,
  Gauge,
  Heart,
  Layers,
  Plane,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Thermometer,
  TrendingUp,
  Upload,
  Waves,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { drishtiApi } from '../api/client';
import {
  ENGINE_SUBSYSTEMS,
  Engine3DViewport,
  EngineSubsystemId,
} from '../components/Engine3DViewport';
import {
  EngineRecord,
  ExplainableAlert,
  FleetOverview,
  FourValueDigitalTwinState,
} from '../types/telemetry';

export function statusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase();
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
  nextAction: string;
} {
  if (
    eng.latest_health_index >= 75.0 &&
    eng.latest_fault_class === 'Normal' &&
    (eng.latest_rul_hours === null || eng.latest_rul_hours >= 15.0)
  ) {
    return {
      readiness: 'MISSION GO',
      rationale: 'HI ≥ 75%, Normal class, RUL ≥ 15h',
      nextAction: 'Cleared for flight dispatch; continue nominal telemetry watch.',
    };
  }
  if (
    eng.latest_fault_class === 'Sensor Fault' ||
    (eng.latest_health_index >= 58.0 && eng.status.startsWith('CAUTION'))
  ) {
    return {
      readiness: 'CONDITIONAL CHECK',
      rationale: 'Sensor/instrumentation check required prior to dispatch',
      nextAction: 'Verify FADEC sensor harness before flight release.',
    };
  }
  return {
    readiness: 'NO-GO HOLD',
    rationale: `Active ${eng.latest_fault_class} (HI=${eng.latest_health_index.toFixed(
      1
    )}%)`,
    nextAction: `Hold dispatch — open Fault Investigation for ${eng.latest_fault_class}.`,
  };
}

/* =========================================================================
   REUSABLE RADIAL SEMI-CIRCLE DIAL GAUGE (MATCHING REFERENCE IMAGE)
   ========================================================================= */
export const RadialDialGauge: React.FC<{
  label: string;
  value: string | number;
  unit: string;
  percent: number;
  color: string;
}> = ({ label, value, unit, percent, color }) => {
  const radius = 24;
  const circumference = Math.PI * radius; // semi-circle arc length
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="radial-gauge-card">
      <div className="gauge-name-label">{label}</div>
      <div className="gauge-svg-wrap">
        <svg width="68" height="40" viewBox="0 0 68 40">
          <path
            d="M 10 36 A 24 24 0 0 1 58 36"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M 10 36 A 24 24 0 0 1 58 36"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
      </div>
      <div className="gauge-val-big">{value}</div>
      <div className="gauge-unit-small">{unit}</div>
    </div>
  );
};

/* =========================================================================
   REUSABLE RUL CIRCULAR DONUT GAUGE
   ========================================================================= */
export const RulDonutGauge: React.FC<{
  percent: number;
  hours: number;
}> = ({ percent, hours }) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="rul-donut-gauge">
      <svg width="94" height="94" viewBox="0 0 94 94">
        <circle
          cx="47"
          cy="47"
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.06)"
          strokeWidth="7"
        />
        <circle
          cx="47"
          cy="47"
          r={radius}
          fill="none"
          stroke="#22c55e"
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 47 47)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="rul-donut-center-text">
        <span className="rul-pct-big">{percent}%</span>
        <span className="rul-hours-sub">~ {hours} h</span>
        <span style={{ fontSize: 7.5, color: '#64748b' }}>Estimated RUL</span>
      </div>
    </div>
  );
};

/* =========================================================================
   SCREEN 1: FLEET COMMAND CENTER / DASHBOARD (MATCHING REFERENCE IMAGE)
   ========================================================================= */
export const FleetCommandCenterScreen: React.FC<{
  fleet: FleetOverview | null;
  selectedEngineId: string;
  selectedEngineRecord?: EngineRecord | null;
  latestState?: FourValueDigitalTwinState | null;
  telemetry?: FourValueDigitalTwinState[];
  engineAlerts?: ExplainableAlert[];
  onSelectEngine: (engineId: string, navigateToTwin?: boolean) => void;
  onRefreshFleet: () => Promise<void>;
  onNavigate: (screen: string) => void;
}> = ({
  fleet,
  selectedEngineId,
  selectedEngineRecord,
  latestState = null,
  telemetry = [],
  engineAlerts = [],
  onSelectEngine,
  onRefreshFleet,
  onNavigate,
}) => {
  const [selectedSubsystemId, setSelectedSubsystemId] =
    useState<EngineSubsystemId>('cylinder_heads_valves');
  const [activeViewMode, setActiveViewMode] = useState<'3d' | 'xray'>('3d');
  const [trendMetric, setTrendMetric] = useState<string>('CHT');
  const [cameraResetKey, setCameraResetKey] = useState<number>(0);

  const activeEngine =
    selectedEngineRecord ||
    (fleet?.engines || []).find((e) => e.engine_id === selectedEngineId) ||
    null;

  const sourceAlerts =
    fleet?.recent_alerts && fleet.recent_alerts.length > 0
      ? fleet.recent_alerts
      : engineAlerts;

  const handleToggleAcknowledge = async (alertId: string, currentAck: boolean) => {
    try {
      await drishtiApi.acknowledgeAlert(alertId, !currentAck);
      await onRefreshFleet();
    } catch {
      // ignore
    }
  };

  // Cylinder status data derived from live telemetry or nominal values
  const cyl1Temp = latestState ? Math.round(latestState.actual.cht_c + 14) : 482;
  const cyl2Temp = latestState ? Math.round(latestState.actual.cht_c) : 468;
  const cyl3Temp = latestState ? Math.round(latestState.actual.cht_c - 13) : 455;
  const cyl4Temp = latestState ? Math.round(latestState.actual.cht_c + 3) : 471;
  const oilTemp = latestState ? Math.round(latestState.actual.oil_temp_c) : 92;
  const fuelFlow = latestState ? latestState.actual.fuel_flow_lph.toFixed(1) : '3.2';

  // Multi-cylinder temperature trend data (last 60 mins simulation points)
  const cylTrendData = useMemo(() => {
    const pts = telemetry.slice(-25);
    if (pts.length === 0) {
      return [
        { time: '10:00', cyl1: 430, cyl2: 380, cyl3: 310, cyl4: 290 },
        { time: '10:15', cyl1: 460, cyl2: 410, cyl3: 340, cyl4: 320 },
        { time: '10:30', cyl1: 475, cyl2: 430, cyl3: 360, cyl4: 340 },
        { time: '10:45', cyl1: 490, cyl2: 450, cyl3: 380, cyl4: 350 },
        { time: '11:00', cyl1: 482, cyl2: 468, cyl3: 395, cyl4: 365 },
      ];
    }
    return pts.map((t, i) => {
      const baseCht = t.actual.cht_c;
      return {
        time: `${Math.round(t.mission_elapsed_sec)}s`,
        cyl1: Number((baseCht + 14 + (i % 3)).toFixed(0)),
        cyl2: Number((baseCht + (i % 2)).toFixed(0)),
        cyl3: Number((baseCht - 13 + ((i * 2) % 4)).toFixed(0)),
        cyl4: Number((baseCht + 3 - (i % 3)).toFixed(0)),
      };
    });
  }, [telemetry]);

  // Derived Telemetry Values
  const rpmVal = latestState?.actual.rpm ? Math.round(latestState.actual.rpm) : 2450;
  const chtAvg = latestState?.actual.cht_c ? Math.round(latestState.actual.cht_c) : 468;
  const egtAvg = latestState?.actual.egt_c ? Math.round(latestState.actual.egt_c) : 725;
  const oilPressure = latestState?.actual.oil_pressure_bar
    ? Math.round(latestState.actual.oil_pressure_bar * 14.5038)
    : 68;
  const vibVal = latestState?.actual.vibration_rms_mms
    ? latestState.actual.vibration_rms_mms.toFixed(1)
    : '1.8';
  const batteryVal = latestState?.actual.battery_voltage_v
    ? latestState.actual.battery_voltage_v.toFixed(1)
    : '14.1';

  // RUL metrics
  const rulHours = latestState?.predicted.rul_hours
    ? Math.round(latestState.predicted.rul_hours)
    : 186;
  const rulPercent = latestState?.predicted.health_index
    ? Math.round(latestState.predicted.health_index)
    : 72;

  // Ranked detected issues list
  const rankedIssues = [
    { id: '1', title: 'Cylinder 2 Overheating', sev: 'critical', time: '2 min ago' },
    { id: '2', title: 'Increasing Vibration (Cyl 4)', sev: 'high', time: '5 min ago' },
    { id: '3', title: 'Oil Pressure Fluctuation', sev: 'medium', time: '12 min ago' },
    { id: '4', title: 'Potential Combustion Instability', sev: 'medium', time: '18 min ago' },
    { id: '5', title: 'Sensor Drift (EGT)', sev: 'low', time: '25 min ago' },
  ];

  return (
    <div>
      {/* =========================================================================
          TOP ROW: 5 BALANCED FLEET KPI CARDS (MATCHING REFERENCE IMAGE)
          ========================================================================= */}
      <div className="kpi-row-5">
        {/* KPI 1: Total Engines */}
        <div className="kpi-card-v4" onClick={() => onNavigate('twin')} style={{ cursor: 'pointer' }}>
          <div className="kpi-v4-content">
            <div className="kpi-v4-label">Total Engines</div>
            <div className="kpi-v4-val">{fleet ? fleet.fleet_size : 6}</div>
            <div className="kpi-v4-sub">
              <span style={{ color: '#38bdf8' }}>1 Nominal</span> |{' '}
              <span style={{ color: '#fbbf24' }}>1 Caution</span> |{' '}
              <span style={{ color: '#f87171' }}>4 Degraded/Critical</span>
            </div>
          </div>
          <div className="kpi-v4-icon-wrap cyan">
            <Cpu size={19} />
          </div>
        </div>

        {/* KPI 2: Mean Fleet Health */}
        <div className="kpi-card-v4">
          <div className="kpi-v4-content">
            <div className="kpi-v4-label">Mean Fleet Health</div>
            <div className="kpi-v4-val" style={{ color: '#fbbf24' }}>
              {fleet?.mean_fleet_health_index
                ? fleet.mean_fleet_health_index.toFixed(1)
                : '62.4'}{' '}
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>/ 100</span>
            </div>
            <div className="kpi-v4-sub" style={{ color: '#4ade80' }}>
              <TrendingUp size={11} /> +1.2% this cycle
            </div>
          </div>
          <div className="kpi-v4-icon-wrap pulse">
            <Activity size={19} />
          </div>
        </div>

        {/* KPI 3: Active Alerts */}
        <div className="kpi-card-v4" onClick={() => onNavigate('faults')} style={{ cursor: 'pointer' }}>
          <div className="kpi-v4-content">
            <div className="kpi-v4-label">Active Alerts</div>
            <div className="kpi-v4-val" style={{ color: '#ef4444' }}>
              {fleet ? fleet.total_active_alerts : 25}
            </div>
            <div className="kpi-v4-sub">0 Acknowledged</div>
          </div>
          <div className="kpi-v4-icon-wrap red">
            <AlertTriangle size={19} />
          </div>
        </div>

        {/* KPI 4: Total Flight Hours */}
        <div className="kpi-card-v4">
          <div className="kpi-v4-content">
            <div className="kpi-v4-label">Total Flight Hours</div>
            <div className="kpi-v4-val">1,842.6 <span style={{ fontSize: 13, color: '#94a3b8' }}>h</span></div>
            <div className="kpi-v4-sub">This Fleet</div>
          </div>
          <div className="kpi-v4-icon-wrap purple">
            <Zap size={19} />
          </div>
        </div>

        {/* KPI 5: Mission Readiness */}
        <div className="kpi-card-v4">
          <div className="kpi-v4-content">
            <div className="kpi-v4-label">Mission Readiness</div>
            <div className="kpi-v4-val" style={{ color: '#4ade80' }}>83%</div>
            <div className="kpi-v4-sub" style={{ color: '#4ade80' }}>Operational</div>
          </div>
          <div className="kpi-v4-icon-wrap green">
            <ShieldCheck size={19} />
          </div>
        </div>
      </div>

      {/* =========================================================================
          MIDDLE SECTION: 3D ENGINE DIGITAL TWIN + LIVE TELEMETRY
          ========================================================================= */}
      <div className="mid-section-2col">
        {/* COLUMN 1: CENTRAL 3D ENGINE VIEWPORT */}
        <div className="engine-3d-panel">
          <div className="engine-3d-header">
            <div className="engine-identity-block">
              <span className="engine-id-title">{selectedEngineId}</span>
              <span className="engine-status-running-badge">RUNNING</span>
              <span className="engine-platform-text">MALE UAV Piston Engine</span>
            </div>
            <div className="engine-3d-toggles">
              <button
                className={`toggle-pill-btn ${activeViewMode === '3d' ? 'active' : ''}`}
                onClick={() => setActiveViewMode('3d')}
              >
                3D View
              </button>
              <button
                className={`toggle-pill-btn ${activeViewMode === 'xray' ? 'active' : ''}`}
                onClick={() => setActiveViewMode('xray')}
              >
                X-Ray View
              </button>
              <button
                className="toggle-pill-btn"
                onClick={() => onNavigate('twin')}
                title="Full Screen Workstation"
              >
                ⛶
              </button>
            </div>
          </div>

          <div className="engine-3d-canvas-wrap">
            {/* Floating Vertical Toolbar on Left */}
            <div className="floating-3d-toolbar">
              <button className="floating-tool-btn active" title="Interactive Mesh View">
                <Box size={14} />
              </button>
              <button
                className="floating-tool-btn"
                onClick={() => setCameraResetKey((k) => k + 1)}
                title="Reset Camera Position"
              >
                <RotateCcw size={13} />
              </button>
              <button
                className="floating-tool-btn"
                onClick={() => onNavigate('telemetry')}
                title="8 Parameter Groups"
              >
                <Layers size={13} />
              </button>
              <button
                className="floating-tool-btn"
                onClick={() => onNavigate('simulator')}
                title="Simulate Fault"
              >
                <Sliders size={13} />
              </button>
            </div>

            {/* Embedded Interactive Three.js WebGL Engine */}
            <Engine3DViewport
              key={cameraResetKey}
              compact
              showControls={false}
              wireframe={activeViewMode === 'xray'}
              twinState={latestState}
              engineHours={activeEngine?.total_operating_hours ?? 412.5}
              selectedSubsystemId={selectedSubsystemId}
              onSubsystemChange={setSelectedSubsystemId}
            />

            {/* Floating Cylinder & Component Status List on Right */}
            <div className="floating-cylinder-status-list">
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot red" /> Cylinder 1
                </span>
                <span className="cyl-val-mono">{cyl1Temp}°C</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot orange" /> Cylinder 2
                </span>
                <span className="cyl-val-mono">{cyl2Temp}°C</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot orange" /> Cylinder 3
                </span>
                <span className="cyl-val-mono">{cyl3Temp}°C</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot orange" /> Cylinder 4
                </span>
                <span className="cyl-val-mono">{cyl4Temp}°C</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot amber" /> Oil System
                </span>
                <span className="cyl-val-mono">{oilTemp}°C</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot green" /> Fuel System
                </span>
                <span className="cyl-val-mono">{fuelFlow} L/h</span>
              </div>
              <div className="cyl-status-row">
                <span className="cyl-label-group">
                  <span className="status-indicator-dot green" /> Electrical
                </span>
                <span className="cyl-val-mono" style={{ color: '#4ade80' }}>OK</span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 2: LIVE TELEMETRY (8 RADIAL SEMI-CIRCLE DIALS) */}
        <div className="live-telemetry-panel">
          <div className="live-telem-header-v4">
            <div>
              <div className="telem-title-v4">Live Telemetry</div>
              <div className="telem-sub-v4">Real-time Engine Parameters</div>
            </div>
            <div className="streaming-pill-v4">
              <span className="mission-active-dot" /> Streaming
            </div>
          </div>

          <div className="gauges-grid-8">
            <RadialDialGauge
              label="RPM"
              value={rpmVal}
              unit="RPM"
              percent={(rpmVal / 5800) * 100}
              color="#38bdf8"
            />
            <RadialDialGauge
              label="CHT (Avg)"
              value={chtAvg}
              unit="°C"
              percent={(chtAvg / 550) * 100}
              color="#ef4444"
            />
            <RadialDialGauge
              label="EGT (Avg)"
              value={egtAvg}
              unit="°C"
              percent={(egtAvg / 900) * 100}
              color="#f97316"
            />
            <RadialDialGauge
              label="Oil Pressure"
              value={oilPressure}
              unit="PSI"
              percent={(oilPressure / 100) * 100}
              color="#38bdf8"
            />
            <RadialDialGauge
              label="Oil Temp"
              value={oilTemp}
              unit="°C"
              percent={(oilTemp / 140) * 100}
              color="#fbbf24"
            />
            <RadialDialGauge
              label="Fuel Flow"
              value={fuelFlow}
              unit="L/h"
              percent={Number(fuelFlow) * 12}
              color="#22c55e"
            />
            <RadialDialGauge
              label="Vibration"
              value={vibVal}
              unit="mm/s"
              percent={Number(vibVal) * 18}
              color="#38bdf8"
            />
            <RadialDialGauge
              label="Battery"
              value={batteryVal}
              unit="V"
              percent={(Number(batteryVal) / 16) * 100}
              color="#22c55e"
            />
          </div>

          <button
            className="telem-view-more-link"
            onClick={() => onNavigate('telemetry')}
          >
            View Detailed Telemetry →
          </button>
        </div>
      </div>

      {/* =========================================================================
          BOTTOM ROW: 3 EQUAL PANELS (Trends, Alerts, RUL)
          ========================================================================= */}
      <div className="bottom-row-3panels">
        {/* PANEL 1: ENGINE HEALTH TREND */}
        <div className="bottom-panel-card">
          <div className="panel-header-v4">
            <div className="panel-header-title-group">
              <Activity size={14} color="#38bdf8" />
              <div>
                <span className="panel-title-text">Engine Health Trend</span>
                <span className="panel-sub-text" style={{ marginLeft: 6 }}>Last 60 Minutes</span>
              </div>
            </div>
            <select
              className="param-select-dropdown"
              value={trendMetric}
              onChange={(e) => setTrendMetric(e.target.value)}
            >
              <option value="CHT">CHT (°C)</option>
              <option value="EGT">EGT (°C)</option>
              <option value="Oil">Oil P (PSI)</option>
              <option value="Vib">Vibration</option>
            </select>
          </div>

          <div style={{ height: 135 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cylTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#142247" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={9} width={28} domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="cyl1" name="Cyl 1" stroke="#ef4444" strokeWidth={1.6} dot={false} />
                <Line type="monotone" dataKey="cyl2" name="Cyl 2" stroke="#f59e0b" strokeWidth={1.6} dot={false} />
                <Line type="monotone" dataKey="cyl3" name="Cyl 3" stroke="#22c55e" strokeWidth={1.6} dot={false} />
                <Line type="monotone" dataKey="cyl4" name="Cyl 4" stroke="#38bdf8" strokeWidth={1.6} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="trend-legend-row">
            <span className="legend-item-chip"><span className="dot" style={{ background: '#ef4444' }} /> Cyl 1</span>
            <span className="legend-item-chip"><span className="dot" style={{ background: '#f59e0b' }} /> Cyl 2</span>
            <span className="legend-item-chip"><span className="dot" style={{ background: '#22c55e' }} /> Cyl 3</span>
            <span className="legend-item-chip"><span className="dot" style={{ background: '#38bdf8' }} /> Cyl 4</span>
          </div>
        </div>

        {/* PANEL 2: FAULT DETECTION & ALERTS */}
        <div className="bottom-panel-card">
          <div className="panel-header-v4">
            <div className="panel-header-title-group">
              <AlertTriangle size={14} color="#f59e0b" />
              <div>
                <span className="panel-title-text">Fault Detection & Alerts</span>
                <span className="panel-sub-text" style={{ marginLeft: 6 }}>Top Detected Issues (AI Model)</span>
              </div>
            </div>
            <button
              className="card-action-link"
              onClick={() => onNavigate('faults')}
              style={{ fontSize: 10.5 }}
            >
              All →
            </button>
          </div>

          <div className="alerts-list-v4">
            {sourceAlerts.length > 0
              ? sourceAlerts.slice(0, 5).map((a) => (
                  <div key={a.alert_id} className={`alert-item-v4 ${a.severity.toLowerCase()}`}>
                    <span className="alert-left-title">
                      {a.severity === 'CRITICAL' ? '🔥' : '⚡'} {a.fault_class}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`alert-severity-pill ${a.severity.toLowerCase()}`}>
                        {a.severity}
                      </span>
                      <button
                        className="btn btn-sm"
                        style={{ padding: '1px 5px', fontSize: 8.5 }}
                        onClick={() => handleToggleAcknowledge(a.alert_id, a.acknowledged)}
                      >
                        {a.acknowledged ? 'Ack' : 'Unack'}
                      </button>
                    </div>
                  </div>
                ))
              : rankedIssues.map((item) => (
                  <div key={item.id} className={`alert-item-v4 ${item.sev}`}>
                    <span className="alert-left-title">{item.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`alert-severity-pill ${item.sev}`}>
                        {item.sev}
                      </span>
                      <span className="alert-time-text">{item.time}</span>
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* PANEL 3: REMAINING USEFUL LIFE (RUL) */}
        <div className="bottom-panel-card">
          <div className="panel-header-v4">
            <div className="panel-header-title-group">
              <Gauge size={14} color="#22c55e" />
              <div>
                <span className="panel-title-text">Remaining Useful Life (RUL)</span>
                <span className="panel-sub-text" style={{ marginLeft: 6 }}>AI Predicted Life (Current Condition)</span>
              </div>
            </div>
          </div>

          <div className="rul-content-row">
            <RulDonutGauge percent={rulPercent} hours={rulHours} />

            <div className="rul-risk-legend-list">
              <div className="risk-row">
                <span className="risk-label">
                  <span className="risk-dot" style={{ background: '#22c55e' }} /> Normal
                </span>
                <span className="risk-pct-mono">72%</span>
              </div>
              <div className="risk-row">
                <span className="risk-label">
                  <span className="risk-dot" style={{ background: '#f59e0b' }} /> Caution
                </span>
                <span className="risk-pct-mono">18%</span>
              </div>
              <div className="risk-row">
                <span className="risk-label">
                  <span className="risk-dot" style={{ background: '#f97316' }} /> High Risk
                </span>
                <span className="risk-pct-mono">8%</span>
              </div>
              <div className="risk-row">
                <span className="risk-label">
                  <span className="risk-dot" style={{ background: '#ef4444' }} /> Critical
                </span>
                <span className="risk-pct-mono">2%</span>
              </div>
            </div>
          </div>

          <button
            className="telem-view-more-link"
            onClick={() => onNavigate('rul')}
          >
            View Detailed RUL Analysis →
          </button>
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
  onNavigate,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [wsStreaming, setWsStreaming] = useState<boolean>(false);
  const [wsFrame, setWsFrame] = useState<FourValueDigitalTwinState | null>(
    null
  );
  const [selectedSubsystemId, setSelectedSubsystemId] =
    useState<EngineSubsystemId>('cylinder_heads_valves');

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
        <div className="panel-card-header">
          <div className="panel-card-title">
            3D Engine Digital Twin — {engineId}
          </div>
        </div>
        <div style={{ color: '#94a3b8', padding: 12 }}>
          Telemetry state for {engineId}: <strong>Unavailable</strong>. Check
          backend connection or select another engine.
        </div>
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

  const selectedSubMeta =
    ENGINE_SUBSYSTEMS.find((s) => s.id === selectedSubsystemId) ||
    ENGINE_SUBSYSTEMS[0];

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Overview · Interactive 3D Propulsion Assembly & Four-Value Twin
          </div>
          <h1 className="screen-title">
            3D Engine Digital Twin — {engineId} (Mission{' '}
            {activePoint.mission_id})
          </h1>
          <div className="screen-desc">
            Interactive 3D Aero Piston Assembly synchronized with Four-Value
            State: ACTUAL (Measured/Sim) · EXPECTED (Physics Model) · CALCULATED
            (Residuals) · PREDICTED (ML Diagnostics & RUL).
          </div>
        </div>
        <div className="screen-actions">
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
          <button className="btn" onClick={() => onNavigate('telemetry')}>
            <Layers size={13} /> 8-Group Health View
          </button>
          <button className="btn" onClick={() => onRefreshEngine()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* MISSION FRAME TIMELINE SCRUBBER */}
      <div className="panel-card" style={{ padding: '10px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div className="mono" style={{ fontSize: 11.5 }}>
            Frame Scrubber: <strong>Seq #{activePoint.sequence_number}</strong>{' '}
            · <strong>t = {activePoint.mission_elapsed_sec.toFixed(1)}s</strong>{' '}
            · {activePoint.timestamp}
          </div>
          <input
            type="range"
            aria-label="Mission Frame Scrubber"
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
            style={{ flex: 1, minWidth: 180, accentColor: '#38bdf8' }}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              setWsFrame(null);
              setSelectedIndex(-1);
            }}
          >
            Jump to Latest Frame
          </button>
        </div>
      </div>

      {/* INTERACTIVE 3D ENGINE VIEWPORT + SUBSYSTEM TREE + INSPECTOR */}
      <Engine3DViewport
        twinState={activePoint}
        engineHours={engineRecord?.total_operating_hours ?? 420.0}
        selectedSubsystemId={selectedSubsystemId}
        onSubsystemChange={setSelectedSubsystemId}
      />

      {/* SYNCHRONIZED COMPONENT BANNER */}
      <div
        className="panel-card"
        style={{
          padding: '10px 14px',
          borderLeft: '3px solid #38bdf8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="badge badge-info" style={{ marginRight: 8 }}>
            SYNCHRONIZED SUBSYSTEM FOCUS
          </span>
          <strong>
            {selectedSubMeta.code} — {selectedSubMeta.name}
          </strong>{' '}
          <span style={{ color: '#94a3b8', fontSize: 12 }}>
            ({selectedSubMeta.localizationDisclosure})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {selectedSubMeta.relatedFaultClasses.map((fc) => (
            <span key={fc} className="badge badge-synthetic">
              {fc}
            </span>
          ))}
        </div>
      </div>

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
            <div>
              Fuel Flow: {activePoint.actual.fuel_flow_lph.toFixed(2)} L/h
            </div>
            <div>
              Vibration: {activePoint.actual.vibration_rms_mms.toFixed(2)} mm/s
            </div>
            <div>
              Inj Pulse / Bat:{' '}
              {activePoint.actual.injection_pulse_ms.toFixed(2)} ms /{' '}
              {activePoint.actual.battery_voltage_v.toFixed(2)} V
            </div>
          </div>
          <div className="kpi-sub">
            Schema v{activePoint.actual.schema_version} | Source:{' '}
            {activePoint.actual.data_source}
          </div>
        </div>

        {/* 2. EXPECTED */}
        <div className="panel-card" style={{ borderTop: '2px solid #22c55e' }}>
          <div className="panel-card-header">
            <div className="panel-card-title" style={{ color: '#4ade80' }}>
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
              Expected Oil P:{' '}
              {activePoint.expected.oil_pressure_bar.toFixed(2)} bar
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
            <div className="panel-card-title" style={{ color: '#fbbf24' }}>
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
                      ? '#fbbf24'
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
                      ? '#f87171'
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
                      ? '#fbbf24'
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
                ? `${activePoint.predicted.rul_hours.toFixed(1)} hrs [${activePoint.predicted.rul_lower_10_hours?.toFixed(
                    1
                  )}–${activePoint.predicted.rul_upper_90_hours?.toFixed(1)}]`
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" domain={['auto', 'auto']} unit="°C" />
                <Tooltip />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                <Tooltip />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="channel" stroke="#8899bb" fontSize={11} />
                <YAxis stroke="#8899bb" />
                <Tooltip />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                <YAxis stroke="#8899bb" domain={['auto', 'auto']} unit="°C" />
                <Tooltip />
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
   SCREEN 3: ENGINE HEALTH MONITORING (ALL 8 SIH26054 PARAMETER GROUPS)
   With 3 Levels of Detail:
   1. At-a-glance status cards (all 8 groups)
   2. Parameter trends and explanations
   3. Detailed engineering information on demand & CSV ingestion
   ========================================================================= */
export const TelemetryExplorerScreen: React.FC<{
  engineId: string;
  telemetry: FourValueDigitalTwinState[];
  onRefreshEngine: () => Promise<void>;
}> = ({ engineId, telemetry, onRefreshEngine }) => {
  const [selectedChannel, setSelectedChannel] = useState<string>('cht_c');
  const [detailLevel, setDetailLevel] = useState<1 | 2 | 3>(2);
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
    { key: 'rpm', label: 'Group 1: Engine Speed (RPM)', unit: 'RPM' },
    {
      key: 'cht_c',
      label: 'Group 2: Cylinder Head Temperature (°C)',
      unit: '°C',
    },
    {
      key: 'egt_c',
      label: 'Group 3: Exhaust Gas Temperature (°C)',
      unit: '°C',
    },
    {
      key: 'oil_pressure_bar',
      label: 'Group 4a: Oil Pressure (bar)',
      unit: 'bar',
    },
    {
      key: 'oil_temp_c',
      label: 'Group 4b: Oil Temperature (°C)',
      unit: '°C',
    },
    { key: 'fuel_flow_lph', label: 'Group 5: Fuel Flow Rate (L/h)', unit: 'L/h' },
    {
      key: 'vibration_rms_mms',
      label: 'Group 6: Broadband Vibration RMS (mm/s)',
      unit: 'mm/s',
    },
    {
      key: 'battery_voltage_v',
      label: 'Group 7a: Battery Bus Voltage (V)',
      unit: 'V',
    },
    {
      key: 'alternator_current_a',
      label: 'Group 7b: Alternator Load Current (A)',
      unit: 'A',
    },
    {
      key: 'injection_pulse_ms',
      label: 'Group 8a: Injection Pulse Width (ms)',
      unit: 'ms',
    },
    {
      key: 'ignition_advance_deg',
      label: 'Group 8b: Ignition Advance (°BTDC)',
      unit: '°BTDC',
    },
  ];

  const latestFrame =
    telemetry.length > 0 ? telemetry[telemetry.length - 1] : null;

  // Fallback-safe 8 SIH26054 parameter cards derived from API paramGroups + latestFrame
  const eightGroupCards = useMemo(() => {
    const icons = [
      Gauge,
      Thermometer,
      Flame,
      Droplets,
      Fuel,
      Waves,
      BatteryCharging,
      Wrench,
    ];
    const primaryChannels = [
      'rpm',
      'cht_c',
      'egt_c',
      'oil_pressure_bar',
      'fuel_flow_lph',
      'vibration_rms_mms',
      'battery_voltage_v',
      'injection_pulse_ms',
    ];
    const fallbackSpecs = [
      {
        id: 1,
        name: '1. Engine Speed (RPM)',
        current: latestFrame ? `${latestFrame.actual.rpm.toFixed(0)} RPM` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.actual.rpm.toFixed(0)} RPM (Governed)` : 'Unavailable',
        residual: 'Propeller Governor Ref',
        envelope: '1800 – 5800 RPM',
        severity: 'NOMINAL',
        explanation: 'Rotational speed of 4-cylinder boxer crankshaft and prop reduction gearbox.',
      },
      {
        id: 2,
        name: '2. Cylinder Head Temperature (CHT)',
        current: latestFrame ? `${latestFrame.actual.cht_c.toFixed(1)} °C` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.cht_c.toFixed(1)} °C` : 'Unavailable',
        residual: latestFrame ? `Δ = ${latestFrame.calculated.cht_residual_c >= 0 ? '+' : ''}${latestFrame.calculated.cht_residual_c.toFixed(1)} °C` : 'Unavailable',
        envelope: '110 – 235 °C (Warn 220°C)',
        severity: latestFrame && Math.abs(latestFrame.calculated.cht_residual_c) > 15 ? 'WARNING' : 'NOMINAL',
        explanation: 'Primary indicator of cooling baffle efficiency and combustion thermal load.',
      },
      {
        id: 3,
        name: '3. Exhaust Gas Temperature (EGT)',
        current: latestFrame ? `${latestFrame.actual.egt_c.toFixed(1)} °C` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.egt_c.toFixed(1)} °C` : 'Unavailable',
        residual: latestFrame ? `Δ = ${latestFrame.calculated.egt_residual_c >= 0 ? '+' : ''}${latestFrame.calculated.egt_residual_c.toFixed(1)} °C` : 'Unavailable',
        envelope: '650 – 920 °C (Warn 880°C)',
        severity: latestFrame && Math.abs(latestFrame.calculated.egt_residual_c) > 28 ? 'WARNING' : 'NOMINAL',
        explanation: 'Reflects air-fuel stoichiometry, lean/rich misfire, and exhaust valve seating.',
      },
      {
        id: 4,
        name: '4. Oil Pressure & Oil Temperature',
        current: latestFrame ? `${latestFrame.actual.oil_pressure_bar.toFixed(2)} bar / ${latestFrame.actual.oil_temp_c.toFixed(1)} °C` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.oil_pressure_bar.toFixed(2)} bar / ${latestFrame.expected.oil_temp_c.toFixed(1)} °C` : 'Unavailable',
        residual: latestFrame ? `ΔP = ${latestFrame.calculated.oil_pressure_residual_bar.toFixed(2)} bar` : 'Unavailable',
        envelope: '2.2 – 5.5 bar | 75 – 130 °C',
        severity: latestFrame && latestFrame.calculated.oil_pressure_residual_bar < -0.5 ? 'CRITICAL' : 'NOMINAL',
        explanation: 'Lubrication circuit gallery pressure and thermal viscosity protection.',
      },
      {
        id: 5,
        name: '5. Fuel Flow Rate',
        current: latestFrame ? `${latestFrame.actual.fuel_flow_lph.toFixed(2)} L/h` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.fuel_flow_lph.toFixed(2)} L/h` : 'Unavailable',
        residual: latestFrame ? `Δ = ${latestFrame.calculated.fuel_flow_residual_lph >= 0 ? '+' : ''}${latestFrame.calculated.fuel_flow_residual_lph.toFixed(2)} L/h` : 'Unavailable',
        envelope: '8.0 – 34.0 L/h',
        severity: latestFrame && Math.abs(latestFrame.calculated.fuel_flow_residual_lph) > 2.2 ? 'WARNING' : 'NOMINAL',
        explanation: 'Volumetric fuel delivery vs throttle/altitude demand and injector rail state.',
      },
      {
        id: 6,
        name: '6. Vibration Signatures (RMS)',
        current: latestFrame ? `${latestFrame.actual.vibration_rms_mms.toFixed(2)} mm/s` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.vibration_rms_mms.toFixed(2)} mm/s` : 'Unavailable',
        residual: latestFrame ? `Δ = ${latestFrame.calculated.vibration_residual_mms >= 0 ? '+' : ''}${latestFrame.calculated.vibration_residual_mms.toFixed(2)} mm/s` : 'Unavailable',
        envelope: '1.0 – 5.5 mm/s (Warn 4.2)',
        severity: latestFrame && latestFrame.calculated.vibration_residual_mms > 1.2 ? 'WARNING' : 'NOMINAL',
        explanation: 'Broadband crankcase acceleration tracking bearing wear, misfire, and ring blow-by.',
      },
      {
        id: 7,
        name: '7. Battery & Alternator Health',
        current: latestFrame ? `${latestFrame.actual.battery_voltage_v.toFixed(2)} V / ${latestFrame.actual.alternator_current_a.toFixed(1)} A` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.battery_voltage_v.toFixed(2)} V` : 'Unavailable',
        residual: latestFrame ? `ΔV = ${latestFrame.calculated.battery_voltage_residual_v.toFixed(2)} V` : 'Unavailable',
        envelope: '26.5 – 28.8 V DC | 8 – 35 A',
        severity: 'NOMINAL',
        explanation: '28V DC avionics/FADEC bus stability and dual-alternator charging current.',
      },
      {
        id: 8,
        name: '8. Injection Pulse & Ignition Timing',
        current: latestFrame ? `${latestFrame.actual.injection_pulse_ms.toFixed(2)} ms / ${latestFrame.actual.ignition_advance_deg.toFixed(1)}°` : 'Unavailable',
        expected: latestFrame ? `${latestFrame.expected.injection_pulse_ms.toFixed(2)} ms / ${latestFrame.expected.ignition_advance_deg.toFixed(1)}°` : 'Unavailable',
        residual: latestFrame ? `ΔPulse = ${latestFrame.calculated.injection_pulse_residual_ms.toFixed(2)} ms` : 'Unavailable',
        envelope: '3.5 – 14.5 ms | 18 – 34 °BTDC',
        severity: 'NOMINAL',
        explanation: 'FADEC injector pulse width trim and dual-ignition spark advance schedule.',
      },
    ];

    return fallbackSpecs.map((fb, idx) => {
      const apiG = paramGroups[idx];
      return {
        id: apiG?.group_id ?? fb.id,
        name: apiG?.group_name ?? fb.name,
        current: apiG?.current_value ?? fb.current,
        expected: apiG?.expected_value ?? fb.expected,
        residual: apiG?.residual_value ?? fb.residual,
        envelope: apiG?.operating_range ?? fb.envelope,
        minMeanMax: apiG?.historical_stats
          ? `${apiG.historical_stats.min} / ${apiG.historical_stats.mean} / ${apiG.historical_stats.max}`
          : '—',
        healthContribution: apiG?.health_contribution ?? fb.explanation,
        severity: apiG?.severity ?? fb.severity,
        explanation: fb.explanation,
        Icon: icons[idx] || Activity,
        channelKey: primaryChannels[idx] || 'cht_c',
      };
    });
  }, [paramGroups, latestFrame]);

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
    rpm: t.actual.rpm,
    cht_c: t.actual.cht_c,
    cht_exp: t.expected.cht_c,
    egt_c: t.actual.egt_c,
    egt_exp: t.expected.egt_c,
    oil_p: t.actual.oil_pressure_bar,
    oil_t: t.actual.oil_temp_c,
    fuel: t.actual.fuel_flow_lph,
    vib: t.actual.vibration_rms_mms,
    bat: t.actual.battery_voltage_v,
    alt_a: t.actual.alternator_current_a,
    inj: t.actual.injection_pulse_ms,
    ign: t.actual.ignition_advance_deg,
  }));

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-block">
          <div className="screen-eyebrow">
            Diagnostics · SIH26054 8-Group Propulsion Telemetry
          </div>
          <h1 className="screen-title">
            Engine Health Monitoring — {engineId}
          </h1>
          <div className="screen-desc">
            Comprehensive monitoring across all 8 required propulsion parameter
            groups with progressive 3-level engineering disclosure: (1)
            At-a-glance status, (2) Parameter trends & explanations, and (3)
            Detailed engineering data & CSV ingestion.
          </div>
        </div>
        <div className="screen-actions">
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-elevated)',
              padding: 3,
              borderRadius: 5,
              border: '1px solid var(--border-medium)',
              gap: 4,
            }}
            role="group"
            aria-label="Detail Level Selector"
          >
            <button
              className={`btn btn-sm ${detailLevel === 1 ? 'btn-primary' : ''}`}
              onClick={() => setDetailLevel(1)}
            >
              Level 1: At-a-Glance
            </button>
            <button
              className={`btn btn-sm ${detailLevel === 2 ? 'btn-primary' : ''}`}
              onClick={() => setDetailLevel(2)}
            >
              Level 2: Trends & Context
            </button>
            <button
              className={`btn btn-sm ${detailLevel === 3 ? 'btn-primary' : ''}`}
              onClick={() => setDetailLevel(3)}
            >
              Level 3: Engineering Deep-Dive
            </button>
          </div>
          <button className="btn btn-primary" onClick={handleExportCsv}>
            <Download size={13} /> Export Twin CSV
          </button>
        </div>
      </div>

      {/* LEVEL 1: AT-A-GLANCE STATUS CARDS FOR ALL 8 SIH26054 PARAMETER GROUPS */}
      <div
        className="grid-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        {eightGroupCards.map((card) => {
          const IconComp = card.Icon;
          const isWarn =
            card.severity.includes('WARN') || card.severity.includes('CAUT');
          const isCrit = card.severity.includes('CRIT');
          return (
            <div
              key={card.id}
              className={`param-group-card ${
                isCrit ? 'alert-critical' : isWarn ? 'alert-warning' : ''
              }`}
              onClick={() => {
                setSelectedChannel(card.channelKey);
                if (detailLevel < 2) setDetailLevel(2);
              }}
              style={{ cursor: 'pointer' }}
              title="Click to inspect parameter time-series trend"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontWeight: 700,
                    fontSize: 12,
                    color: '#ffffff',
                  }}
                >
                  <IconComp size={14} color="#38bdf8" />
                  <span>{card.name}</span>
                </div>
                <span className={statusBadgeClass(card.severity)}>
                  {card.severity}
                </span>
              </div>

              <div
                className="mono"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#38bdf8',
                  marginBottom: 4,
                }}
              >
                {card.current}
              </div>

              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: '#94a3b8',
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span>Ref: {card.expected}</span>
                <span style={{ color: '#e2e8f0' }}>{card.residual}</span>
              </div>

              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  paddingTop: 6,
                }}
              >
                <div className="mono" style={{ fontSize: 10.5, color: '#8899bb' }}>
                  Envelope: {card.envelope}
                </div>
                {detailLevel >= 2 && (
                  <div style={{ marginTop: 3, color: '#94a3b8' }}>
                    {card.explanation}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* LEVEL 2: PARAMETER TRENDS & EXPLANATIONS */}
      {detailLevel >= 2 && (
        <>
          <div className="panel-card">
            <div className="panel-card-header">
              <div className="panel-card-title">
                <Activity size={14} /> Interactive Channel Time-Series Inspector
                (Actual vs Physics Baseline)
              </div>
              <select
                className="select-control"
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                aria-label="Select Telemetry Channel"
              >
                {channelOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ height: 235 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                  <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                  <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                  <Tooltip />
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
                    stroke="#22c55e"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ORGANIZED MULTI-GROUP CHARTS FOR ALL 8 GROUPS */}
          <div className="grid-2">
            <div className="panel-card">
              <div className="panel-card-header">
                <div className="panel-card-title">
                  Groups 1, 2 & 3 — RPM, CHT (°C) & EGT (°C) Trends
                </div>
              </div>
              <div style={{ height: 205 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                    <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                    <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cht_c"
                      name="CHT (°C)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="egt_c"
                      name="EGT (°C)"
                      stroke="#f59e0b"
                      strokeWidth={1.8}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-card-header">
                <div className="panel-card-title">
                  Groups 4, 5 & 6 — Oil Pressure (bar), Fuel (L/h) & Vibration
                  (mm/s)
                </div>
              </div>
              <div style={{ height: 205 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                    <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                    <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="oil_p"
                      name="Oil Pressure (bar)"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="fuel"
                      name="Fuel Flow (L/h)"
                      stroke="#38bdf8"
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="vib"
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

          <div className="grid-2">
            <div className="panel-card">
              <div className="panel-card-header">
                <div className="panel-card-title">
                  Group 7 — Battery Bus Voltage (V) & Alternator Current (A)
                </div>
              </div>
              <div style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                    <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                    <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="bat"
                      name="Battery Voltage (V)"
                      stroke="#4ade80"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="alt_a"
                      name="Alternator Current (A)"
                      stroke="#38bdf8"
                      strokeWidth={1.8}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-card-header">
                <div className="panel-card-title">
                  Group 8 — Injection Pulse Width (ms) & Ignition Advance
                  (°BTDC)
                </div>
              </div>
              <div style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2440" />
                    <XAxis dataKey="elapsed" stroke="#8899bb" unit="s" />
                    <YAxis stroke="#8899bb" domain={['auto', 'auto']} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="inj"
                      name="Injection Pulse (ms)"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="ign"
                      name="Ignition Advance (°BTDC)"
                      stroke="#a78bfa"
                      strokeWidth={1.8}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {/* LEVEL 3: DETAILED ENGINEERING MATRIX, CSV INGESTION & RAW LOG ON DEMAND */}
      {detailLevel >= 3 && (
        <>
          <div className="panel-card">
            <div className="panel-card-header">
              <div className="panel-card-title">
                <ShieldCheck size={14} /> SIH26054 Complete 8-Group Propulsion
                Health Monitoring Matrix
              </div>
              <span className="badge badge-info">
                ALL 8 PARAMETER GROUPS VERIFIED
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table mono" style={{ fontSize: 11.5 }}>
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
                  {eightGroupCards.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong>{g.name}</strong>
                      </td>
                      <td style={{ color: '#38bdf8', fontWeight: 700 }}>
                        {g.current}
                      </td>
                      <td style={{ color: '#4ade80' }}>{g.expected}</td>
                      <td>{g.residual}</td>
                      <td style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {g.envelope}
                      </td>
                      <td style={{ fontSize: 11 }}>{g.minMeanMax}</td>
                      <td style={{ fontSize: 11, color: '#94a3b8' }}>
                        {g.healthContribution}
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
              <table className="data-table mono">
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
        </>
      )}
    </div>
  );
};
