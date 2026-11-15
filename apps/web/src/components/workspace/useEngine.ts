'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ATTEMPTS_NAMESPACE,
  SocketEvents,
  type AttemptView,
  type EngineSnapshot,
  type Metrics,
  type MetricsTickPayload,
  type PipelineLogPayload,
} from '@prodlike/shared';
import { clientApi } from '@/lib/client-api';

/** How the browser reaches the API's Socket.IO endpoint (ADR-007). */
export interface RealtimeConfig {
  /** API port on the same host (dev), or null to use the same origin under /api (Docker/Caddy). */
  port: string | null;
}

const HISTORY = 40;

/**
 * Live engine state for the workspace (FR-12, NFR-03).
 * Socket.IO first; if the socket cannot connect, polls the REST API every 2 s so the
 * workspace still works (just less instantly).
 */
export function useEngine(attemptId: string, initial: EngineSnapshot, realtime: RealtimeConfig) {
  const [engine, setEngine] = useState(initial);
  const [history, setHistory] = useState<Metrics[]>(() => [initial.metrics]);
  const [pipelineLog, setPipelineLog] = useState<PipelineLogPayload[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const lastRun = useRef(initial.pipeline?.number ?? 0);

  const apply = (s: EngineSnapshot) => {
    setEngine(s);
    // A new pipeline run starts with an empty live log.
    const run = s.pipeline?.number ?? 0;
    if (run !== lastRun.current) {
      lastRun.current = run;
      setPipelineLog([]);
    }
  };

  useEffect(() => {
    const { protocol, hostname } = window.location;
    const socket = realtime.port
      ? io(`${protocol}//${hostname}:${realtime.port}${ATTEMPTS_NAMESPACE}`, {
          path: '/socket.io',
          transports: ['websocket'],
          withCredentials: true,
        })
      : io(ATTEMPTS_NAMESPACE, { path: '/api/socket.io', transports: ['websocket'], withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', async () => {
      const ack = await socket
        .timeout(5000)
        .emitWithAck(SocketEvents.join, { attemptId })
        .catch(() => null);
      if (ack && !('error' in ack)) {
        apply(ack as EngineSnapshot);
        setConnected(true);
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(SocketEvents.snapshot, (s: EngineSnapshot) => apply(s));
    socket.on(SocketEvents.metricsTick, (m: MetricsTickPayload) =>
      setHistory((h) => [
        ...h.slice(-(HISTORY - 1)),
        { errorRatePct: m.errorRatePct, p95LatencyMs: m.p95LatencyMs, requestsPerSec: m.requestsPerSec },
      ]),
    );
    socket.on(SocketEvents.pipelineLog, (p: PipelineLogPayload) =>
      setPipelineLog((l) => [...l.slice(-300), p]),
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [attemptId, realtime.port]);

  // Fallback: poll while the socket is not connected.
  useEffect(() => {
    if (connected) return;
    const t = setInterval(async () => {
      try {
        const view = await clientApi<AttemptView>(`/attempts/${attemptId}`);
        apply(view.engine);
        setHistory((h) => [...h.slice(-(HISTORY - 1)), view.engine.metrics]);
      } catch {
        // keep the last known state
      }
    }, 2000);
    return () => clearInterval(t);
  }, [connected, attemptId]);

  return { engine, setEngine: apply, history, pipelineLog, connected };
}
