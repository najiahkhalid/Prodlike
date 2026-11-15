import type { NodeState } from './scenario/schema';

/** Socket.IO namespace and event names shared by the API and the web app (ADR-004). */
export const ATTEMPTS_NAMESPACE = '/attempts';

export const SocketEvents = {
  engineState: 'engine.state',
  nodeState: 'node.state',
  metricsTick: 'metrics.tick',
  pipelineStage: 'pipeline.stage',
  pipelineLog: 'pipeline.log',
  alertRaised: 'alert.raised',
  alertResolved: 'alert.resolved',
  terminalOutput: 'terminal.output',
  testsResult: 'tests.result',
} as const;

/** Scenario engine states (ADR-003). */
export const ENGINE_STATES = [
  'PROVISIONING',
  'READY',
  'PIPELINE_RUNNING',
  'FAILED_PIPELINE',
  'DEPLOYED',
  'INCIDENT_ACTIVE',
  'RECOVERING',
  'RECOVERED',
  'COMPLETED',
  'ABANDONED',
] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

export interface NodeStatePayload {
  attemptId: string;
  nodes: Record<string, NodeState>;
}

export interface MetricsTickPayload {
  attemptId: string;
  at: string;
  errorRatePct: number;
  p95LatencyMs: number;
  requestsPerSec: number;
}
