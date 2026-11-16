import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { pack } from 'tar-stream';
import { ApiException } from '../common/api-exception';
import type { Env } from '../config/env';

const MB = 1024 * 1024;
export const SANDBOX_LABEL = 'prodlike.sandbox';
export const WORKDIR = '/workspace';

export interface ExecResult {
  exitCode: number | null;
  output: string;
  truncated: boolean;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Creates and drives one isolated container per attempt (FR-05, NFR-10, ADR-005).
 * Nothing here interprets learner input: callers pass an argv already checked by the
 * command policy, and every command runs without a shell.
 */
@Injectable()
export class SandboxService implements OnModuleDestroy {
  private readonly logger = new Logger(SandboxService.name);
  readonly docker: Docker;
  /** Pre-started containers per scenario, ready to hand out (NFR-02). */
  private readonly pool = new Map<string, string[]>();
  private readonly refilling = new Set<string>();

  constructor(private readonly config: ConfigService<Env, true>) {
    // Default: /var/run/docker.sock on Linux/macOS, //./pipe/docker_engine on Windows (or DOCKER_HOST).
    this.docker = new Docker();
  }

  imageFor(slug: string) {
    return `${this.config.get('SANDBOX_IMAGE_PREFIX', { infer: true })}${slug}:latest`;
  }

  async available(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async imageExists(slug: string): Promise<boolean> {
    try {
      await this.docker.getImage(this.imageFor(slug)).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /** Create + start a locked-down container for a scenario. */
  async create(slug: string): Promise<string> {
    const container = await this.docker.createContainer({
      Image: this.imageFor(slug),
      Cmd: ['sleep', 'infinity'],
      User: 'node',
      WorkingDir: WORKDIR,
      Env: [
        'HOME=/tmp',
        'CI=true',
        'FORCE_COLOR=1',
        'NODE_ENV=development',
        'npm_config_update_notifier=false',
      ],
      Labels: { [SANDBOX_LABEL]: '1', 'prodlike.scenario': slug },
      // Anonymous volume: Docker copies the image's /workspace into it, and it is the ONLY writable path.
      Volumes: { [WORKDIR]: {} },
      HostConfig: {
        NetworkMode: 'none',
        Memory: 512 * MB,
        MemorySwap: 512 * MB,
        NanoCpus: 1_000_000_000,
        PidsLimit: 128,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        ReadonlyRootfs: true,
        Tmpfs: { '/tmp': 'rw,exec,nosuid,size=128m' },
      },
    });
    await container.start();
    return container.id;
  }

  /** Take a warm container if one is ready, otherwise create one. Refills the pool in the background. */
  async claim(slug: string): Promise<string> {
    const ready = this.pool.get(slug) ?? [];
    let id: string | undefined;
    while (!id && ready.length) {
      const candidate = ready.shift()!;
      if (await this.isRunning(candidate)) id = candidate;
    }
    void this.refill(slug);
    return id ?? (await this.create(slug));
  }

  async refill(slug: string): Promise<void> {
    const size = this.config.get('SANDBOX_POOL_SIZE', { infer: true });
    if (size <= 0 || this.refilling.has(slug)) return;
    this.refilling.add(slug);
    try {
      const ready = this.pool.get(slug) ?? [];
      this.pool.set(slug, ready);
      while (ready.length < size) ready.push(await this.create(slug));
    } catch (e) {
      this.logger.warn(`Could not warm sandbox pool for ${slug}: ${(e as Error).message}`);
    } finally {
      this.refilling.delete(slug);
    }
  }

  /** Warm containers ready per sandbox image (admin sandbox health, FR-20). */
  poolSizes(): Record<string, number> {
    return Object.fromEntries([...this.pool.entries()].map(([slug, ids]) => [slug, ids.length]));
  }

  pooledIds(): Set<string> {
    return new Set([...this.pool.values()].flat());
  }

  async isRunning(id: string): Promise<boolean> {
    try {
      return (await this.docker.getContainer(id).inspect()).State.Running;
    } catch {
      return false;
    }
  }

  async destroy(id: string | null | undefined): Promise<void> {
    if (!id) return;
    try {
      await this.docker.getContainer(id).remove({ force: true, v: true });
    } catch {
      // already gone
    }
  }

  /** All sandbox containers on this Docker host (for reconciliation after a restart). */
  async listAll(): Promise<string[]> {
    const list = await this.docker.listContainers({ all: true, filters: { label: [`${SANDBOX_LABEL}=1`] } });
    return list.map((c) => c.Id);
  }

  /**
   * Run argv (no shell) inside the container with a hard time limit and output cap.
   * `timeout -s KILL` guarantees a runaway process (e.g. an infinite loop in learner code) dies.
   */
  async exec(
    id: string,
    argv: string[],
    opts: { timeoutSec?: number; maxBytes?: number } = {},
  ): Promise<ExecResult> {
    const timeoutSec = opts.timeoutSec ?? 30;
    const maxBytes = opts.maxBytes ?? 200_000;
    const started = Date.now();
    const exec = await this.docker.getContainer(id).exec({
      Cmd: ['timeout', '-s', 'KILL', String(timeoutSec), ...argv],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: WORKDIR,
      User: 'node',
    });
    const stream = await exec.start({ hijack: true, stdin: false });

    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const sink = new PassThrough();
    sink.on('data', (c: Buffer) => {
      if (size >= maxBytes) {
        truncated = true;
        return;
      }
      chunks.push(c.subarray(0, maxBytes - size));
      size += c.length;
      if (size > maxBytes) truncated = true;
    });
    this.docker.modem.demuxStream(stream, sink, sink);

    await new Promise<void>((resolve) => {
      const guard = setTimeout(
        () => {
          stream.destroy();
          resolve();
        },
        (timeoutSec + 5) * 1000,
      );
      stream.on('end', () => {
        clearTimeout(guard);
        resolve();
      });
      stream.on('error', () => {
        clearTimeout(guard);
        resolve();
      });
    });

    const info = await exec.inspect();
    const exitCode = info.ExitCode ?? null;
    return {
      exitCode,
      output: Buffer.concat(chunks).toString('utf8'),
      truncated,
      durationMs: Date.now() - started,
      timedOut: exitCode === 137 && Date.now() - started >= timeoutSec * 1000,
    };
  }

  async listFiles(id: string): Promise<string[]> {
    const r = await this.exec(id, [
      'find', '.',
      '-path', './node_modules', '-prune', '-o',
      '-path', './.git', '-prune', '-o',
      '-path', './.hidden-tests', '-prune', '-o',
      '-type', 'f', '-not', '-name', 'package-lock.json', '-print',
    ]); // prettier-ignore
    return r.output
      .split('\n')
      .map((l) => l.trim().replace(/^\.\//, ''))
      .filter(Boolean)
      .sort();
  }

  async readFile(id: string, path: string): Promise<string> {
    const r = await this.exec(id, ['cat', '--', path], { maxBytes: 200_000 });
    if (r.exitCode !== 0) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'FILE_NOT_FOUND',
        `${path} does not exist.`,
        'Pick a file from the explorer.',
      );
    }
    return r.output;
  }

  /** Write one file into /workspace (owned by the sandbox user). */
  async writeFile(id: string, path: string, content: string): Promise<void> {
    const tar = pack();
    tar.entry({ name: path, mode: 0o644, uid: 1000, gid: 1000, mtime: new Date() }, content);
    tar.finalize();
    await this.docker.getContainer(id).putArchive(tar, { path: WORKDIR });
  }

  async onModuleDestroy() {
    // Warm containers are cheap to recreate; do not leave them running after shutdown.
    await Promise.all([...this.pooledIds()].map((cid) => this.destroy(cid)));
  }
}
