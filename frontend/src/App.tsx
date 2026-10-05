import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Box,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  Plane,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { drishtiApi } from './api/client';
import { UiLabShowcase } from './screens/UiLabShowcase';
import {
  ExplainableAlert,
  FleetOverview,
  FourValueDigitalTwinState,
  MissionRecordItem,
} from './types/telemetry';
import {
  EngineDigitalTwinScreen,
  FleetCommandCenterScreen,
  TelemetryExplorerScreen,
} from './screens/FleetAndTwinScreens';
import { FaultInvestigationScreen } from './screens/faults/FaultInvestigationScreen';
import {
  HistoricalMissionReplayScreen,
  MissionSimulatorScreen,
} from './screens/DiagnosticsAndSimScreens';
import { PredictiveMaintenanceRulScreen } from './screens/rul/PredictiveMaintenanceRulScreen';
import {
  ModelEvaluationScreen,
  ReportsAndSettingsScreen,
  SystemStatusAndTechDocsScreen,
} from './screens/RulEvalAndReportsScreens';
import './styles/workstation.css';

/* =========================================================================
   NAVIGATION STRUCTURE — 10 Aerospace Workstation Sections
   ========================================================================= */
const NAV_ITEMS = [
  {
    id: 'fleet',
    label: 'Command Center',
    tooltip: 'Fleet KPIs, interactive 3D engine twin, telemetry stream & readiness',
    icon: LayoutDashboard,
  },
  {
    id: 'twin',
    label: '3D Digital Twin',
    tooltip: 'Full 3D propulsion assembly, component tree & 4-value state matrix',
    icon: Cpu,
  },
  {
    id: 'telemetry',
    label: 'Health Monitoring',
    tooltip: 'All 8 SIH26054 parameter groups with 3-level engineering detail',
    icon: Database,
  },
  {
    id: 'faults',
    label: 'Fault Investigation',
    tooltip: '9-class classifier probabilities, sensor isolator & alert evidence',
    icon: Search,
  },
  {
    id: 'simulator',
    label: 'Mission Simulator',
    tooltip: '6-step guided deterministic fault injection & baseline comparison',
    icon: Sliders,
  },
  {
    id: 'replay',
    label: 'Historical Replay',
    tooltip: 'Synchronized 3D mission playback, time scrubber & alert timeline',
    icon: History,
  },
  {
    id: 'rul',
    label: 'Predictive Maint. & RUL',
    tooltip: 'Remaining Useful Life, uncertainty bounds & health policy weights',
    icon: Gauge,
  },
  {
    id: 'evaluation',
    label: 'Model Evaluation',
    tooltip: 'Held-out test metrics, confusion matrix & feature importance',
    icon: Award,
  },
  {
    id: 'reports',
    label: 'Reports & Settings',
    tooltip: 'Engineering evaluation reports, dataset provenance & system config',
    icon: FileText,
  },
  {
    id: 'docs',
    label: 'Data Sources & Docs',
    tooltip: 'Readiness checks, verified dataset provenance & SIH26054 data dictionary',
    icon: Activity,
  },
];

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<string>('fleet');
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  const [selectedEngineId, setSelectedEngineId] =
    useState<string>('ENG-MALE-02');
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [engineTelemetry, setEngineTelemetry] = useState<FourValueDigitalTwinState[]>([]);
  const [latestState, setLatestState] = useState<FourValueDigitalTwinState | null>(null);
  const [engineAlerts, setEngineAlerts] = useState<ExplainableAlert[]>([]);
  const [catalog, setCatalog] = useState<Record<string, unknown> | null>(null);
  const [modelStatus, setModelStatus] = useState<Record<string, unknown> | null>(null);
  const [missions, setMissions] = useState<MissionRecordItem[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [backendHealth, setBackendHealth] =
    useState<Record<string, unknown> | null>(null);
  const [measuredLatency, setMeasuredLatency] = useState<number>(145);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [simMode, setSimMode] = useState<'Simulation' | 'Hardware CAN'>('Simulation');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('drishti-theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });
  const [isUiLab, setIsUiLab] = useState<boolean>(() => {
    return Boolean(import.meta.env.DEV && typeof window !== 'undefined' && window.location.hash === '#/ui-lab');
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('drishti-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onHashChange = () => {
      setIsUiLab(Boolean(import.meta.env.DEV && window.location.hash === '#/ui-lab'));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  const loadGlobalData = async () => {
    try {
      setErrorBanner(null);
      const tStart = performance.now();
      const [h, fl, cat, ms, mis, reps] = await Promise.all([
        drishtiApi.getHealth().catch((err: unknown) => ({
          status: 'error',
          error: err instanceof Error ? err.message : 'Connection failed',
        })),
        drishtiApi.getFleet().catch(() => null),
        drishtiApi.getCatalog().catch(() => null),
        drishtiApi.getModelStatus().catch(() => null),
        drishtiApi.listMissions().catch(() => ({ total: 0, items: [] })),
        drishtiApi.listReports().catch(() => ({ total: 0, items: [] })),
      ]);
      const rtt = Math.round(performance.now() - tStart);
      if (h.status === 'ok') {
        setBackendHealth(h);
        setMeasuredLatency(rtt);
      } else {
        setBackendHealth(null);
      }
      if (fl) setFleet(fl);
      if (cat) setCatalog(cat);
      if (ms) setModelStatus(ms);
      if (mis?.items) setMissions(mis.items as unknown as MissionRecordItem[]);
      if (reps?.items) setReports(reps.items);
      if (h.status !== 'ok') {
        setErrorBanner(
          `FastAPI Backend offline at ${drishtiApi.getBaseUrl()}: ${
            String((h as Record<string, unknown>).error || 'Connection refused')
          }`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      setErrorBanner(
        `Backend API unreachable: ${msg}. Ensure backend is running or check network connectivity.`
      );
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorBanner(`Failed loading engine ${engId}: ${msg}`);
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
    const interval = setInterval(() => {
      loadGlobalData();
    }, 25000);
    return () => clearInterval(interval);
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
  const apiStatus = !backendHealth
    ? 'connecting'
    : apiOnline
    ? 'online'
    : 'offline';
  const latencyMs =
    typeof backendHealth?.last_inference_latency_ms === 'number'
      ? backendHealth.last_inference_latency_ms
      : measuredLatency;
  const activeAlertCount = fleet?.total_active_alerts ?? (engineAlerts.length || 0);

  return (
    <div className="workstation-shell" data-theme={theme}>
      {/* TOP COMMAND BAR */}
      <header className="topbar">
        {/* Brand Block */}
        <div className="brand-block">
          <button
            className="mobile-nav-trigger"
            onClick={() => setSidebarExpanded((v) => !v)}
            aria-label="Toggle navigation"
          >
            <Menu size={16} />
          </button>
          
          <div className="brand-symbol" title="DRISHTI SIH26054 Aero Digital Twin">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M4 6L16 2L28 6L16 16L4 6Z" fill="#38bdf8" fillOpacity="0.8" />
              <path d="M4 8L16 17L4 26L4 8Z" fill="#0284c7" fillOpacity="0.7" />
              <path d="M28 8L28 26L16 17L28 8Z" fill="#0369a1" fillOpacity="0.6" />
              <path d="M16 18L26 27L16 30L6 27L16 18Z" fill="#38bdf8" />
            </svg>
          </div>

          <div className="brand-text">
            <div className="brand-title-row">
              <span className="brand-title">DRISHTI</span>
              <span className="brand-badge">SIH26054</span>
            </div>
            <div className="brand-subtitle">
              AI-Enabled Aero Piston Engine Digital Twin
            </div>
          </div>
        </div>

        {/* Center Indicators */}
        <div className="topbar-center">
          {/* API Connectivity */}
          <div className={`status-pill ${apiOnline ? 'online' : errorBanner ? 'offline' : 'connecting'}`}>
            <span className={`status-dot ${apiStatus}`} />
            <span className="mono status-text">
              {apiOnline
                ? `API Connected ${latencyMs.toFixed(2)} ms`
                : errorBanner
                ? 'API Offline'
                : 'Connecting...'}
            </span>
          </div>

          {/* Simulation / Hardware Mode Selector */}
          <div className="topbar-select-pill">
            <span className="pill-label">Mode</span>
            <select
              className="pill-select mono"
              value={simMode}
              onChange={(e) =>
                setSimMode(e.target.value as 'Simulation' | 'Hardware CAN')
              }
              title="Operational execution environment"
            >
              <option value="Simulation">Simulation</option>
              <option value="Hardware CAN" disabled title="Physical CAN bus hardware required">Hardware CAN (Inactive)</option>
            </select>
          </div>

          {/* Active Engine Selector */}
          <div className="topbar-select-pill">
            <span className="pill-label">Active Engine</span>
            <select
              className="pill-select mono"
              value={selectedEngineId}
              onChange={(e) => setSelectedEngineId(e.target.value)}
              title="Select propulsion unit to inspect"
            >
              {fleet && fleet.engines.length > 0 ? (
                fleet.engines.map((e) => (
                  <option key={e.engine_id} value={e.engine_id}>
                    {e.engine_id} ({e.latest_fault_class})
                  </option>
                ))
              ) : (
                <option value={selectedEngineId}>{selectedEngineId}</option>
              )}
            </select>
          </div>

          {/* Mission Phase Indicator */}
          <div className="phase-pill">
            <Plane size={13} className="phase-icon" />
            <span className="pill-label">Mission Phase</span>
            <span className="phase-val mono">
              {latestState?.actual.throttle_pct && latestState.actual.throttle_pct > 85
                ? 'Climb'
                : latestState?.actual.rpm && latestState.actual.rpm < 2100
                ? 'Approach / Idle'
                : 'Cruise'}
            </span>
          </div>
        </div>

        {/* Right Section: DRDO Emblem, Theme, Alerts, User Avatar */}
        <div className="topbar-right">
          {/* DRDO Branding */}
          <div className="drdo-badge" title="Defence Research and Development Organisation — Robotics & Drones">
            <div className="drdo-crest">
              <span className="drdo-insignia">🛡️</span>
            </div>
            <div className="drdo-text">
              <span className="drdo-org">DRDO</span>
              <span className="drdo-sub">Robotics & Drones</span>
            </div>
          </div>

          {/* Theme visual toggle */}
          <button
            className="topbar-icon-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Display Mode' : 'Switch to Dark Tactical Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Alert Notification Bell */}
          <button
            className="topbar-icon-btn alert-bell-btn"
            onClick={() => setActiveScreen('faults')}
            title={`${activeAlertCount} Active Propulsion Alerts`}
            aria-label="Alerts"
          >
            <Bell size={15} />
            {activeAlertCount > 0 && (
              <span className="alert-count-dot">{activeAlertCount}</span>
            )}
          </button>

          {/* Refresh / Sync Button */}
          <button
            className="topbar-icon-btn"
            onClick={handleRefreshAll}
            disabled={refreshing}
            title="Synchronize Real Telemetry"
            aria-label="Synchronize Telemetry"
          >
            <RefreshCw size={14} className={refreshing ? 'loading-pulse' : ''} />
          </button>

          {/* Operator Avatar */}
          <div className="operator-avatar" title="DRDO Test Engineer Profile">
            <span>P</span>
          </div>
        </div>
      </header>

      {/* WORKSTATION BODY: SIDEBAR RAIL + VIEWPORT */}
      <div className={`workstation-body${sidebarExpanded ? ' sidebar-expanded' : ''}`}>
        {/* COLLAPSIBLE AEROSPACE NAVIGATION RAIL */}
        <aside
          className={`sidebar${sidebarExpanded ? ' expanded' : ''}`}
          aria-label="Main Navigation"
        >
          <div className="sidebar-header-toggle">
            <button
              className="rail-toggle-btn"
              onClick={() => setSidebarExpanded((v) => !v)}
              title={sidebarExpanded ? 'Collapse Navigation' : 'Expand Navigation'}
              aria-label={sidebarExpanded ? 'Collapse Navigation' : 'Expand Navigation'}
            >
              {sidebarExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveScreen(item.id)}
                  title={item.tooltip}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={16} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                  {isActive && <div className="active-glow-indicator" />}
                </button>
              );
            })}
          </nav>

          {/* Bottom Aerospace Mission Card */}
          {sidebarExpanded && (
            <div className="sidebar-mission-card">
              <div className="mission-card-content">
                <div className="mission-drone-graphic">
                  <svg width="100%" height="52" viewBox="0 0 200 52" fill="none">
                    <path d="M0 45 L50 35 L90 42 L130 30 L170 38 L200 28 L200 52 L0 52 Z" fill="#0e172a" fillOpacity="0.8" />
                    <path d="M0 48 L60 38 L110 44 L160 33 L200 39 L200 52 L0 52 Z" fill="#0284c7" fillOpacity="0.15" />
                    {/* Stealth UAV Silhouette */}
                    <g transform="translate(60, 10) scale(0.65)">
                      <path d="M30 4 L45 16 L65 14 L42 22 L30 26 L18 22 L-5 14 L15 16 Z" fill="#38bdf8" fillOpacity="0.85" />
                      <circle cx="30" cy="18" r="2" fill="#e0f2fe" />
                    </g>
                  </svg>
                </div>
                <div className="mission-text-block">
                  <div className="mission-headline">FOR LONGER. SAFER. MORE RELIABLE MISSIONS.</div>
                  <div className="mission-subtext">Smart Monitoring · Smarter Decisions</div>
                </div>
              </div>
            </div>
          )}

          <div className="sidebar-footer">
            <div className="sidebar-disclosure">
              <strong>Advisory Digital Twin</strong>
              DRDO SIH26054 Technical Demonstrator. Procedural engine geometry and ML diagnostics. No live flight hardware connection.
            </div>
            {import.meta.env.DEV && (
              <div style={{ marginTop: 8 }}>
                {isUiLab ? (
                  <a
                    href="#"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--cyan)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      textDecoration: 'none',
                    }}
                  >
                    ← Return to Operations
                  </a>
                ) : (
                  <a
                    href="#/ui-lab"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--cyan)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      textDecoration: 'none',
                    }}
                  >
                    🔬 Design System UI Lab
                  </a>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="main-viewport">
          {errorBanner && (
            <div className="error-banner" role="alert">
              <WifiOff size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <strong>API Notification:</strong> {errorBanner}
              </div>
              <button className="btn btn-sm" onClick={handleRefreshAll}>
                Retry Connection
              </button>
            </div>
          )}

          <div className="viewport-content">
            {import.meta.env.DEV && isUiLab ? (
              <UiLabShowcase currentTheme={theme} onToggleTheme={toggleTheme} />
            ) : (
              <>
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
                    backendError={errorBanner}
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
                    backendError={errorBanner}
                  />
                )}

                {activeScreen === 'telemetry' && (
                  <TelemetryExplorerScreen
                    engineId={selectedEngineId}
                    telemetry={engineTelemetry}
                    backendError={errorBanner}
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
                    backendError={errorBanner}
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
                    backendError={errorBanner}
                    onRefreshBackend={handleRefreshAll}
                    onSimulationCompleted={handleSimulationCompleted}
                  />
                )}

                {activeScreen === 'replay' && (
                  <HistoricalMissionReplayScreen
                    missions={missions}
                    backendError={errorBanner}
                    onRefreshBackend={handleRefreshAll}
                  />
                )}

                {activeScreen === 'rul' && (
                  <PredictiveMaintenanceRulScreen
                    engineId={selectedEngineId}
                    backendError={errorBanner}
                    onRefresh={async () => {
                      await loadEngineData(selectedEngineId);
                      await loadGlobalData();
                    }}
                  />
                )}

                {activeScreen === 'evaluation' && (
                  <ModelEvaluationScreen
                    modelStatus={modelStatus}
                    backendError={errorBanner}
                    onRefreshModelStatus={loadGlobalData}
                  />
                )}

                {activeScreen === 'reports' && (
                  <ReportsAndSettingsScreen
                    reports={reports}
                    catalog={catalog}
                    modelStatus={modelStatus}
                    backendHealth={backendHealth}
                    backendError={errorBanner}
                    onRefreshBackend={handleRefreshAll}
                    onNavigate={setActiveScreen}
                  />
                )}

                {activeScreen === 'docs' && (
                  <SystemStatusAndTechDocsScreen
                    backendHealth={backendHealth}
                    catalog={catalog}
                    modelStatus={modelStatus}
                    backendError={errorBanner}
                    onRefreshBackend={handleRefreshAll}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
