import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Attempt, AttemptState, Prisma } from '@prisma/client';
import type {
  DeployInput,
  EngineSnapshot,
  Metrics,
  NodeState,
  PipelineRun,
  Scenario,
} from '@prodlike/shared';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { SandboxService } from '../sandbox/sandbox.service';
import { EngineBus } from './engine-bus';

/**
 * The scenario engine (ADR-003). One state machine per attempt:
 *   READY -> PIPELINE_RUNNING -> (FAILED_PIPELINE | DEPLOYED) -> INCIDENT_ACTIVE
 *         -> RECOVERING (rollback) / hotfix deploy -> RECOVERED -> COMPLETED
 * The pipeline's build/lint/test stages run FOR REAL in the learner's sandbox; the deploy,
 * production traffic, metrics, logs and incidents are simulated from the scenario file.
 */

interface PendingFault {
  faultId: string;
  at: string;
}

/** What is persisted in Attempt.snapshot.engine, so an API restart resumes the story (NFR-14). */
interface Persisted {
  snap: Omit<EngineSnapshot, 'metrics' | 'canFinish'>;
  pending: PendingFault | null;
  /** After a deploy, production must be watched until this time before finishing. */
  watchUntil: string | null;
  strategy: 'direct' | 'canary' | null;
  releaseCounter: number;
}

interface Runtime extends Persisted {
  attemptId: string;
  def: Scenario;
  metrics: Metrics;
  timers: Set<NodeJS.Timeout>;
  ticker?: NodeJS.Timeout;
  busy: boolean;
}

const LOCKED = new Set<AttemptState>([
  'PIPELINE_RUNNING',
  'RECOVERING',
  'COMPLETED',
  'ABANDONED',
  'PROVISIONING',
]);
const MAX_LOG_LINES = 40;

const engineError = (code: string, message: string, action: string) =>
  new ApiException(HttpStatus.CONFLICT, code, message, action);

/** v1.4.2 -> v1.4.3 */
export function bumpPatch(release: string, by = 1): string {
  const m = /^(v?\d+\.\d+\.)(\d+)$/.exec(release);
  return m ? `${m[1]}${Number(m[2]) + by}` : `${release}.${by}`;
}

@Injectable()
export class EngineService implements OnModuleDestroy {
  private readonly logger = new Logger(EngineService.name);
  private readonly runtimes = new Map<string, Runtime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly bus: EngineBus,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ================================================================ public API

  /** Current engine state for an attempt (loads it on first use). */
  async snapshot(attempt: Attempt, def: Scenario): Promise<EngineSnapshot> {
    const ended = attempt.state === 'COMPLETED' || attempt.state === 'ABANDONED';
    if (ended && !this.runtimes.has(attempt.id)) {
      // Read-only view of a finished attempt: no live runtime, no timers.
      const rt = await this.load(attempt, def);
      const view = this.view(rt);
      this.dispose(attempt.id);
      return view;
    }
    return this.view(await this.load(attempt, def));
  }

  /** FR-08/FR-09: commit, run the pipeline, deploy. Returns at once; progress arrives as events. */
  async deploy(
    attempt: Attempt,
    def: Scenario,
    containerId: string,
    input: DeployInput,
  ): Promise<EngineSnapshot> {
    const rt = await this.load(attempt, def);
    if (rt.busy || LOCKED.has(rt.snap.state)) {
      throw engineError(
        'ENGINE_BUSY',
        'A pipeline or rollback is already running.',
        'Wait for it to finish, then try again.',
      );
    }
    if (!def.deploy.strategies.includes(input.strategy)) {
      throw engineError(
        'STRATEGY_NOT_AVAILABLE',
        `The ${input.strategy} strategy is not available in this scenario.`,
        'Pick another strategy.',
      );
    }
    rt.busy = true;
    const hotfix = rt.snap.state === 'INCIDENT_ACTIVE';
    // A new release replaces whatever incident was still scheduled for the old one.
    if (!hotfix) this.clearPending(rt);
    const run: PipelineRun = {
      number: (rt.snap.pipeline?.number ?? 0) + 1,
      message: input.message,
      strategy: input.strategy,
      release: rt.releaseCounter === 0 ? def.releases.next : bumpPatch(def.releases.next, rt.releaseCounter),
      hotfix,
      stages: def.pipeline.stages.map((s) => ({ id: s.id, name: s.name, status: 'waiting', log: [] })),
      startedAt: new Date().toISOString(),
    };
    rt.snap.pipeline = run;
    if (!hotfix) await this.setState(rt, 'PIPELINE_RUNNING');
    else await this.persist(rt);
    await this.event(rt, 'deploy.requested', { strategy: input.strategy, message: input.message, hotfix });
    this.publish(rt);

    void this.runPipeline(rt, containerId, run).catch((e) => {
      this.logger.error(`Pipeline crashed for ${rt.attemptId}: ${(e as Error).stack}`);
      rt.busy = false;
    });
    return this.view(rt);
  }

  /** FR-11: roll production back to the previous release. */
  async rollback(attempt: Attempt, def: Scenario): Promise<{ output: string; snapshot: EngineSnapshot }> {
    const rt = await this.load(attempt, def);
    if (rt.busy || LOCKED.has(rt.snap.state)) {
      return {
        output: 'A pipeline or rollback is already running. Wait for it to finish.\n',
        snapshot: this.view(rt),
      };
    }
    if (!rt.snap.previousRelease) {
      return {
        output: `Nothing to roll back: production is already on ${rt.snap.release}, the first release.\n`,
        snapshot: this.view(rt),
      };
    }
    rt.busy = true;
    const from = rt.snap.release;
    const to = rt.snap.previousRelease;
    const hadIncident = rt.snap.state === 'INCIDENT_ACTIVE';
    this.clearPending(rt);
    await this.setNodes(rt, this.services(rt.def, 'deploying'));
    await this.setState(rt, 'RECOVERING');
    await this.event(rt, 'rollback.started', { from, to });

    await this.sleep(rt, 2000);
    rt.snap.release = to;
    rt.snap.previousRelease = null;
    rt.busy = false;
    await this.setNodes(rt, this.allNodes(rt.def, 'healthy'));
    const fault = rt.snap.incident ? this.faultOf(rt) : undefined;
    if (hadIncident && fault?.resolutions.some((r) => r.type === 'rollback')) {
      await this.resolve(rt, 'rollback');
    } else if (hadIncident && fault) {
      // Rolling back does not fix this kind of fault: it carries on.
      await this.applyFault(rt, fault);
      await this.setState(rt, 'INCIDENT_ACTIVE');
    } else {
      await this.setState(rt, 'READY');
    }
    await this.event(rt, 'rollback.completed', { from, to });
    return {
      output: `\x1b[33mRolled back production from ${from} to ${to}.\x1b[0m ${hadIncident && rt.snap.state === 'RECOVERED' ? '\x1b[32mHealth checks passing.\x1b[0m' : ''}\n`,
      snapshot: this.view(rt),
    };
  }

  /** The `logs <service>` terminal command: simulated production logs. */
  async logs(attempt: Attempt, def: Scenario, args: string[]): Promise<string> {
    const rt = await this.load(attempt, def);
    const names = def.architecture.nodes.map((n) => n.id);
    const wanted = args[0]?.replace(/-service$/, '');
    if (!wanted) return `Usage: logs <service>   (services: ${names.join(', ')})\n`;
    const node = def.architecture.nodes.find((n) => n.id === wanted || n.label === args[0]);
    if (!node) return `Unknown service "${args[0]}". Services: ${names.join(', ')}\n`;

    await this.event(rt, 'terminal.logs', { service: node.id });
    const fault = rt.snap.state === 'INCIDENT_ACTIVE' ? this.faultOf(rt) : undefined;
    const lines = fault?.effect.logs.filter((l) => l.service === node.id) ?? [];
    const time = (offset: number) => new Date(Date.now() - offset * 1000).toISOString().slice(11, 19);
    if (!lines.length) {
      return `\x1b[2m${time(0)}\x1b[0m INFO  ${node.label} healthy · ${rt.snap.release} · 0 errors in the last 5m\n`;
    }
    const colour = { ERROR: '31', WARN: '33', INFO: '0' } as const;
    const out: string[] = [];
    for (let i = 0; i < 6; i++) {
      const l = lines[i % lines.length];
      out.push(
        `\x1b[2m${time(6 - i)}\x1b[0m \x1b[${colour[l.level]}m${l.level.padEnd(5)} ${l.message}\x1b[0m`,
      );
    }
    return `${out.join('\n')}\n`;
  }

  /** Finish the attempt (Phase 4 adds scoring and the debrief). */
  async finish(attempt: Attempt, def: Scenario): Promise<EngineSnapshot> {
    const rt = await this.load(attempt, def);
    // Recovered from the incident, or shipped a release whose faults were all prevented
    // (an incident still scheduled means production has not been watched yet).
    if (!this.canFinish(rt)) {
      throw engineError(
        'NOT_FINISHED',
        'This scenario is not finished yet.',
        'Ship your change and make sure production is healthy, then finish.',
      );
    }
    await this.setState(rt, 'COMPLETED');
    await this.prisma.attempt.update({ where: { id: rt.attemptId }, data: { endedAt: new Date() } });
    await this.event(rt, 'attempt.completed', { timeToRecoverSeconds: rt.snap.timeToRecoverSeconds });
    const view = this.view(rt);
    this.dispose(rt.attemptId);
    return view;
  }

  /** Stop timers for an attempt that ended. */
  dispose(attemptId: string) {
    const rt = this.runtimes.get(attemptId);
    if (!rt) return;
    rt.timers.forEach((t) => clearTimeout(t));
    if (rt.ticker) clearInterval(rt.ticker);
    this.runtimes.delete(attemptId);
  }

  onModuleDestroy() {
    for (const id of [...this.runtimes.keys()]) this.dispose(id);
  }

  // ================================================================ pipeline

  private async runPipeline(rt: Runtime, containerId: string, run: PipelineRun) {
    // Commit the learner's work, so `git log` tells the true story.
    await this.sandbox.exec(containerId, ['git', 'add', '-A']);
    await this.sandbox.exec(containerId, [
      'git', '-c', 'user.name=You', '-c', 'user.email=you@prodlike.test', 'commit', '-q', '-m', run.message,
    ]); // prettier-ignore

    for (const [i, stage] of rt.def.pipeline.stages.entries()) {
      const view = run.stages[i];
      view.status = 'running';
      this.publish(rt);

      if (stage.run) {
        const r = await this.sandbox.exec(containerId, stage.run.split(/\s+/), { timeoutSec: 60 });
        const lines = r.output.split('\n').filter((l) => l.trim());
        for (const line of lines.slice(-MAX_LOG_LINES)) {
          this.bus.pipelineLog({ attemptId: rt.attemptId, stage: stage.id, line });
        }
        view.log = lines.slice(-MAX_LOG_LINES);
        if (r.exitCode !== 0) {
          view.status = 'failed';
          run.stages.slice(i + 1).forEach((s) => (s.status = 'skipped'));
          run.finishedAt = new Date().toISOString();
          rt.busy = false;
          await this.event(rt, 'pipeline.failed', { stage: stage.id, run: run.number });
          // A failed hotfix leaves the incident running; otherwise the pipeline is blocked.
          await this.setState(rt, run.hotfix ? 'INCIDENT_ACTIVE' : 'FAILED_PIPELINE');
          return;
        }
        view.status = 'passed';
        await this.event(rt, `pipeline.${stage.id}.passed`, { run: run.number });
        this.publish(rt);
        continue;
      }

      // Simulated deploy stage (FR-09): roll out, then a health check.
      view.log = [
        `Deploying ${run.release} with strategy=${run.strategy}${run.strategy === 'canary' ? ` (${rt.def.deploy.canaryPercent}% of traffic first)` : ''}`,
      ];
      await this.setNodes(rt, this.services(rt.def, 'deploying'));
      await this.sleep(rt, stage.simulatedSeconds * 1000);
      view.log.push('Health check: GET /health -> 200 OK', `${run.release} is live`);
      view.status = 'passed';
    }

    run.finishedAt = new Date().toISOString();
    rt.snap.previousRelease = rt.snap.release;
    rt.snap.release = run.release;
    rt.releaseCounter += 1;
    rt.strategy = run.strategy;
    await this.prisma.attempt.update({ where: { id: rt.attemptId }, data: { strategy: run.strategy } });
    await this.event(rt, `deploy.${run.strategy}`, { release: run.release });
    await this.event(rt, 'deploy.succeeded', { release: run.release, hotfix: run.hotfix });

    if (run.hotfix) {
      const fault = this.faultOf(rt);
      if (fault && (await this.fixedInWorkspace(fault, containerId))) {
        rt.busy = false;
        await this.setNodes(rt, this.allNodes(rt.def, 'healthy'));
        await this.resolve(rt, 'hotfix');
        return;
      }
      // The hotfix shipped but did not fix the cause: the incident carries on.
      rt.busy = false;
      if (fault) await this.applyFault(rt, fault);
      await this.setState(rt, 'INCIDENT_ACTIVE');
      return;
    }

    rt.busy = false;
    await this.setNodes(rt, this.allNodes(rt.def, 'healthy'));
    await this.setState(rt, 'DEPLOYED');
    await this.scheduleFaults(rt, containerId);
  }

  // ================================================================ faults

  /** After a successful deploy, arm each fault whose cause is still in the release (FR-10). */
  private async scheduleFaults(rt: Runtime, containerId: string) {
    // Same watch window whether or not a fault fires, so the UI never gives the incident away.
    const watchMs = Math.max(4, ...rt.def.faults.map((f) => f.trigger.delaySeconds)) * 1000 + 1000;
    rt.watchUntil = new Date(Date.now() + watchMs * this.scale()).toISOString();
    this.later(rt, watchMs, () => this.publish(rt));
    for (const fault of rt.def.faults) {
      if (await this.fixedInWorkspace(fault, containerId)) {
        await this.event(rt, 'fault.prevented', { faultId: fault.id });
        continue;
      }
      const delay = fault.trigger.delaySeconds * 1000;
      rt.pending = { faultId: fault.id, at: new Date(Date.now() + delay * this.scale()).toISOString() };
      await this.persist(rt);
      this.later(rt, delay, () => void this.trigger(rt, fault.id));
      return; // one incident at a time
    }
  }

  private async trigger(rt: Runtime, faultId: string) {
    if (rt.pending?.faultId !== faultId || rt.snap.state !== 'DEPLOYED') return;
    const fault = rt.def.faults.find((f) => f.id === faultId);
    if (!fault) return;
    rt.pending = null;
    rt.snap.timeToRecoverSeconds = null;
    const canary = rt.strategy === 'canary' && Boolean(fault.effect.canary);
    rt.snap.incident = {
      faultId,
      severity: fault.alert.severity,
      title: fault.alert.title,
      service: fault.alert.service,
      release: rt.snap.release,
      startedAt: new Date().toISOString(),
      impactPct: canary ? rt.def.deploy.canaryPercent : 100,
    };
    await this.applyFault(rt, fault);
    await this.prisma.attempt.update({ where: { id: rt.attemptId }, data: { incidentAt: new Date() } });
    await this.event(rt, 'incident.raised', { faultId, severity: fault.alert.severity, canary });
    await this.setState(rt, 'INCIDENT_ACTIVE');
  }

  private async applyFault(rt: Runtime, fault: Scenario['faults'][number]) {
    const canary = rt.strategy === 'canary' && fault.effect.canary;
    await this.setNodes(rt, {
      ...this.allNodes(rt.def, 'healthy'),
      ...(canary ? canary.nodes : fault.effect.nodes),
    });
  }

  private async resolve(rt: Runtime, by: 'rollback' | 'hotfix') {
    if (!rt.snap.incident) return;
    const now = new Date();
    rt.snap.incident = { ...rt.snap.incident, resolvedAt: now.toISOString(), resolvedBy: by };
    rt.snap.timeToRecoverSeconds = Math.round(
      (now.getTime() - Date.parse(rt.snap.incident.startedAt)) / 1000,
    );
    await this.prisma.attempt.update({ where: { id: rt.attemptId }, data: { recoveredAt: now } });
    await this.event(rt, `recovery.${by}`, { timeToRecoverSeconds: rt.snap.timeToRecoverSeconds });
    await this.event(rt, 'incident.resolved', { by, timeToRecoverSeconds: rt.snap.timeToRecoverSeconds });
    await this.setState(rt, 'RECOVERED');
  }

  /** A fault is "fixed" when the workspace matches one of its file-based resolutions. */
  private async fixedInWorkspace(fault: Scenario['faults'][number], containerId: string): Promise<boolean> {
    for (const r of fault.resolutions) {
      if (r.type !== 'file-matches-and-redeploy') continue;
      try {
        const content = await this.sandbox.readFile(containerId, r.file);
        if (new RegExp(r.pattern, 'm').test(content)) return true;
      } catch {
        // file missing: not fixed
      }
    }
    return false;
  }

  private faultOf(rt: Runtime) {
    return rt.def.faults.find((f) => f.id === rt.snap.incident?.faultId);
  }

  private clearPending(rt: Runtime) {
    rt.pending = null;
    rt.timers.forEach((t) => clearTimeout(t));
    rt.timers.clear();
  }

  // ================================================================ metrics

  private target(rt: Runtime): Metrics {
    const base = rt.def.baselineMetrics;
    if (rt.snap.state !== 'INCIDENT_ACTIVE') return base;
    const fault = this.faultOf(rt);
    if (!fault) return base;
    return rt.strategy === 'canary' && fault.effect.canary
      ? fault.effect.canary.metrics
      : fault.effect.metrics;
  }

  /** NFR-03: production metrics stream once per second; values glide towards their target. */
  private tick(rt: Runtime) {
    const t = this.target(rt);
    const jitter = (v: number, pct: number) => v * (1 + (Math.random() * 2 - 1) * pct);
    const step = (cur: number, goal: number) => cur + (goal - cur) * 0.6;
    rt.metrics = {
      errorRatePct: Math.max(0, +jitter(step(rt.metrics.errorRatePct, t.errorRatePct), 0.08).toFixed(2)),
      p95LatencyMs: Math.max(1, Math.round(jitter(step(rt.metrics.p95LatencyMs, t.p95LatencyMs), 0.06))),
      requestsPerSec: Math.max(
        0,
        Math.round(jitter(step(rt.metrics.requestsPerSec, t.requestsPerSec), 0.04)),
      ),
    };
    this.bus.metrics({ attemptId: rt.attemptId, at: new Date().toISOString(), ...rt.metrics });
  }

  // ================================================================ state helpers

  private async load(attempt: Attempt, def: Scenario): Promise<Runtime> {
    const existing = this.runtimes.get(attempt.id);
    if (existing) return existing;

    const stored = (attempt.snapshot as { engine?: Persisted } | null)?.engine;
    const rt: Runtime = {
      attemptId: attempt.id,
      def,
      metrics: { ...def.baselineMetrics },
      timers: new Set(),
      busy: false,
      ...(stored ?? {
        snap: {
          attemptId: attempt.id,
          state: attempt.state,
          release: def.releases.current,
          previousRelease: null,
          nodes: this.allNodes(def, 'healthy'),
          edges: def.architecture.edges,
          layout: def.architecture.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            kind: n.kind,
            x: n.position.x,
            y: n.position.y,
          })),
          pipeline: null,
          incident: null,
          timeToRecoverSeconds: null,
          canaryPercent: def.deploy.canaryPercent,
        },
        pending: null,
        watchUntil: null,
        strategy: null,
        releaseCounter: 0,
      }),
    };
    rt.snap.state = attempt.state;
    this.runtimes.set(attempt.id, rt);

    // Resume after an API restart.
    if (rt.snap.state === 'PIPELINE_RUNNING' || rt.snap.state === 'RECOVERING') {
      const run = rt.snap.pipeline;
      run?.stages.forEach((s) => {
        if (s.status === 'running' || s.status === 'waiting') s.status = 'skipped';
      });
      await this.setState(rt, rt.snap.state === 'RECOVERING' ? 'READY' : 'FAILED_PIPELINE');
    } else if (rt.pending && rt.snap.state === 'DEPLOYED') {
      const wait = Math.max(0, Date.parse(rt.pending.at) - Date.now()) / this.scale();
      const id = rt.pending.faultId;
      this.later(rt, wait, () => void this.trigger(rt, id));
    }
    rt.ticker = setInterval(() => this.tick(rt), 1000);
    rt.ticker.unref();
    return rt;
  }

  private view(rt: Runtime): EngineSnapshot {
    return { ...structuredClone(rt.snap), metrics: { ...rt.metrics }, canFinish: this.canFinish(rt) };
  }

  private canFinish(rt: Runtime): boolean {
    if (rt.snap.state === 'RECOVERED') return true;
    const watched = !rt.watchUntil || Date.now() >= Date.parse(rt.watchUntil);
    return rt.snap.state === 'DEPLOYED' && rt.pending === null && watched;
  }

  private publish(rt: Runtime) {
    this.bus.snapshot(this.view(rt));
  }

  private async setState(rt: Runtime, state: AttemptState) {
    rt.snap.state = state;
    await this.persist(rt, state);
    this.publish(rt);
  }

  private async setNodes(rt: Runtime, nodes: Record<string, NodeState>) {
    rt.snap.nodes = { ...rt.snap.nodes, ...nodes };
    this.publish(rt);
  }

  private async persist(rt: Runtime, state?: AttemptState) {
    const row = await this.prisma.attempt.findUnique({
      where: { id: rt.attemptId },
      select: { snapshot: true },
    });
    const engine: Persisted = {
      snap: rt.snap,
      pending: rt.pending,
      watchUntil: rt.watchUntil,
      strategy: rt.strategy,
      releaseCounter: rt.releaseCounter,
    };
    const snapshot = {
      ...((row?.snapshot as object | null) ?? {}),
      engine,
    } as unknown as Prisma.InputJsonValue;
    await this.prisma.attempt.update({
      where: { id: rt.attemptId },
      data: { snapshot, ...(state ? { state } : {}), lastActivityAt: new Date() },
    });
  }

  private async event(rt: Runtime, type: string, payload?: Record<string, unknown>) {
    await this.prisma.attemptEvent.create({
      data: { attemptId: rt.attemptId, type, payload: payload as Prisma.InputJsonValue | undefined },
    });
  }

  private allNodes(def: Scenario, state: NodeState): Record<string, NodeState> {
    return Object.fromEntries(def.architecture.nodes.map((n) => [n.id, state]));
  }

  /** The nodes a release rolls out to: our own services (not clients, databases or external APIs). */
  private services(def: Scenario, state: NodeState): Record<string, NodeState> {
    return Object.fromEntries(
      def.architecture.nodes.filter((n) => n.kind === 'service').map((n) => [n.id, state]),
    );
  }

  /** ENGINE_TIME_SCALE < 1 speeds the simulation up (tests); 1 = real time. */
  private scale() {
    return this.config.get('ENGINE_TIME_SCALE', { infer: true });
  }

  private later(rt: Runtime, ms: number, fn: () => void) {
    const t = setTimeout(() => {
      rt.timers.delete(t);
      fn();
    }, ms * this.scale());
    rt.timers.add(t);
  }

  private sleep(rt: Runtime, ms: number) {
    return new Promise<void>((resolve) => this.later(rt, ms, resolve));
  }
}
