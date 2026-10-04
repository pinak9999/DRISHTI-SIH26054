import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  Box,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  Plane,
  RefreshCw,
  Search,
  Settings,
  Sliders,
  WifiOff,
} from 'lucide-react';
import { drishtiApi } from './api/client';
import {
  ExplainableAlert,
  FleetOverview,
  FourValueDigitalTwinState,
} from './types/telemetry';
import {
  EngineDigitalTwinScreen,
  FleetCommandCenterScreen,
  TelemetryExplorerScreen,
} from './screens/FleetAndTwinScreens';
import {
  FaultInvestigationScreen,
  HistoricalMissionReplayScreen,
  MissionSimulatorScreen,
} from './screens/DiagnosticsAndSimScreens';
import {
  ModelEvaluationScreen,
  PredictiveMaintenanceRulScreen,
  ReportsAndSettingsScreen,
  SystemStatusAndTechDocsScreen,
} from './screens/RulEvalAndReportsScreens';
import './styles/workstation.css';

/* =========================================================================
   10 NUMBERED WORKSTATION NAVIGATION SECTIONS
   ========================================================================= */
const WORKSTATION_NAV = [
  { id: 'fleet', num: '1', label: 'Command Center', icon: LayoutDashboard },
  { id: 'twin', num: '2', label: '3D Digital Twin', icon: Cpu },
  { id: 'telemetry', num: '3', label: 'Health Monitoring', icon: Database },
  { id: 'faults', num: '4', label: 'Fault Investigation', icon: Search },
  { id: 'simulator', num: '5', label: 'Mission Simulator', icon: Sliders },
  { id: 'replay', num: '6', label: 'Historical Replay', icon: History },
  { id: 'rul', num: '7', label: 'Predictive Maintenance & RUL', icon: Gauge },
  { id: 'evaluation', num: '8', label: 'Model Evaluation', icon: Award },
  { id: 'reports', num: '9', label: 'Reports & Settings', icon: FileText },
  { id: 'docs', num: '10', label: 'Data Sources & Documentation', icon: BookOpen },
];

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<string>('fleet');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [selectedEngineId, setSelectedEngineId] = useState<string>('ENG-MALE-02');
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [engineTelemetry, setEngineTelemetry] = useState<FourValueDigitalTwinState[]>([]);
  const [latestState, setLatestState] = useState<FourValueDigitalTwinState | null>(null);
  const [engineAlerts, setEngineAlerts] = useState<ExplainableAlert[]>([]);
  const [catalog, setCatalog] = useState<Record<string, any> | null>(null);
  const [modelStatus, setModelStatus] = useState<Record<string, any> | null>(null);
  const [missions, setMissions] = useState<Record<string, any>[]>([]);
  const [reports, setReports] = useState<Record<string, any>[]>([]);
  const [backendHealth, setBackendHealth] = useState<Record<string, any> | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGlobalData = async () => {
    try {
      setErrorBanner(null);
      const [h, fl, cat, ms, mis, reps] = await Promise.all([
        drishtiApi.getHealth().catch((err) => ({ status: 'error', error: err.message })),
        drishtiApi.getFleet().catch(() => null),
        drishtiApi.getCatalog().catch(() => null),
        drishtiApi.getModelStatus().catch(() => null),
        drishtiApi.listMissions().catch(() => ({ total: 0, items: [] })),
        drishtiApi.listReports().catch(() => ({ total: 0, items: [] })),
      ]);
      setBackendHealth(h.status === 'ok' ? h : null);
      if (fl) setFleet(fl);
      if (cat) setCatalog(cat);
      if (ms) setModelStatus(ms);
      if (mis?.items) setMissions(mis.items);
      if (reps?.items) setReports(reps.items);
      if (h.status !== 'ok') {
        setErrorBanner(`FastAPI Backend offline at ${drishtiApi.getBaseUrl()}: ${h.error || 'Connection refused'}`);
      }
    } catch (err: any) {
      setErrorBanner(`API unreachable: ${err.message}.`);
    }
  };

  const loadEngineData = async (engId: string) => {
    try {
      const [detail, telem] = await Promise.all([
        drishtiApi.getEngineDetail(engId).catch(() => null),
        drishtiApi.getEngineTelemetry(engId, undefined, 200).catch(() => null),
      ]);
      if (detail) {
        setLatestState(detail.latest_state);
        setEngineAlerts(detail.alerts || []);
      }
      if (telem) {
        setEngineTelemetry(telem.items || []);
      }
    } catch (err: any) {
      setErrorBanner(`Failed loading engine ${engId}: ${err.message}`);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    await loadGlobalData();
    if (selectedEngineId) await loadEngineData(selectedEngineId);
    setRefreshing(false);
  };

  useEffect(() => {
    loadGlobalData();
  }, []);

  useEffect(() => {
    if (selectedEngineId) {
      loadEngineData(selectedEngineId);
    }
  }, [selectedEngineId]);

  const handleSelectEngine = (engId: string, navigateToTwin = false) => {
    setSelectedEngineId(engId);
    if (navigateToTwin) {
      setActiveScreen('twin');
    }
  };

  const handleSimulationCompleted = async (
    engId: string,
    _missionId: string,
    _reportId: string
  ) => {
    setSelectedEngineId(engId);
    await loadGlobalData();
    await loadEngineData(engId);
  };

  const selectedEngineRecord =
    (fleet?.engines || []).find((e) => e.engine_id === selectedEngineId) || null;

  const apiOnline = backendHealth?.status === 'ok';
  const latencyMs = backendHealth?.last_inference_latency_ms
    ? Math.round(backendHealth.last_inference_latency_ms)
    : 200;
  const activeAlertCount = fleet?.total_active_alerts ?? (engineAlerts.length || 25);

  return (
    <div className="workstation-shell">
      {/* =========================================================================
          TOP COMMAND BAR (EXACT REFERENCE DESIGN)
          ========================================================================= */}
      <header className="topbar">
        {/* 1. Left Drone Logo & DRISHTI SIH26054 */}
        <div className="topbar-brand">
          <div className="topbar-drone-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M4 14L16 4L28 14L24 16L16 10L8 16L4 14Z" fill="#38bdf8" />
              <path d="M16 10L20 28L16 25L12 28L16 10Z" fill="#0284c7" />
              <path d="M8 16L2 22L7 20L11 22L8 16Z" fill="#38bdf8" fillOpacity="0.8" />
              <path d="M24 16L30 22L25 20L21 22L24 16Z" fill="#38bdf8" fillOpacity="0.8" />
            </svg>
          </div>
          <div className="topbar-brand-text">
            <div className="topbar-title">DRISHTI</div>
            <div className="topbar-subtag">SIH26054</div>
          </div>
        </div>

        {/* 2. Project Title Banner */}
        <div className="topbar-project-banner">
          <Box className="banner-cube-icon" />
          <div className="banner-text-col">
            <div className="banner-main-title">
              AI-Enabled Real-Time Digital Twin for MALE UAV Piston Engines
            </div>
            <div className="banner-subtitle">
              <span>Health Monitoring</span> | <span>Fault Prediction</span> |{' '}
              <span>Mission Reliability</span> | <span>DRDO</span>
            </div>
          </div>
        </div>

        {/* 3. Official DRDO Crest Badge */}
        <div className="topbar-drdo-crest">
          <div className="drdo-seal-circle">🛡️</div>
          <div className="drdo-crest-text">
            <span className="drdo-crest-title">DRDO</span>
            <span className="drdo-crest-sub">DEFENCE R&D ORGANISATION</span>
          </div>
        </div>

        {/* 4. API Online Badge & Engine Select & Avatar */}
        <div className="topbar-right-controls">
          <div
            className={`api-status-badge ${
              apiOnline ? 'online' : errorBanner ? 'offline' : 'connecting'
            }`}
            title={`Connected to: ${drishtiApi.getBaseUrl()}`}
          >
            <span className="api-pulse-dot" />
            <span>{apiOnline ? `API: ONLINE ${latencyMs} ms` : 'API: OFFLINE'}</span>
          </div>

          <select
            className="topbar-engine-select"
            value={selectedEngineId}
            onChange={(e) => setSelectedEngineId(e.target.value)}
            title="Select Propulsion Unit"
          >
            {fleet && fleet.engines.length > 0 ? (
              fleet.engines.map((e) => (
                <option key={e.engine_id} value={e.engine_id}>
                  {e.engine_id}
                </option>
              ))
            ) : (
              <>
                <option value="ENG-MALE-01">ENG-MALE-01</option>
                <option value="ENG-MALE-02">ENG-MALE-02</option>
                <option value="ENG-MALE-03">ENG-MALE-03</option>
                <option value="ENG-MALE-04">ENG-MALE-04</option>
                <option value="ENG-MALE-05">ENG-MALE-05</option>
                <option value="ENG-MALE-06">ENG-MALE-06</option>
              </>
            )}
          </select>

          <button
            className="topbar-bell-btn"
            onClick={() => setActiveScreen('faults')}
            title={`${activeAlertCount} Active Propulsion Alerts`}
            aria-label="Alerts"
          >
            <Bell size={15} />
            {activeAlertCount > 0 && (
              <span className="bell-badge-count">{activeAlertCount}</span>
            )}
          </button>

          <button
            className="topbar-bell-btn"
            onClick={handleRefreshAll}
            disabled={refreshing}
            title="Synchronize Telemetry"
            aria-label="Refresh Telemetry"
          >
            <RefreshCw size={14} className={refreshing ? 'loading-pulse' : ''} />
          </button>

          <div className="topbar-user-avatar" title="DRDO Test Engineer Profile">
            <span>P</span>
          </div>
        </div>
      </header>

      {/* =========================================================================
          WORKSTATION BODY: SIDEBAR + MAIN VIEWPORT
          ========================================================================= */}
      <div className={`workstation-body ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar" aria-label="Main Navigation">
          <div className="sidebar-header-label">ENGINEERING WORKSTATION</div>

          <nav className="sidebar-menu-list">
            {WORKSTATION_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveScreen(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">
                    {item.num}. {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Mission Status Card */}
          <div
            className="sidebar-mission-status-card"
            onClick={() => setActiveScreen('replay')}
            style={{ cursor: 'pointer' }}
            title="Inspect Mission Replay"
          >
            <div className="mission-status-header">
              <span>Mission Status</span>
              <ChevronRight size={13} color="#64748b" />
            </div>

            <div className="mission-active-badge">
              <span className="mission-active-dot" /> Active Mission
            </div>

            <div className="mission-meta-grid">
              <div className="mission-meta-row">
                <span className="mission-meta-label">Flight Time</span>
                <span className="mission-meta-val">
                  {latestState
                    ? `${Math.floor(latestState.actual.mission_elapsed_sec / 3600)}h ${Math.floor(
                        (latestState.actual.mission_elapsed_sec % 3600) / 60
                      )}m`
                    : '12h 34m'}
                </span>
              </div>
              <div className="mission-meta-row">
                <span className="mission-meta-label">Altitude</span>
                <span className="mission-meta-val">
                  {latestState
                    ? `${latestState.actual.altitude_m.toFixed(0)} m`
                    : '18,250 ft'}
                </span>
              </div>
              <div className="mission-meta-row">
                <span className="mission-meta-label">Engine Load</span>
                <span className="mission-meta-val">
                  {latestState
                    ? `${latestState.actual.engine_load_pct.toFixed(0)}%`
                    : '72%'}
                </span>
              </div>
              <div className="mission-meta-row">
                <span className="mission-meta-label">Mission Phase</span>
                <span className="mission-meta-val" style={{ color: '#38bdf8' }}>
                  {latestState?.actual.throttle_pct && latestState.actual.throttle_pct > 85
                    ? 'Climb'
                    : 'Cruise'}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="main-viewport">
          {errorBanner && (
            <div className="error-banner" role="alert" style={{ margin: '10px 18px 0' }}>
              <WifiOff size={15} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>{errorBanner}</div>
              <button className="btn btn-sm" onClick={handleRefreshAll}>
                Retry
              </button>
            </div>
          )}

          <div className="viewport-content">
            {activeScreen === 'fleet' && (
              <FleetCommandCenterScreen
                fleet={fleet}
                selectedEngineId={selectedEngineId}
                selectedEngineRecord={selectedEngineRecord}
                latestState={latestState}
                telemetry={engineTelemetry}
                engineAlerts={engineAlerts}
                onSelectEngine={handleSelectEngine}
                onRefreshFleet={handleRefreshAll}
                onNavigate={setActiveScreen}
              />
            )}

            {activeScreen === 'twin' && (
              <EngineDigitalTwinScreen
                engineId={selectedEngineId}
                engineRecord={selectedEngineRecord}
                telemetry={engineTelemetry}
                latestState={latestState}
                onRefreshEngine={() => loadEngineData(selectedEngineId)}
                onNavigate={setActiveScreen}
              />
            )}

            {activeScreen === 'telemetry' && (
              <TelemetryExplorerScreen
                engineId={selectedEngineId}
                telemetry={engineTelemetry}
                onRefreshEngine={async () => {
                  await loadEngineData(selectedEngineId);
                  await loadGlobalData();
                }}
              />
            )}

            {activeScreen === 'faults' && (
              <FaultInvestigationScreen
                engineId={selectedEngineId}
                latestState={latestState}
                alerts={engineAlerts}
                catalog={catalog}
                onRefreshEngine={async () => {
                  await loadEngineData(selectedEngineId);
                  await loadGlobalData();
                }}
              />
            )}

            {activeScreen === 'simulator' && (
              <MissionSimulatorScreen
                selectedEngineId={selectedEngineId}
                catalog={catalog}
                onSimulationCompleted={handleSimulationCompleted}
              />
            )}

            {activeScreen === 'replay' && (
              <HistoricalMissionReplayScreen missions={missions} />
            )}

            {activeScreen === 'rul' && (
              <PredictiveMaintenanceRulScreen engineId={selectedEngineId} />
            )}

            {activeScreen === 'evaluation' && (
              <ModelEvaluationScreen
                modelStatus={modelStatus}
                onRefreshModelStatus={loadGlobalData}
              />
            )}

            {activeScreen === 'reports' && (
              <ReportsAndSettingsScreen
                reports={reports}
                catalog={catalog}
                modelStatus={modelStatus}
                backendHealth={backendHealth}
                onNavigate={setActiveScreen}
              />
            )}

            {activeScreen === 'docs' && (
              <SystemStatusAndTechDocsScreen
                backendHealth={backendHealth}
                catalog={catalog}
                modelStatus={modelStatus}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
