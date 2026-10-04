import React, { useEffect, useState } from 'react';
import {
  Activity,
  Award,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  PlayCircle,
  Search,
  Sliders,
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

const DEMO_STEPS = [
  {
    step: 1,
    title: 'Step 1–2: Seeded Simulated Fleet',
    screen: 'fleet',
    desc: 'Connected to local FastAPI backend; loaded 6-engine MALE UAV fleet.',
  },
  {
    step: 2,
    title: 'Step 3–5: 4-Value Twin & Residuals',
    screen: 'twin',
    desc: 'Inspect Actual vs Physics-Expected values and Calculated Residuals.',
  },
  {
    step: 3,
    title: 'Step 6: Deterministic Fault Injection',
    screen: 'simulator',
    desc: 'Run a seeded fault scenario (e.g. Cylinder Overheating, Seed 2026).',
  },
  {
    step: 4,
    title: 'Step 7–8: Classifier, Anomaly & Evidence',
    screen: 'faults',
    desc: 'Inspect 9-class probabilities, Sensor Isolator, and alert evidence.',
  },
  {
    step: 5,
    title: 'Step 9: Degradation & RUL Gating',
    screen: 'rul',
    desc: 'Inspect Health Indicator weights and RUL with 10th–90th bounds.',
  },
  {
    step: 6,
    title: 'Step 10: Synchronized Mission Replay',
    screen: 'replay',
    desc: 'Replay the mission timeline and verify alert synchronization.',
  },
  {
    step: 7,
    title: 'Step 11: Export Engineering Report',
    screen: 'reports',
    desc: 'Review and export the JSON Engineering Evaluation Report.',
  },
];

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<string>('fleet');
  const [selectedEngineId, setSelectedEngineId] =
    useState<string>('ENG-MALE-02');
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [engineTelemetry, setEngineTelemetry] = useState<
    FourValueDigitalTwinState[]
  >([]);
  const [latestState, setLatestState] =
    useState<FourValueDigitalTwinState | null>(null);
  const [engineAlerts, setEngineAlerts] = useState<ExplainableAlert[]>([]);
  const [catalog, setCatalog] = useState<Record<string, any> | null>(null);
  const [modelStatus, setModelStatus] = useState<Record<string, any> | null>(
    null
  );
  const [missions, setMissions] = useState<Record<string, any>[]>([]);
  const [reports, setReports] = useState<Record<string, any>[]>([]);
  const [backendHealth, setBackendHealth] = useState<Record<string, any> | null>(
    null
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [demoStepIdx, setDemoStepIdx] = useState<number>(0);

  const loadGlobalData = async () => {
    try {
      setErrorBanner(null);
      const [h, fl, cat, ms, mis, reps] = await Promise.all([
        drishtiApi.getHealth(),
        drishtiApi.getFleet(),
        drishtiApi.getCatalog(),
        drishtiApi.getModelStatus(),
        drishtiApi.listMissions(),
        drishtiApi.listReports(),
      ]);
      setBackendHealth(h);
      setFleet(fl);
      setCatalog(cat);
      setModelStatus(ms);
      setMissions(mis.items || []);
      setReports(reps.items || []);
    } catch (err: any) {
      setErrorBanner(
        `Backend API unreachable: ${err.message}. Ensure uvicorn backend.app.main:app is running on port 8000.`
      );
    }
  };

  const loadEngineData = async (engId: string) => {
    try {
      const [detail, telem] = await Promise.all([
        drishtiApi.getEngineDetail(engId),
        drishtiApi.getEngineTelemetry(engId, undefined, 200),
      ]);
      setLatestState(detail.latest_state);
      setEngineAlerts(detail.alerts || []);
      setEngineTelemetry(telem.items || []);
    } catch (err: any) {
      setErrorBanner(`Failed loading engine ${engId}: ${err.message}`);
    }
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

  const navItems = [
    { id: 'fleet', label: '1. Fleet Command Center', icon: LayoutDashboard },
    { id: 'twin', label: '2. 3D Engine Digital Twin', icon: Cpu },
    { id: 'telemetry', label: '3. Health Monitoring (8 Groups)', icon: Database },
    { id: 'faults', label: '4. Fault Investigation (8 Modes)', icon: Search },
    { id: 'simulator', label: '5. Mission Simulator', icon: Sliders },
    { id: 'replay', label: '6. Historical Replay', icon: History },
    { id: 'rul', label: '7. Predictive Maint & RUL', icon: Gauge },
    { id: 'evaluation', label: '8. Model Evaluation', icon: Award },
    { id: 'reports', label: '9. Reports & Settings', icon: FileText },
    { id: 'docs', label: '10. Data Sources & Tech Docs', icon: Activity },
  ];

  const selectedEngineRecord =
    (fleet?.engines || []).find((e) => e.engine_id === selectedEngineId) ||
    null;

  return (
    <div className="workstation-shell">
      {/* TOP AEROSPACE STATUS BAR */}
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-badge">SIH26054</span>
          <div>
            <div className="brand-title">
              DRISHTI — 3D AERO PISTON DIGITAL TWIN WORKSTATION
            </div>
            <div className="brand-subtitle">
              MALE UAV Propulsion Health Monitoring, 9-Class Diagnostics &
              Mission Reliability
            </div>
          </div>
        </div>

        <div className="topbar-controls">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ fontSize: 11, color: '#94a3b8' }}>
              Active Engine:
            </span>
            <select
              className="select-control mono"
              value={selectedEngineId}
              onChange={(e) => setSelectedEngineId(e.target.value)}
            >
              {(fleet?.engines || []).map((e) => (
                <option key={e.engine_id} value={e.engine_id}>
                  {e.engine_id} ({e.latest_fault_class} | HI:{' '}
                  {e.latest_health_index.toFixed(0)}%)
                </option>
              ))}
            </select>
          </div>

          <span className="badge badge-info">
            Physics: {backendHealth?.physics_model_version || 'Ref-v1.0'}
          </span>
          <span className="badge badge-nominal">
            <CheckCircle2 size={11} /> API:{' '}
            {backendHealth?.status === 'ok' ? 'ONLINE' : 'CONNECTING'} (
            {backendHealth?.last_inference_latency_ms ?? 0} ms)
          </span>
        </div>
      </header>

      <div className="workstation-body">
        {/* SIDEBAR NAVIGATION (10 FUNCTIONAL SCREENS) */}
        <aside className="sidebar">
          <div>
            <div className="nav-section-label">Engineering Workstation</div>
            {navItems.map((item) => {
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-btn ${
                    activeScreen === item.id ? 'active' : ''
                  }`}
                  onClick={() => setActiveScreen(item.id)}
                >
                  <IconComp size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              padding: 10,
              background: 'rgba(10, 15, 29, 0.85)',
              border: '1px solid #1c2942',
              borderRadius: 4,
              fontSize: 11,
              color: '#94a3b8',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: 4,
              }}
            >
              Engineering Disclosure
            </div>
            Advisory digital-twin demonstrator. 3D engine geometry, physics
            reference equations, and 9-class fault transfer functions are
            simplified procedural models. No live hardware connection is
            fabricated.
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="main-viewport">
          {errorBanner && (
            <div className="alert-box critical">{errorBanner}</div>
          )}

          {/* 11-STEP E2E DEMONSTRATION GUIDED WALKTHROUGH BAR */}
          <div className="demo-stepper-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PlayCircle size={18} color="#38bdf8" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  11-Step End-to-End Verification Walkthrough:{' '}
                  <span style={{ color: '#38bdf8' }}>
                    {DEMO_STEPS[demoStepIdx].title}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                  {DEMO_STEPS[demoStepIdx].desc}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEMO_STEPS.map((ds, idx) => (
                <button
                  key={ds.step}
                  className={`btn ${demoStepIdx === idx ? 'btn-primary' : ''}`}
                  onClick={() => {
                    setDemoStepIdx(idx);
                    setActiveScreen(ds.screen);
                  }}
                >
                  {ds.title.split(':')[0]}
                </button>
              ))}
            </div>
          </div>

          {activeScreen === 'fleet' && (
            <FleetCommandCenterScreen
              fleet={fleet}
              selectedEngineId={selectedEngineId}
              onSelectEngine={handleSelectEngine}
              onRefreshFleet={loadGlobalData}
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
            />
          )}

          {activeScreen === 'docs' && (
            <SystemStatusAndTechDocsScreen
              backendHealth={backendHealth}
              catalog={catalog}
              modelStatus={modelStatus}
            />
          )}
        </main>
      </div>
    </div>
  );
};
