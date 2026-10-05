import { useEffect, useRef, useState, useCallback } from 'react';
import { drishtiApi } from '../api/client';
import { ExplainableAlert, FourValueDigitalTwinState } from '../types/telemetry';

export type WsConnectionState = 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'OFFLINE';

export interface UseLiveTelemetryOptions {
  engineId: string;
  enabled?: boolean;
  maxReconnectAttempts?: number;
  onFrame?: (frame: FourValueDigitalTwinState, alert?: ExplainableAlert) => void;
}

export interface UseLiveTelemetryResult {
  connectionState: WsConnectionState;
  lastFrame: FourValueDigitalTwinState | null;
  lastAlert: ExplainableAlert | null;
  latencyMs: number;
  reconnect: () => void;
  selectEngine: (engineId: string) => void;
}

export function useLiveTelemetry({
  engineId,
  enabled = true,
  maxReconnectAttempts = 6,
  onFrame,
}: UseLiveTelemetryOptions): UseLiveTelemetryResult {
  const [connectionState, setConnectionState] = useState<WsConnectionState>('CONNECTING');
  const [lastFrame, setLastFrame] = useState<FourValueDigitalTwinState | null>(null);
  const [lastAlert, setLastAlert] = useState<ExplainableAlert | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const isIntentionalCloseRef = useRef<boolean>(false);

  const connect = useCallback((targetEngineId: string) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      isIntentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState(
      reconnectAttemptsRef.current > 0 ? 'RECONNECTING' : 'CONNECTING'
    );
    isIntentionalCloseRef.current = false;

    try {
      const url = drishtiApi.getWebSocketUrl(targetEngineId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      const connectStartTime = performance.now();

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionState('LIVE');
        const connectRtt = Math.max(1, Math.round(performance.now() - connectStartTime));
        setLatencyMs(connectRtt);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'telemetry_frame' && payload.twin_state) {
            const frame = payload.twin_state as FourValueDigitalTwinState;
            const alert = (payload.alert as ExplainableAlert) || undefined;
            setLastFrame(frame);
            if (alert) setLastAlert(alert);

            // Compute frame delay if valid ISO timestamp
            if (frame.timestamp) {
              const frameTime = new Date(frame.timestamp).getTime();
              const now = Date.now();
              const diff = Math.max(1, Math.min(999, now - frameTime));
              if (!Number.isNaN(diff)) {
                setLatencyMs(diff);
              }
            }

            if (onFrameRef.current) {
              onFrameRef.current(frame, alert);
            }
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (isIntentionalCloseRef.current) return;

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1;
          setConnectionState('RECONNECTING');
          const delay = Math.min(1000 * Math.pow(1.4, reconnectAttemptsRef.current), 5000);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(targetEngineId);
          }, delay);
        } else {
          setConnectionState('OFFLINE');
        }
      };

      ws.onerror = () => {
        // onclose will handle retry state transition
      };
    } catch {
      setConnectionState('OFFLINE');
    }
  }, [maxReconnectAttempts]);

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) {
        isIntentionalCloseRef.current = true;
        wsRef.current.close();
      }
      setConnectionState('OFFLINE');
      return;
    }

    reconnectAttemptsRef.current = 0;
    connect(engineId);

    return () => {
      isIntentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [engineId, enabled, connect]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect(engineId);
  }, [connect, engineId]);

  const selectEngine = useCallback(
    (newEngineId: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({ type: 'select_engine', engine_id: newEngineId })
          );
        } catch {
          // fallback to reconnect
          reconnectAttemptsRef.current = 0;
          connect(newEngineId);
        }
      } else {
        reconnectAttemptsRef.current = 0;
        connect(newEngineId);
      }
    },
    [connect]
  );

  return {
    connectionState,
    lastFrame,
    lastAlert,
    latencyMs,
    reconnect,
    selectEngine,
  };
}
