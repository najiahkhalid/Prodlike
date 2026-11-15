import { z } from 'zod';
import type { NodeState, Scenario } from './scenario/schema';

/** Socket.IO namespace and event names shared by the API and the web app (ADR-004, ADR-007). */
export const ATTEMPTS_NAMESPACE = '/attempts';

export const SocketEvents = {
  /** client -> server: start receiving an attempt's events. Ack: EngineSnapshot or { error }. */
  join: 'attempt.join',
  /** server -> client: the full engine state, sent on join and after every change. */
  snapshot: 'engine.snapshot',
  /** server -> client: production metrics, once per second. */
  metricsTick: 'metrics.tick',
  /** server -> client: one line of CI/CD pipeline output. */
  pipelineLog: 'pipeline.log',
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

/** POST /attempts/:id/deploy (FR-08, FR-09). */
export const DeploySchema = z.object({
  message: z.string().trim().min(3, 'Write a short commit message').max(120),
  strategy: z.enum(['direct', 'canary']),
});
export type DeployInput = z.input<typeof DeploySchema>;

export type StageStatus = 'waiting' | 'running' | 'passed' | 'failed' | 'skipped';

export interface PipelineRun {
  number: number;
  message: string;
  strategy: 'direct' | 'canary';
  /** Release this run deploys, e.g. v1.4.2. */
  release: string;
  /** A deploy made while an incident is open. */
  hotfix: boolean;
  /** `log` keeps the last lines of each stage, so a refresh still shows them. */
  stages: { id: string; name: string; status: StageStatus; log: string[] }[];
  startedAt: string;
  finishedAt?: string;
}

export interface IncidentView {
  faultId: string;
  severity: Scenario['faults'][number]['alert']['severity'];
  title: string;
  service: string;
  release: string;
  startedAt: string;
  resolvedAt?: string;
  resolvedBy?: 'rollback' | 'hotfix';
  /** Share of users hit: 100 for a direct deploy, the canary percentage for a canary. */
  impactPct: number;
}

export interface Metrics {
  errorRatePct: number;
  p95LatencyMs: number;
  requestsPerSec: number;
}

/** Everything the System zone shows: production as the engine sees it (FR-08..12). */
export interface EngineSnapshot {
  attemptId: string;
  state: EngineState;
  /** Release currently serving production traffic. */
  release: string;
  /** The release before it (what a rollback restores). */
  previousRelease: string | null;
  nodes: Record<string, NodeState>;
  edges: [string, string][];
  layout: { id: string; label: string; kind: string; x: number; y: number }[];
  metrics: Metrics;
  pipeline: PipelineRun | null;
  incident: IncidentView | null;
  /** Seconds from alert to restored service, once recovered. */
  timeToRecoverSeconds: number | null;
  /**
   * Production is healthy and has been watched long enough after the last deploy.
   * (Always waits the same window, so it never hints whether an incident is coming.)
   */
  canFinish: boolean;
  canaryPercent: number;
}

export interface MetricsTickPayload extends Metrics {
  attemptId: string;
  at: string;
}

export interface PipelineLogPayload {
  attemptId: string;
  stage: string;
  line: string;
}
