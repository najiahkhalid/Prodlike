import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Attempt, AttemptState, Prisma } from '@prisma/client';
import type {
  AccessTokenClaims,
  AttemptView,
  CommandResult,
  Debrief,
  DeployInput,
  EngineSnapshot,
  HintResult,
  Scenario,
  TestRunResult,
  WorkspaceFile,
} from '@prodlike/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceSlug } from '@prodlike/shared';
import { ApiException, Errors } from '../common/api-exception';
import type { Env } from '../config/env';
import { EngineService } from '../engine/engine.service';
import { ScoringService } from '../scoring/scoring.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { PrismaService } from '../prisma/prisma.service';
import { decideCommand } from '../sandbox/command-policy';
import { safeWorkspacePath } from '../sandbox/path-policy';
import { SandboxService } from '../sandbox/sandbox.service';
import { ScenarioRegistry } from '../scenarios/scenario-registry.service';
import { parseJestJson } from './jest-results';

/** States in which an attempt still owns a sandbox. */
export const ACTIVE_STATES: AttemptState[] = [
  'PROVISIONING',
  'READY',
  'PIPELINE_RUNNING',
  'FAILED_PIPELINE',
  'DEPLOYED',
  'INCIDENT_ACTIVE',
  'RECOVERING',
  'RECOVERED',
];

/** Learner edits live in the database too, so a lost container never loses work (NFR-14). */
interface Snapshot {
  files: Record<string, string>;
}

const errBusy = () =>
  new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SANDBOX_BUSY',
    'All sandboxes are busy right now.',
    'Try again in about 30 seconds.',
  );
const errUnavailable = (detail: string) =>
  new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    'SANDBOX_UNAVAILABLE',
    `The sandbox could not start: ${detail}`,
    'Try again in a minute. If it keeps happening, tell the Prodlike team.',
  );

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);
  /** Last time a file.saved event was recorded per attempt+path (autosave fires often). */
  private readonly lastSaveEvent = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxService,
    private readonly registry: ScenarioRegistry,
    private readonly config: ConfigService<Env, true>,
    private readonly engine: EngineService,
    private readonly scoring: ScoringService,
    private readonly scenarios: ScenariosService,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  /** FR-05: start an attempt, or resume the learner's unfinished attempt at the same scenario. */
  async start(user: AccessTokenClaims, slug: string): Promise<AttemptView> {
    const scenarioRow = await this.prisma.scenario.findUnique({ where: { slug } });
    const def = this.registry.get(slug);
    if (!scenarioRow || !def || !(await this.scenarios.canAccess(user, scenarioRow))) {
      throw Errors.notFound('This scenario');
    }
    if (user.role === 'GUEST' && !scenarioRow.guestDemo) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'SIGN_UP_REQUIRED',
        'This scenario needs a free account.',
        'Create an account to keep going. Your demo result is kept.',
      );
    }

    const existing = await this.prisma.attempt.findFirst({
      where: {
        userId: user.sub,
        state: { in: ACTIVE_STATES },
        scenarioVersion: { scenarioId: scenarioRow.id },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) return this.view(await this.ensureSandbox(existing), def);

    const version = await this.prisma.scenarioVersion.findFirst({
      where: { scenarioId: scenarioRow.id },
      orderBy: { version: 'desc' },
    });
    if (!version) throw Errors.notFound('This scenario');

    await this.assertCapacity();
    // Count it towards the learner's assignment of this scenario, if any (earliest deadline first).
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        scenarioId: scenarioRow.id,
        cohort: { archivedAt: null, members: { some: { userId: user.sub } } },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const attempt = await this.prisma.attempt.create({
      data: {
        userId: user.sub,
        assignmentId: assignment?.id ?? null,
        scenarioVersionId: version.id,
        state: 'PROVISIONING',
        seed: Math.floor(Math.random() * 2 ** 31),
        snapshot: { files: {} } satisfies Snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.event(attempt.id, 'attempt.started', { scenario: slug, version: version.version });
    return this.view(await this.ensureSandbox(attempt), def);
  }

  async get(user: AccessTokenClaims, id: string): Promise<AttemptView> {
    const attempt = await this.owned(user, id);
    if (!ACTIVE_STATES.includes(attempt.state)) return this.view(attempt, await this.defOf(attempt), []);
    return this.view(await this.ensureSandbox(attempt), await this.defOf(attempt));
  }

  /** Learner gives up (or leaves): free the sandbox. */
  async end(user: AccessTokenClaims, id: string): Promise<{ state: AttemptState }> {
    const attempt = await this.owned(user, id);
    if (ACTIVE_STATES.includes(attempt.state)) await this.abandon(attempt, 'learner-ended');
    return { state: 'ABANDONED' };
  }

  // ---------------------------------------------------------------- files

  async readFile(
    user: AccessTokenClaims,
    id: string,
    rawPath: string,
  ): Promise<{ path: string; content: string }> {
    const attempt = await this.active(user, id);
    const path = this.path(rawPath);
    const container = (await this.ensureSandbox(attempt)).containerId!;
    return { path, content: await this.sandbox.readFile(container, path) };
  }

  async saveFile(
    user: AccessTokenClaims,
    id: string,
    rawPath: string,
    content: string,
  ): Promise<WorkspaceFile> {
    const attempt = await this.active(user, id);
    const def = await this.defOf(attempt);
    const path = this.path(rawPath);
    if (def.workspace.readOnly.includes(path)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FILE_READ_ONLY',
        `${path} is read-only in this scenario.`,
        'Make your change in another file.',
      );
    }
    const ready = await this.ensureSandbox(attempt);
    await this.sandbox.writeFile(ready.containerId!, path, content);

    // Merge into the stored snapshot: it also holds the engine state, which must survive.
    const fresh = await this.prisma.attempt.findUniqueOrThrow({ where: { id }, select: { snapshot: true } });
    const stored = (fresh.snapshot ?? {}) as { files?: Record<string, string> };
    const merged = { ...stored, files: { ...(stored.files ?? {}), [path]: content } };
    await this.prisma.attempt.update({
      where: { id },
      data: { snapshot: merged as unknown as Prisma.InputJsonValue, lastActivityAt: new Date() },
    });

    const key = `${id}:${path}`;
    if (Date.now() - (this.lastSaveEvent.get(key) ?? 0) > 30_000) {
      this.lastSaveEvent.set(key, Date.now());
      await this.event(id, 'file.saved', { path });
    }
    return { path, readOnly: false, modified: content !== this.templateContent(sourceSlug(def), path) };
  }

  // ---------------------------------------------------------------- terminal + tests

  /** FR-06: one line from the terminal, checked against the scenario allowlist, run without a shell. */
  async command(user: AccessTokenClaims, id: string, line: string): Promise<CommandResult> {
    const attempt = await this.active(user, id);
    const def = await this.defOf(attempt);
    const decision = decideCommand(
      line,
      def.terminal.allow.map((a) => a.command),
    );

    if (decision.kind === 'denied') {
      await this.event(id, 'terminal.denied', { line });
      const allowed = def.terminal.allow.map((a) => a.command).join(', ');
      return this.result(line, false, null, `${decision.reason}\nAllowed commands: ${allowed}\n`, 0);
    }
    if (decision.kind === 'engine') {
      const started = Date.now();
      const output =
        decision.name === 'rollback'
          ? (await this.engine.rollback(attempt, def)).output
          : await this.engine.logs(attempt, def, decision.args);
      await this.touch(id);
      return this.result(line, true, 0, output, Date.now() - started);
    }

    const ready = await this.ensureSandbox(attempt);
    const r = await this.sandbox.exec(ready.containerId!, decision.argv, { timeoutSec: 30 });
    await this.touch(id);
    await this.event(id, `terminal.${decision.argv.slice(0, 2).join('-')}`, { line, exitCode: r.exitCode });
    const note = r.timedOut ? '\n[stopped: commands are limited to 30 seconds]\n' : '';
    return { ...this.result(line, true, r.exitCode, r.output + note, r.durationMs), truncated: r.truncated };
  }

  /** FR-07: run the scenario's test suite and return structured results. */
  async runTests(user: AccessTokenClaims, id: string): Promise<TestRunResult> {
    const attempt = await this.active(user, id);
    const ready = await this.ensureSandbox(attempt);
    const container = ready.containerId!;
    const results = '/tmp/prodlike-jest.json';

    await this.sandbox.exec(container, ['rm', '-f', results]);
    const run = await this.sandbox.exec(
      container,
      ['npm', 'test', '--', '--json', `--outputFile=${results}`],
      {
        timeoutSec: 30,
      },
    );
    const json = await this.sandbox.exec(container, ['cat', results]);
    await this.touch(id);

    let parsed: ReturnType<typeof parseJestJson>;
    try {
      parsed = parseJestJson(json.output);
    } catch {
      // The suite did not even start (syntax error, timeout): report it as one failure.
      parsed = {
        passed: 0,
        failed: 1,
        total: 1,
        cases: [
          {
            name: run.timedOut ? 'Test run timed out after 30 seconds' : 'Test suite could not run',
            file: '',
            status: 'failed',
            failure: run.output.replace(/\x1b\[[0-9;]*m/g, '').slice(-1500), // eslint-disable-line no-control-regex
          },
        ],
      };
    }
    await this.event(id, 'tests.run', { passed: parsed.passed, failed: parsed.failed, total: parsed.total });
    if (parsed.failed === 0 && parsed.total > 0)
      await this.event(id, 'tests.passed', { total: parsed.total });
    return { ...parsed, durationMs: run.durationMs, output: run.output };
  }

  // ---------------------------------------------------------------- engine (Phase 3)

  /** FR-08/09: commit, run the CI/CD pipeline and deploy. Progress streams over the socket. */
  async deploy(user: AccessTokenClaims, id: string, input: DeployInput): Promise<EngineSnapshot> {
    const attempt = await this.active(user, id);
    const def = await this.defOf(attempt);
    const ready = await this.ensureSandbox(attempt);
    return this.engine.deploy(ready, def, ready.containerId!, input);
  }

  /** FR-11: roll production back (same as the `rollback` terminal command). */
  async rollback(user: AccessTokenClaims, id: string): Promise<{ output: string; snapshot: EngineSnapshot }> {
    const attempt = await this.active(user, id);
    return this.engine.rollback(attempt, await this.defOf(attempt));
  }

  /**
   * Finish once production is healthy: run the hidden checks, score the rubric (FR-14), build the
   * debrief (FR-15), award badges, then free the sandbox.
   */
  async finish(user: AccessTokenClaims, id: string): Promise<Debrief> {
    const attempt = await this.active(user, id);
    const def = await this.defOf(attempt);
    const engine = await this.engine.snapshot(attempt, def);
    if (!engine.canFinish) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'NOT_FINISHED',
        'This scenario is not finished yet.',
        'Ship your change and make sure production is healthy, then finish.',
      );
    }
    const ready = await this.ensureSandbox(attempt);
    const facts = await this.scoring.collectFacts(id, def, ready.containerId!, engine);
    await this.engine.finish(ready, def);
    const completed = await this.prisma.attempt.findUniqueOrThrow({ where: { id } });
    const debrief = await this.scoring.finalize(completed, def, facts, engine);
    await this.sandbox.destroy(ready.containerId);
    await this.prisma.attempt.update({ where: { id }, data: { containerId: null } });
    return debrief;
  }

  /** The stored debrief of a completed attempt (FR-15). */
  async debrief(user: AccessTokenClaims, id: string): Promise<Debrief> {
    const attempt = await this.owned(user, id);
    const stored = (attempt.snapshot as { debrief?: Debrief } | null)?.debrief;
    if (attempt.state !== 'COMPLETED' || !stored) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'NO_DEBRIEF_YET',
        'The debrief is ready once you finish the attempt.',
        'Go back to the workspace and finish the scenario.',
      );
    }
    return stored;
  }

  /**
   * A2 refinement 3: a context-aware hint, each costing `hintPenalty` points. The hint offered
   * depends on where the learner is: before the tests pass, before deploying, or during the incident.
   */
  async useHint(user: AccessTokenClaims, id: string): Promise<HintResult> {
    const attempt = await this.active(user, id);
    const def = await this.defOf(attempt);
    const used = await this.prisma.hintUsage.findMany({ where: { attemptId: id }, orderBy: { at: 'asc' } });
    const usedIdx = new Set(used.map((h) => h.hintIndex));
    const types = new Set(
      (await this.prisma.attemptEvent.findMany({ where: { attemptId: id }, select: { type: true } })).map(
        (e) => e.type,
      ),
    );
    const phase =
      attempt.state === 'INCIDENT_ACTIVE'
        ? 'incident-active'
        : types.has('deploy.succeeded')
          ? 'after-deploy'
          : types.has('tests.passed')
            ? 'before-deploy'
            : 'before-tests-pass';
    const open = def.hints.map((h, index) => ({ ...h, index })).filter((h) => !usedIdx.has(h.index));
    // Prefer a hint written for this exact step; otherwise one for the next step (never an
    // incident hint before there is an incident), otherwise a general one.
    const ahead: Record<string, string[]> = {
      'before-tests-pass': ['before-tests-pass', 'before-deploy'],
      'before-deploy': ['before-deploy'],
      'after-deploy': [],
      'incident-active': ['incident-active'],
    };
    const hint =
      open.find((h) => h.when === phase) ??
      open.find((h) => ahead[phase].includes(h.when)) ??
      open.find((h) => h.when === 'any');
    if (!hint) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'NO_MORE_HINTS',
        'There are no more hints for this step.',
        'Re-read the brief and the logs: you have what you need.',
      );
    }
    await this.prisma.hintUsage.create({
      data: { attemptId: id, hintIndex: hint.index, penalty: def.hintPenalty },
    });
    await this.event(id, 'hint.used', { index: hint.index, penalty: def.hintPenalty, phase });
    await this.touch(id);
    return {
      index: hint.index,
      text: hint.text,
      penalty: def.hintPenalty,
      used: used.length + 1,
      remaining: def.hints.length - used.length - 1,
    };
  }

  /** Used by the socket gateway when a browser joins an attempt's live channel. */
  async liveSnapshot(user: AccessTokenClaims, id: string): Promise<EngineSnapshot> {
    const attempt = await this.owned(user, id);
    return this.engine.snapshot(attempt, await this.defOf(attempt));
  }

  // ---------------------------------------------------------------- sandbox management

  /**
   * Make sure the attempt has a running container. If it was lost (API restart, reaper, Docker
   * restart) a fresh one is claimed and the learner's saved files are written back (NFR-14).
   */
  private async ensureSandbox(attempt: Attempt): Promise<Attempt & { provisionedInMs?: number }> {
    if (attempt.containerId && (await this.sandbox.isRunning(attempt.containerId))) return attempt;

    const def = await this.defOf(attempt);
    if (!attempt.containerId) await this.assertCapacity(attempt.id);
    const started = Date.now();
    let containerId: string;
    try {
      if (!(await this.sandbox.available())) throw new Error('Docker is not running on the server.');
      if (!(await this.sandbox.imageExists(sourceSlug(def)))) {
        throw new Error(`the image for "${sourceSlug(def)}" has not been built (run pnpm scenarios:build).`);
      }
      containerId = await this.sandbox.claim(sourceSlug(def));
    } catch (e) {
      this.logger.error(`Provisioning failed for attempt ${attempt.id}: ${(e as Error).message}`);
      throw errUnavailable((e as Error).message);
    }

    const restored = Object.entries(this.snapshotOf(attempt).files);
    for (const [path, content] of restored) await this.sandbox.writeFile(containerId, path, content);

    await this.sandbox.destroy(attempt.containerId);
    const ms = Date.now() - started;
    const updated = await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        containerId,
        state: attempt.state === 'PROVISIONING' ? 'READY' : attempt.state,
        lastActivityAt: new Date(),
      },
    });
    await this.event(attempt.id, 'sandbox.ready', { ms, restoredFiles: restored.length });
    this.logger.log(
      `Sandbox ready for attempt ${attempt.id} in ${ms} ms (restored ${restored.length} files)`,
    );
    return { ...updated, provisionedInMs: ms };
  }

  private async assertCapacity(excludeAttemptId?: string) {
    const max = this.config.get('SANDBOX_MAX_ACTIVE', { infer: true });
    const running = await this.prisma.attempt.count({
      where: { state: { in: ACTIVE_STATES }, containerId: { not: null }, id: { not: excludeAttemptId } },
    });
    if (running >= max) throw errBusy();
  }

  async abandon(attempt: Attempt, reason: string) {
    this.engine.dispose(attempt.id);
    await this.sandbox.destroy(attempt.containerId);
    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: { state: 'ABANDONED', endedAt: new Date(), containerId: null },
    });
    await this.event(attempt.id, 'attempt.abandoned', { reason });
  }

  // ---------------------------------------------------------------- helpers

  private async view(
    attempt: Attempt & { provisionedInMs?: number },
    def: Scenario,
    files?: string[],
  ): Promise<AttemptView> {
    const paths = files ?? (attempt.containerId ? await this.sandbox.listFiles(attempt.containerId) : []);
    const snapshot = this.snapshotOf(attempt);
    const events = await this.prisma.attemptEvent.findMany({
      where: {
        attemptId: attempt.id,
        type: {
          in: ['file.saved', 'tests.passed', 'sandbox.ready', 'deploy.succeeded', 'incident.resolved'],
        },
      },
      select: { type: true, payload: true },
      orderBy: { at: 'desc' },
    });
    const lastReady = events.find((e) => e.type === 'sandbox.ready')?.payload as { ms?: number } | undefined;
    return {
      id: attempt.id,
      state: attempt.state,
      startedAt: attempt.startedAt.toISOString(),
      scenario: {
        slug: def.slug,
        title: def.title,
        ticketId: def.brief.ticketId,
        ticketTitle: def.brief.title,
        company: def.company.name,
        entryFile: def.workspace.entryFile,
        terminalCommands: def.terminal.allow,
      },
      files: paths.map((path) => ({
        path,
        readOnly: def.workspace.readOnly.includes(path),
        modified:
          path in snapshot.files && snapshot.files[path] !== this.templateContent(sourceSlug(def), path),
      })),
      progress: {
        changed: events.some((e) => e.type === 'file.saved'),
        testsPassed: events.some((e) => e.type === 'tests.passed'),
        deployed: events.some((e) => e.type === 'deploy.succeeded'),
        recovered: events.some((e) => e.type === 'incident.resolved'),
      },
      engine: await this.engine.snapshot(attempt, def),
      hints: await this.hintsOf(attempt.id, def),
      guest:
        (await this.prisma.user.findUnique({ where: { id: attempt.userId }, select: { role: true } }))
          ?.role === 'GUEST',
      ...((attempt.provisionedInMs ?? lastReady?.ms) !== undefined
        ? { provisionedInMs: attempt.provisionedInMs ?? lastReady?.ms }
        : {}),
    };
  }

  private async hintsOf(attemptId: string, def: Scenario): Promise<AttemptView['hints']> {
    const used = await this.prisma.hintUsage.findMany({ where: { attemptId }, orderBy: { at: 'asc' } });
    return {
      used: used.map((h) => ({ index: h.hintIndex, text: def.hints[h.hintIndex]?.text ?? '' })),
      remaining: Math.max(0, def.hints.length - used.length),
      penalty: def.hintPenalty,
    };
  }

  /** Only the owner can see an attempt; others get "not found" so ids reveal nothing. */
  private async owned(user: AccessTokenClaims, id: string): Promise<Attempt> {
    const attempt = await this.prisma.attempt.findUnique({ where: { id } });
    if (!attempt || attempt.userId !== user.sub) throw Errors.notFound('This attempt');
    return attempt;
  }

  private async active(user: AccessTokenClaims, id: string): Promise<Attempt> {
    const attempt = await this.owned(user, id);
    if (!ACTIVE_STATES.includes(attempt.state)) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ATTEMPT_ENDED',
        'This attempt has ended.',
        'Start a new attempt from the scenario brief.',
      );
    }
    return attempt;
  }

  /** scenarioVersionId -> definition (versions are immutable, so this never goes stale). */
  private readonly defByVersion = new Map<string, Scenario>();

  /**
   * The scenario definition an attempt runs, pinned to the version it started on: editing a
   * scenario never changes the rules of an attempt already in progress.
   */
  private async defOf(attempt: Attempt): Promise<Scenario> {
    const cached = this.defByVersion.get(attempt.scenarioVersionId);
    if (cached) return cached;
    const v = await this.prisma.scenarioVersion.findUnique({ where: { id: attempt.scenarioVersionId } });
    if (!v) throw Errors.notFound('This scenario');
    const def = v.definition as unknown as Scenario;
    this.defByVersion.set(attempt.scenarioVersionId, def);
    return def;
  }

  private snapshotOf(attempt: Attempt): Snapshot {
    const s = attempt.snapshot as unknown as Snapshot | null;
    return { files: { ...(s?.files ?? {}) } };
  }

  private templateContent(slug: string, path: string): string | undefined {
    const file = join(this.config.get('SCENARIOS_DIR', { infer: true }), slug, 'template', path);
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  }

  private path(raw: string): string {
    const path = safeWorkspacePath(raw);
    if (!path) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PATH_NOT_ALLOWED',
        'That file path is not allowed.',
        'Pick a file from the explorer.',
      );
    }
    return path;
  }

  private result(
    line: string,
    allowed: boolean,
    exitCode: number | null,
    output: string,
    durationMs: number,
  ) {
    return { line, allowed, exitCode, output, durationMs, truncated: false };
  }

  private async touch(id: string) {
    await this.prisma.attempt.update({ where: { id }, data: { lastActivityAt: new Date() } });
  }

  async event(attemptId: string, type: string, payload?: Record<string, unknown>) {
    await this.prisma.attemptEvent.create({
      data: { attemptId, type, payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  }
}
