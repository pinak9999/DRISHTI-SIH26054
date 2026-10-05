import {
  EngineRecord,
  ExplainableAlert,
  FaultScenarioConfig,
  FleetOverview,
  FourValueDigitalTwinState,
  ReplaySnapshot,
} from '../types/telemetry';

// Determine the API base URL:
// 1. Explicit Vite env var if provided (e.g. VITE_API_BASE_URL)
// 2. If running in browser on localhost/127.0.0.1 -> local FastAPI port 8000
// 3. Otherwise (e.g. deployed on Vercel) -> live Render production backend
export const API_BASE =
  import.meta.env?.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:8000'
    : 'https://drishti-sih26054.onrender.com');

async function requestJson<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 15000
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);

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
    return (await res.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Request to ${path} timed out after ${timeoutMs / 1000}s. Backend might be cold-starting on Render.`
      );
    }
    throw err;
  }
}

export const drishtiApi = {
  getBaseUrl: () => API_BASE,
  getHealth: () => requestJson<Record<string, unknown>>('/health'),
  getReadiness: () => requestJson<Record<string, unknown>>('/ready'),
  getHealthPolicy: () =>
    requestJson<Record<string, unknown>>('/api/config/health-policy'),
  updateHealthPolicy: (payload: Record<string, unknown>) =>
    requestJson<{
      status: string;
      health_policy: {
        weights: {
          thermal_penalty_weight: number;
          oil_penalty_weight: number;
          vibration_penalty_weight: number;
          anomaly_penalty_weight: number;
        };
        readiness_thresholds: {
          go_min_health_index: number;
          precaution_min_health_index: number;
          go_min_rul_hours?: number;
          precaution_min_rul_hours?: number;
        };
      };
    }>(
      '/api/config/health-policy',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  getModelStatus: () => requestJson<Record<string, unknown>>('/api/model-status'),
  retrainModels: (baseSeed = 1000) =>
    requestJson<Record<string, unknown>>(`/api/model-retrain?base_seed=${baseSeed}`, {
      method: 'POST',
    }),
  getCatalog: () => requestJson<Record<string, unknown>>('/api/catalog'),
  getFleet: () => requestJson<FleetOverview>('/api/fleet'),
  seedFleet: () =>
    requestJson<{ status: string; fleet: FleetOverview }>('/api/fleet/seed', {
      method: 'POST',
    }),
  getEngineDetail: (engineId: string) =>
    requestJson<{
      engine: EngineRecord;
      latest_state: FourValueDigitalTwinState | null;
      telemetry_count: number;
      alerts: ExplainableAlert[];
      physics_metadata: Record<string, unknown>;
    }>(`/api/engines/${encodeURIComponent(engineId)}`),
  getEngineParameterGroups: (engineId: string) =>
    requestJson<Record<string, unknown>>(
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
    requestJson<Record<string, unknown>>(
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
    requestJson<Record<string, unknown>>('/api/simulations', {
      method: 'POST',
      body: JSON.stringify(cfg),
    }),
  ingestCsv: (payload: {
    csv_text: string;
    engine_id: string;
    mission_id: string;
    title: string;
  }) =>
    requestJson<{
      mission: { mission_id: string };
      summary: { total_frames: number; final_predicted_class: string };
    }>('/api/telemetry/ingest-csv', {
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
    requestJson<{ total: number; items: Record<string, unknown>[] }>('/api/missions'),
  listReports: () =>
    requestJson<{ total: number; items: Record<string, unknown>[] }>('/api/reports'),
  getReport: (reportId: string) =>
    requestJson<Record<string, unknown>>(
      `/api/reports/${encodeURIComponent(reportId)}`
    ),
  getWebSocketUrl: (engineId: string) => {
    const wsBase = API_BASE.replace(/^http/, 'ws');
    return `${wsBase}/ws/telemetry?engine_id=${encodeURIComponent(engineId)}`;
  },
};
