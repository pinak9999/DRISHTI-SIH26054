import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { drishtiApi } from '../../api/client';
import {
  ENGINE_SUBSYSTEMS,
  EngineSubsystemId,
} from '../../components/Engine3DViewport';
import {
  EmptyState,
  GlassPanel,
  KpiTile,
  RingGauge,
  SeverityBadge,
  Skeleton,
  Sparkline,
  StatusChip,
  SyntheticBadge,
} from '../../components/ui';
import {
  EngineRecord,
  ExplainableAlert,
  FleetOverview,
  FourValueDigitalTwinState,
} from '../../types/telemetry';

// Lazy-load the Three.js 3D viewport for performance and code-splitting
const LazyEngine3DViewport = React.lazy(() =>
  import('../../components/Engine3DViewport').then((m) => ({
    default: m.Engine3DViewport,
  }))
);

export interface FleetCommandCenterScreenProps {
  fleet: FleetOverview | null;
  selectedEngineId: string;
  selectedEngineRecord?: EngineRecord | null;
  latestState?: FourValueDigitalTwinState | null;
  telemetry?: FourValueDigitalTwinState[];
  engineAlerts?: ExplainableAlert[];
  onSelectEngine: (engineId: string, navigateToTwin?: boolean) => void;
  onRefreshFleet: () => Promise<void>;
  onNavigate: (screen: string) => void;
  backendError?: string | null;
}

const quickSubsystems: { id: EngineSubsystemId | 'entire'; label: string }[] = [
  { id: 'entire', label: 'Entire Engine' },
  { id: 'crankshaft_train', label: 'Propeller & Hub' },
  { id: 'crankcase_assembly', label: 'Crankshaft' },
  { id: 'cylinder_bank_port', label: 'Cylinders' },
  { id: 'fuel_injection_rail', label: 'Fuel System' },
  { id: 'lubrication_system', label: 'Lubrication' },
  { id: 'cooling_plenum', label: 'Cooling System' },
  { id: 'sensor_fadec_harness', label: 'Electrical System' },
];

export const FleetCommandCenterScreen: React.FC<FleetCommandCenterScreenProps> = ({
  fleet,
  selectedEngineId,
  selectedEngineRecord,
  latestState = null,
  telemetry = [],
  engineAlerts = [],
  onSelectEngine,
  onRefreshFleet,
  onNavigate,
  backendError = null,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [selectedSubsystemId, setSelectedSubsystemId] =
    useState<EngineSubsystemId>('cylinder_heads_valves');
  const [cameraKey, setCameraKey] = useState<number>(0);
  const [engineSparklines, setEngineSparklines] = useState<Record<string, number[]>>({});
  const [sparklinesLoading, setSparklinesLoading] = useState<boolean>(true);

  // Fetch recent telemetry for fleet sparklines to ensure authentic data
  useEffect(() => {
    if (!fleet?.engines || fleet.engines.length === 0) {
      setSparklinesLoading(false);
      return;
    }

    let isMounted = true;
    setSparklinesLoading(true);

    const fetchRecentTelemetry = async () => {
      const sparkMap: Record<string, number[]> = {};
      try {
        await Promise.all(
          fleet.engines.map(async (eng) => {
            try {
              const res = await drishtiApi.getEngineTelemetry(eng.engine_id, undefined, 15);
              if (res?.items && isMounted) {
                sparkMap[eng.engine_id] = res.items.map((t) => t.actual.cht_c);
              }
            } catch {
              if (isMounted) {
                sparkMap[eng.engine_id] = [];
              }
            }
          })
        );
        if (isMounted) {
          setEngineSparklines(sparkMap);
        }
      } finally {
        if (isMounted) {
          setSparklinesLoading(false);
        }
      }
    };

    fetchRecentTelemetry();
    return () => {
      isMounted = false;
    };
  }, [fleet?.engines]);

  const handleReseedFleet = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      await drishtiApi.seedFleet();
      await onRefreshFleet();
      setSeedMessage('Fleet re-seeded & verified.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSeedMessage(`Error seeding fleet: ${msg}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleToggleAcknowledge = async (alertId: string, currentAck: boolean) => {
    try {
      await drishtiApi.acknowledgeAlert(alertId, !currentAck);
      await onRefreshFleet();
    } catch {
      // Alert acknowledge handled gracefully
    }
  };

  // Resolve active engine record
  const activeEngine =
    selectedEngineRecord ||
    (fleet?.engines || []).find((e) => e.engine_id === selectedEngineId) ||
    null;

  // Resolve alert sources
  const sourceAlerts =
    fleet?.recent_alerts && fleet.recent_alerts.length > 0
      ? fleet.recent_alerts
      : engineAlerts;

  const unackCount = sourceAlerts.filter((a) => !a.acknowledged).length;

  const qualityScore =
    latestState?.actual?.quality?.quality_score !== undefined
      ? Number((latestState.actual.quality.quality_score * 100).toFixed(1))
      : 100.0;

  const isCanValid = latestState?.actual?.quality?.is_valid ?? true;

  // --- STATE 1: BACKEND OFFLINE ---
  if (!fleet && backendError) {
    return (
      <div className="fleet-offline-wrap">
        <EmptyState
          icon={<WifiOff size={44} color="var(--color-critical)" />}
          title="FastAPI Backend Offline"
          description={`Unable to connect to FastAPI backend at ${drishtiApi.getBaseUrl()}. If deployed on Render, the backend service may be cold-starting (which can take 45–60 seconds). Click retry to reconnect.`}
          action={
            <button className="btn btn-primary" onClick={onRefreshFleet}>
              <RefreshCw size={13} /> Retry Connection
            </button>
          }
        />
      </div>
    );
  }

  // --- STATE 2: LOADING SKELETON ---
  if (!fleet) {
    return (
      <div className="fleet-command-center" aria-busy="true" aria-label="Loading Fleet Command Center">
        <div className="fleet-kpi-grid">
          <Skeleton variant="rect" height={96} count={4} />
        </div>
        <div className="fleet-engine-grid" style={{ marginTop: 12 }}>
          <Skeleton variant="rect" height={130} count={6} />
        </div>
        <div className="fleet-lower-grid" style={{ marginTop: 12 }}>
          <Skeleton variant="rect" height={420} count={2} />
        </div>
      </div>
    );
  }

  // --- STATE 3: FULL PRODUCTION RENDER ---
  return (
    <div className="fleet-command-center">
      {/* ROW 1: 4 KPI TILES */}
      <div className="fleet-kpi-grid">
        <KpiTile
          label="Monitored Engines"
          value={fleet.fleet_size}
          precision={0}
          subtext={`${fleet.nominal_count} Nominal · ${fleet.caution_count} Caution · ${
            fleet.warning_count + fleet.critical_count
          } Critical`}
          status="nominal"
          icon={<Cpu size={18} />}
          onClick={() => onNavigate('twin')}
        />

        <KpiTile
          label="Mean Fleet Health Index"
          value={Number(fleet.mean_fleet_health_index.toFixed(1))}
          unit="/ 100"
          precision={1}
          subtext={
            fleet.mean_fleet_health_index >= 75
              ? 'Optimal fleet operational baseline'
              : fleet.mean_fleet_health_index >= 55
              ? 'Caution: Subsystem degradation'
              : 'Critical: Multi-engine alert status'
          }
          status={
            fleet.mean_fleet_health_index >= 75
              ? 'nominal'
              : fleet.mean_fleet_health_index >= 55
              ? 'caution'
              : 'critical'
          }
          icon={<Activity size={18} />}
        />

        <KpiTile
          label="Active Alerts"
          value={fleet.total_active_alerts}
          precision={0}
          subtext={`${unackCount} unacknowledged (recent ${sourceAlerts.length})`}
          status={fleet.total_active_alerts > 0 ? 'critical' : 'nominal'}
          icon={<AlertTriangle size={18} />}
          onClick={() => onNavigate('faults')}
        />

        <KpiTile
          label="Active engine quality"
          value={qualityScore}
          unit="%"
          precision={1}
          subtext={`${selectedEngineId} · ${isCanValid ? 'Clean CAN · Isochronous 10 Hz' : 'Degraded Frames Detected'}`}
          status={isCanValid ? 'nominal' : 'caution'}
          icon={<Wifi size={18} />}
        />
      </div>

      {/* SECTION HEADER & FLEET ACTION CONTROLS */}
      <div className="fleet-section-header">
        <div className="fleet-section-title">
          <span>Active Fleet Engines</span>
          <span className="fleet-count-badge">{fleet.fleet_size} Engines</span>
          {seedMessage && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--cyan)', marginLeft: 8 }}>
              {seedMessage}
            </span>
          )}
        </div>
        <div className="fleet-action-buttons">
          <button
            className="btn btn-sm"
            onClick={() => onNavigate('simulator')}
            title="Launch 6-Step Guided Fault Simulator"
          >
            <Sliders size={12} /> Fault Simulator
          </button>
          <button
            className="btn btn-sm"
            onClick={() => onRefreshFleet()}
            title="Poll fresh telemetry frames"
          >
            <RefreshCw size={12} /> Refresh Telemetry
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={handleReseedFleet}
            disabled={seeding}
            title="Reset simulated 6-engine fleet state"
          >
            <Play size={12} /> {seeding ? 'Seeding...' : 'Reset / Seed Fleet'}
          </button>
        </div>
      </div>

      {/* ROW 2: FLEET GRID OF ENGINES */}
      <div className="fleet-engine-grid">
        {fleet.engines.map((engine) => {
          const isSelected = engine.engine_id === selectedEngineId;
          const statusVariant: 'nominal' | 'caution' | 'warning' | 'critical' = engine.status
            .toLowerCase()
            .includes('crit')
            ? 'critical'
            : engine.status.toLowerCase().includes('warn')
            ? 'warning'
            : engine.status.toLowerCase().includes('caut')
            ? 'caution'
            : 'nominal';

          const sparkData =
            isSelected && telemetry.length > 0
              ? telemetry.slice(-15).map((t) => t.actual.cht_c)
              : engineSparklines[engine.engine_id] || [];

          const sparkColor =
            statusVariant === 'critical'
              ? 'var(--color-critical)'
              : statusVariant === 'warning'
              ? 'var(--color-warning)'
              : statusVariant === 'caution'
              ? 'var(--color-caution)'
              : 'var(--cyan)';

          return (
            <GlassPanel
              key={engine.engine_id}
              className={`fleet-engine-card ${isSelected ? 'selected' : ''}`}
              glow={isSelected ? 'cyan' : 'none'}
              hoverable
              onClick={() => onSelectEngine(engine.engine_id, false)}
            >
              <div className="fleet-card-header">
                <div>
                  <div className="fleet-tail-id mono">{engine.tail_number}</div>
                  <div className="fleet-platform-name">
                    {engine.uav_platform} · {engine.engine_id}
                  </div>
                </div>
                <div className="fleet-card-badges">
                  <StatusChip
                    status={statusVariant}
                    label={
                      engine.latest_fault_class === 'Normal'
                        ? 'NOMINAL'
                        : engine.latest_fault_class
                    }
                  />
                  {engine.is_synthetic && (
                    <SyntheticBadge isSynthetic={true} label="SIMULATED" />
                  )}
                </div>
              </div>

              <div className="fleet-card-body">
                <RingGauge
                  value={engine.latest_health_index}
                  status={statusVariant}
                  size={64}
                  strokeWidth={6}
                  label="HI"
                />

                <div className="fleet-card-stats">
                  <div className="fleet-card-stat-item">
                    <span className="fleet-stat-label">RUL:</span>
                    <span className="fleet-stat-value mono">
                      {engine.latest_rul_status === 'NOT_ESTIMABLE'
                        ? 'NOT ESTIMABLE'
                        : engine.latest_rul_hours !== null
                        ? `${engine.latest_rul_hours.toFixed(1)} h`
                        : '—'}
                    </span>
                  </div>
                  <div className="fleet-card-stat-item">
                    <span className="fleet-stat-label">Hours:</span>
                    <span className="fleet-stat-value mono">
                      {engine.total_operating_hours.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="fleet-card-stat-item">
                    <span className="fleet-stat-label">Mission:</span>
                    <span className="fleet-stat-value mono" style={{ fontSize: 10 }}>
                      {engine.active_mission_id || 'IDLE'}
                    </span>
                  </div>
                </div>

                <div className="fleet-sparkline-wrap">
                  <span className="fleet-sparkline-label">CHT (°C)</span>
                  {sparklinesLoading && sparkData.length === 0 ? (
                    <Skeleton variant="rect" width={76} height={28} />
                  ) : sparkData.length > 0 ? (
                    <Sparkline
                      data={sparkData}
                      width={76}
                      height={28}
                      color={sparkColor}
                      strokeWidth={1.6}
                    />
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>no history</span>
                  )}
                </div>
              </div>
            </GlassPanel>
          );
        })}
      </div>

      {/* ROW 3: 3D DIGITAL TWIN VIEWPORT & RECENT ALERTS FEED */}
      <div className="fleet-lower-grid">
        {/* LEFT COLUMN: 3D DIGITAL TWIN */}
        <GlassPanel className="fleet-twin-panel">
          <div className="fleet-twin-header">
            <div className="fleet-twin-title">
              <Cpu size={16} color="var(--cyan)" />
              <span>3D Propulsion Twin — {selectedEngineId}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {latestState?.is_synthetic && (
                <SyntheticBadge
                  isSynthetic={true}
                  label={latestState.data_source || 'SIMULATED'}
                />
              )}
              <button
                className="btn btn-sm"
                onClick={() => setCameraKey((k) => k + 1)}
                title="Reset View Orientation"
              >
                <RotateCcw size={12} /> Reset View
              </button>
            </div>
          </div>

          <div className="fleet-subsystem-bar">
            {quickSubsystems.map((sub) => {
              const isSelected =
                sub.id === 'entire'
                  ? selectedSubsystemId === 'cylinder_heads_valves'
                  : selectedSubsystemId === sub.id;
              return (
                <button
                  key={sub.id}
                  className={`fleet-subsystem-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    if (sub.id !== 'entire') {
                      setSelectedSubsystemId(sub.id);
                    } else {
                      setSelectedSubsystemId('cylinder_heads_valves');
                    }
                  }}
                >
                  {sub.label}
                </button>
              );
            })}
          </div>

          <div className="fleet-viewport-container">
            <Suspense fallback={<Skeleton variant="rect" width="100%" height={340} />}>
              <LazyEngine3DViewport
                key={cameraKey}
                compact
                twinState={latestState}
                engineHours={activeEngine?.total_operating_hours ?? 412.5}
                selectedSubsystemId={selectedSubsystemId}
                onSubsystemChange={setSelectedSubsystemId}
              />
            </Suspense>
          </div>

          <div className="fleet-truth-disclosure">
            <strong>Physical Architecture:</strong> Rotax 914 F lumped 4-cylinder opposed aero piston demonstrator. Procedural geometry driven by physics residuals.
          </div>
        </GlassPanel>

        {/* RIGHT COLUMN: RECENT ALERTS FEED */}
        <GlassPanel className="fleet-alerts-panel">
          <div className="fleet-alerts-header">
            <div className="fleet-alerts-title">
              <AlertTriangle size={16} color="var(--color-warning)" />
              <span>Propulsion Health Alerts</span>
              <span className="fleet-count-badge">{sourceAlerts.length}</span>
            </div>
            <button
              className="btn btn-sm"
              onClick={() => onNavigate('faults')}
              title="Open Fault Investigation screen"
            >
              Investigate <ArrowRight size={12} />
            </button>
          </div>

          {sourceAlerts.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck size={36} color="var(--color-nominal)" />}
              title="No Active Alerts"
              description="Propulsion subsystems operating in envelope across monitored fleet."
            />
          ) : (
            <div className="fleet-alerts-list">
              {sourceAlerts.slice(0, 8).map((alt) => (
                <div
                  key={alt.alert_id}
                  className={`fleet-alert-card ${alt.severity.toLowerCase()}`}
                  onClick={() => onSelectEngine(alt.engine_id, false)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="fleet-alert-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <SeverityBadge severity={alt.severity} />
                      <span className="fleet-alert-fault-name">{alt.fault_class}</span>
                    </div>
                    <span className="fleet-alert-tail-tag mono">{alt.engine_id}</span>
                  </div>

                  <div className="fleet-alert-evidence">
                    {alt.supporting_evidence?.[0] || alt.recommended_action}
                  </div>

                  <div className="fleet-alert-footer">
                    <span>{new Date(alt.timestamp).toLocaleTimeString()}</span>
                    <button
                      className={`fleet-alert-ack-btn ${alt.acknowledged ? 'acknowledged' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleAcknowledge(alt.alert_id, alt.acknowledged);
                      }}
                    >
                      {alt.acknowledged ? 'Acknowledged' : 'Acknowledge'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
};
