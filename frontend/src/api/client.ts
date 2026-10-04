import {
  ExplainableAlert,
  FaultScenarioConfig,
  FleetOverview,
  FourValueDigitalTwinState,
  ReplaySnapshot,
} from '../types/telemetry';

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      detail = errBody.detail || JSON.stringify(errBody);
    } catch {
      // ignore json parse failure
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const drishtiApi = {
  getHealth: () => requestJson<Record<string, any>>('/health'),
  getReadiness: () => requestJson<Record<string, any>>('/ready'),
  getHealthPolicy: () =>
    requestJson<Record<string, any>>('/api/config/health-policy'),
  updateHealthPolicy: (payload: Record<string, any>) =>
    requestJson<{ status: string; health_policy: Record<string, any> }>(
      '/api/config/health-policy',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  getModelStatus: () => requestJson<Record<string, any>>('/api/model-status'),
  retrainModels: (baseSeed = 1000) =>
    requestJson<Record<string, any>>(`/api/model-retrain?base_seed=${baseSeed}`, {
      method: 'POST',
    }),
  getCatalog: () => requestJson<Record<string, any>>('/api/catalog'),
  getFleet: () => requestJson<FleetOverview>('/api/fleet'),
  seedFleet: () =>
    requestJson<{ status: string; fleet: FleetOverview }>('/api/fleet/seed', {
      method: 'POST',
    }),
  getEngineDetail: (engineId: string) =>
    requestJson<{
      engine: any;
      latest_state: FourValueDigitalTwinState | null;
      telemetry_count: number;
      alerts: ExplainableAlert[];
      physics_metadata: Record<string, any>;
    }>(`/api/engines/${encodeURIComponent(engineId)}`),
  getEngineParameterGroups: (engineId: string) =>
    requestJson<Record<string, any>>(
      `/api/engines/${encodeURIComponent(engineId)}/parameter-groups`
    ),
  getEngineTelemetry: (engineId: string, missionId?: string, limit = 150) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (missionId) q.set('mission_id', missionId);
    return requestJson<{
      engine_id: string;
      mission_id: string;
      total: number;
      items: FourValueDigitalTwinState[];
    }>(`/api/engines/${encodeURIComponent(engineId)}/telemetry?${q.toString()}`);
  },
  getEngineHealth: (engineId: string) =>
    requestJson<Record<string, any>>(
      `/api/engines/${encodeURIComponent(engineId)}/health`
    ),
  getEngineAlerts: (engineId: string) =>
    requestJson<{ engine_id: string; total: number; items: ExplainableAlert[] }>(
      `/api/engines/${encodeURIComponent(engineId)}/alerts`
    ),
  acknowledgeAlert: (alertId: string, acknowledged = true) =>
    requestJson<{ status: string; alert: ExplainableAlert }>(
      `/api/alerts/${encodeURIComponent(alertId)}/acknowledge?acknowledged=${acknowledged}`,
      { method: 'POST' }
    ),
  runSimulation: (cfg: FaultScenarioConfig) =>
    requestJson<Record<string, any>>('/api/simulations', {
      method: 'POST',
      body: JSON.stringify(cfg),
    }),
  ingestCsv: (payload: {
    csv_text: string;
    engine_id: string;
    mission_id: string;
    title: string;
  }) =>
    requestJson<Record<string, any>>('/api/telemetry/ingest-csv', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startReplay: (missionId: string, playbackSpeed = 1.0, startIndex = 0) =>
    requestJson<ReplaySnapshot>('/api/replay/start', {
      method: 'POST',
      body: JSON.stringify({
        mission_id: missionId,
        playback_speed: playbackSpeed,
        start_index: startIndex,
      }),
    }),
  stopReplay: () =>
    requestJson<ReplaySnapshot>('/api/replay/stop', { method: 'POST' }),
  seekReplay: (params: {
    target_index?: number;
    target_timestamp?: string;
    target_elapsed_sec?: number;
    playback_speed?: number;
  }) =>
    requestJson<ReplaySnapshot>('/api/replay/seek', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  stepReplay: (steps = 1) =>
    requestJson<ReplaySnapshot>('/api/replay/step', {
      method: 'POST',
      body: JSON.stringify({ steps }),
    }),
  getReplayStatus: () => requestJson<ReplaySnapshot>('/api/replay/status'),
  listMissions: () =>
    requestJson<{ total: number; items: Record<string, any>[] }>('/api/missions'),
  listReports: () =>
    requestJson<{ total: number; items: Record<string, any>[] }>('/api/reports'),
  getReport: (reportId: string) =>
    requestJson<Record<string, any>>(
      `/api/reports/${encodeURIComponent(reportId)}`
    ),
  getWebSocketUrl: (engineId: string) => {
    const wsBase = API_BASE.replace(/^http/, 'ws');
    return `${wsBase}/ws/telemetry?engine_id=${encodeURIComponent(engineId)}`;
  },
};
