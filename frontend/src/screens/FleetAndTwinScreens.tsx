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
   SCREEN 1: FLEET COMMAND CENTER (REDESIGNED MODULAR)
   ========================================================================= */
export { FleetCommandCenterScreen } from './fleet/FleetCommandCenterScreen';
export type { FleetCommandCenterScreenProps } from './fleet/FleetCommandCenterScreen';

/* =========================================================================
   SCREEN 2: 3D ENGINE DIGITAL TWIN WORKSTATION (REDESIGNED MODULAR)
   ========================================================================= */
export { EngineDigitalTwinScreen } from './twin/EngineDigitalTwinScreen';
export type { EngineDigitalTwinScreenProps } from './twin/EngineDigitalTwinScreen';


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
