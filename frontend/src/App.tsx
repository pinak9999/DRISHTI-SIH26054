import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  Bell,
<<<<<<< HEAD
  BookOpen,
  Box,
=======
  ChevronLeft,
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
<<<<<<< HEAD
=======
  Moon,
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
  Plane,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
<<<<<<< HEAD
=======
  Wifi,
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
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
<<<<<<< HEAD
   10 NUMBERED WORKSTATION NAVIGATION SECTIONS
   ========================================================================= */
const WORKSTATION_NAV = [
  { id: 'fleet', num: '1', label: 'Command Center', icon: LayoutDashboard },
  { id: 'twin', num: '2', label: '3D Digital Twin', icon: Cpu },
  { id: 'telemetry', num: '3', label: 'Health Monitoring', icon: Database },
  { id: 'faults', num: '4', label: 'Fault Investigation', icon: Search },
  { id: 'simulator', num: '5', label: 'Mission Simulator', icon: Sliders },
  { id: 'replay', num: '6', label: 'Historical Replay', icon: History },
  { id: 'rul', num: '7', label: 'Predictive Maintenance', icon: Gauge },
  { id: 'evaluation', num: '8', label: 'Model Evaluation', icon: Award },
  { id: 'reports', num: '9', label: 'Reports & Settings', icon: FileText },
  { id: 'docs', num: '10', label: 'Data Sources & Diagnostics', icon: BookOpen },
=======
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
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
];

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<string>('fleet');
<<<<<<< HEAD
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [selectedEngineId, setSelectedEngineId] = useState<string>('ENG-MALE-02');
=======
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);
  const [selectedEngineId, setSelectedEngineId] =
    useState<string>('ENG-MALE-02');
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [engineTelemetry, setEngineTelemetry] = useState<FourValueDigitalTwinState[]>([]);
  const [latestState, setLatestState] = useState<FourValueDigitalTwinState | null>(null);
  const [engineAlerts, setEngineAlerts] = useState<ExplainableAlert[]>([]);
  const [catalog, setCatalog] = useState<Record<string, any> | null>(null);
  const [modelStatus, setModelStatus] = useState<Record<string, any> | null>(null);
  const [missions, setMissions] = useState<Record<string, any>[]>([]);
  const [reports, setReports] = useState<Record<string, any>[]>([]);
<<<<<<< HEAD
  const [backendHealth, setBackendHealth] = useState<Record<string, any> | null>(null);
  const [measuredLatency, setMeasuredLatency] = useState<number>(145);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
=======
  const [backendHealth, setBackendHealth] =
    useState<Record<string, any> | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [simMode, setSimMode] = useState<'Simulation' | 'Hardware CAN'>('Simulation');
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)

  const loadGlobalData = async () => {
    try {
      setErrorBanner(null);
      const tStart = performance.now();
      const [h, fl, cat, ms, mis, reps] = await Promise.all([
        drishtiApi.getHealth().catch((err) => ({ status: 'error', error: err.message })),
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
      if (mis?.items) setMissions(mis.items);
      if (reps?.items) setReports(reps.items);
      if (h.status !== 'ok') {
        setErrorBanner(`FastAPI Backend offline at ${drishtiApi.getBaseUrl()}: ${h.error || 'Connection refused'}`);
      }
    } catch (err: any) {
<<<<<<< HEAD
      setErrorBanner(`API unreachable: ${err.message}.`);
=======
      setErrorBanner(
        `Backend API unreachable: ${err.message}. Ensure backend is running or check network connectivity.`
      );
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
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
  const activeAlertCount = fleet?.total_active_alerts ?? (engineAlerts.length || 0);

  const apiOnline = backendHealth?.status === 'ok';
  const apiStatus = !backendHealth
    ? 'connecting'
    : apiOnline
    ? 'online'
    : 'offline';
  const latencyMs = backendHealth?.last_inference_latency_ms ?? 104.56;
  const activeAlertCount = fleet?.total_active_alerts ?? engineAlerts.length;

  return (
    <div className="workstation-shell">
<<<<<<< HEAD
      {/* =========================================================================
          TOP COMMAND BAR (EXACT REFERENCE DESIGN)
          ========================================================================= */}
      <header className="topbar">
        {/* 1. Left Drone Logo & DRISHTI SIH26054 */}
        <div className="topbar-brand">
          <div className="topbar-drone-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <path d="M4 14L16 4L28 14L24 16L16 10L8 16L4 14Z" fill="#36d9ff" />
              <path d="M16 10L20 28L16 25L12 28L16 10Z" fill="#0284c7" />
              <path d="M8 16L2 22L7 20L11 22L8 16Z" fill="#36d9ff" fillOpacity="0.8" />
              <path d="M24 16L30 22L25 20L21 22L24 16Z" fill="#36d9ff" fillOpacity="0.8" />
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
=======
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
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
            </div>
          </div>
        </div>

<<<<<<< HEAD
        {/* 3. Official DRDO Crest Badge */}
        <div className="topbar-drdo-crest">
          <div className="drdo-seal-circle">
            <ShieldCheck size={14} color="#36d9ff" />
          </div>
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
            <span>{apiOnline ? `API: ONLINE ${measuredLatency} ms` : 'API: OFFLINE'}</span>
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
=======
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
              onChange={(e) => setSimMode(e.target.value as any)}
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
          <button className="topbar-icon-btn" title="Dark Tactical Display Mode Active" aria-label="Dark Mode">
            <Moon size={15} />
          </button>

          {/* Alert Notification Bell */}
          <button
            className="topbar-icon-btn alert-bell-btn"
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
            onClick={() => setActiveScreen('faults')}
            title={`${activeAlertCount} Active Propulsion Alerts`}
            aria-label="Alerts"
          >
            <Bell size={15} />
            {activeAlertCount > 0 && (
<<<<<<< HEAD
              <span className="bell-badge-count">{activeAlertCount}</span>
            )}
          </button>

          <button
            className="topbar-bell-btn"
            onClick={handleRefreshAll}
            disabled={refreshing}
            title="Synchronize Telemetry"
            aria-label="Refresh Telemetry"
=======
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
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
          >
            <RefreshCw size={14} className={refreshing ? 'loading-pulse' : ''} />
          </button>

<<<<<<< HEAD
          <div className="topbar-user-avatar" title="DRDO Test Engineer Profile">
=======
          {/* Operator Avatar */}
          <div className="operator-avatar" title="DRDO Test Engineer Profile">
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
            <span>P</span>
          </div>
        </div>
      </header>

<<<<<<< HEAD
      {/* =========================================================================
          WORKSTATION BODY: SIDEBAR + MAIN VIEWPORT
          ========================================================================= */}
      <div className={`workstation-body ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar" aria-label="Main Navigation">
          <div className="sidebar-header-label">ENGINEERING WORKSTATION</div>

          <nav className="sidebar-menu-list">
            {WORKSTATION_NAV.map((item) => {
=======
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
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
              const Icon = item.icon;
              const isActive = activeScreen === item.id;
              return (
                <button
                  key={item.id}
<<<<<<< HEAD
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveScreen(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="sidebar-nav-icon" />
                  <span className="sidebar-nav-label">
                    {item.num}. {item.label}
                  </span>
=======
                  className={`nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveScreen(item.id)}
                  title={item.tooltip}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={16} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                  {isActive && <div className="active-glow-indicator" />}
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
                </button>
              );
            })}
          </nav>

<<<<<<< HEAD
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
=======
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
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
            </div>
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="main-viewport">
          {errorBanner && (
<<<<<<< HEAD
            <div className="error-banner" role="alert" style={{ margin: '10px 18px 0' }}>
              <WifiOff size={15} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>{errorBanner}</div>
              <button className="btn btn-sm" onClick={handleRefreshAll}>
                Retry
=======
            <div className="error-banner" role="alert">
              <WifiOff size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <strong>API Notification:</strong> {errorBanner}
              </div>
              <button className="btn btn-sm" onClick={handleRefreshAll}>
                Retry Connection
>>>>>>> e68479d (Upgrade DRISHTI premium digital twin UI)
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
