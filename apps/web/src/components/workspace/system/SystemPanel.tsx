'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { EngineSnapshot, Metrics, PipelineLogPayload } from '@prodlike/shared';
import { Ansi } from '../panels';
import { Map2D } from './Map2D';
import { STATE_STYLE, hasWebGL } from './states';

// Three.js is large: load it only in the browser, only when the 3D map is shown.
const Map3D = dynamic(() => import('./Map3D'), {
  ssr: false,
  loading: () => <p className="p-4 text-xs text-console-muted">Loading 3D map…</p>,
});

type Tab = 'map' | 'pipeline' | 'incidents';

function Sparkline({ values, max, colour }: { values: number[]; max: number; colour: string }) {
  if (values.length < 2) return <svg className="mt-1 h-7 w-full" aria-hidden="true" />;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - Math.min(v / max, 1) * 26}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-1 h-7 w-full" aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={colour}
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MetricTiles({ history }: { history: Metrics[] }) {
  const cur = history[history.length - 1];
  const errBad = cur.errorRatePct > 2;
  const latBad = cur.p95LatencyMs > 600;
  return (
    <div role="group" className="mt-3 grid grid-cols-3 gap-2" aria-label="Production metrics">
      <div className="rounded-lg bg-console-raised p-2.5">
        <div className="text-[11px] text-console-muted">Error rate (5xx)</div>
        <div
          className={`font-mono text-lg font-semibold ${errBad ? 'text-bad-dark' : 'text-white'}`}
          data-metric="error-rate"
        >
          {cur.errorRatePct.toFixed(1)}%{errBad && <span className="sr-only"> (above threshold)</span>}
        </div>
        <Sparkline
          values={history.map((h) => h.errorRatePct)}
          max={45}
          colour={errBad ? '#F87171' : '#22C55E'}
        />
      </div>
      <div className="rounded-lg bg-console-raised p-2.5">
        <div className="text-[11px] text-console-muted">p95 latency</div>
        <div className={`font-mono text-lg font-semibold ${latBad ? 'text-bad-dark' : 'text-white'}`}>
          {Math.round(cur.p95LatencyMs)}ms
        </div>
        <Sparkline
          values={history.map((h) => h.p95LatencyMs)}
          max={1400}
          colour={latBad ? '#F87171' : '#22D3EE'}
        />
      </div>
      <div className="rounded-lg bg-console-raised p-2.5">
        <div className="text-[11px] text-console-muted">Requests / s</div>
        <div className="font-mono text-lg font-semibold text-white">{Math.round(cur.requestsPerSec)}</div>
        <Sparkline values={history.map((h) => h.requestsPerSec)} max={300} colour="#A5B4FC" />
      </div>
    </div>
  );
}

const STAGE_STYLE = {
  waiting: 'border-t-slate-600 text-console-muted',
  running: 'border-t-accent-live text-accent-live',
  passed: 'border-t-ok-dark text-ok-dark',
  failed: 'border-t-bad-dark text-bad-dark',
  skipped: 'border-t-slate-700 text-slate-500',
} as const;
const STAGE_LABEL = {
  waiting: 'waiting',
  running: '⟳ running…',
  passed: '✓ passed',
  failed: '✕ failed',
  skipped: '– skipped',
};

function PipelinePanel({ engine, live }: { engine: EngineSnapshot; live: PipelineLogPayload[] }) {
  const run = engine.pipeline;
  if (!run) {
    return (
      <p className="p-6 text-center text-console-muted">
        No pipeline runs yet. Use <b className="text-console-text">Commit &amp; Deploy</b> to ship your
        change.
      </p>
    );
  }
  const lines = live.length
    ? live.map((l) => `[${l.stage}] ${l.line}`)
    : run.stages.flatMap((s) => s.log.map((l) => `[${s.id}] ${l}`));
  return (
    <div className="flex h-full flex-col">
      <p className="mb-2 font-mono text-xs text-console-muted">
        <span className="text-accent-live">▶ pipeline #{run.number}</span> · {run.release} · {run.strategy}
        {run.hotfix && <span className="text-warn-dark"> · hotfix</span>} · “{run.message}”
      </p>
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Pipeline stages">
        {run.stages.map((s) => (
          <li
            key={s.id}
            className={`rounded-lg border-t-[3px] bg-console-raised p-2 ${STAGE_STYLE[s.status]}`}
            data-stage={s.id}
            data-status={s.status}
          >
            <div className="text-[13px] font-semibold text-white">{s.name}</div>
            <div className="mt-0.5 text-[11px]">{STAGE_LABEL[s.status]}</div>
          </li>
        ))}
      </ol>
      <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 font-mono text-[11.5px] leading-relaxed text-slate-400">
        {lines.slice(-120).map((l, i) => (
          <div key={i}>
            <Ansi text={l} />
          </div>
        ))}
      </pre>
    </div>
  );
}

function IncidentsPanel({
  engine,
  onLogs,
  onRollback,
  busy,
}: {
  engine: EngineSnapshot;
  onLogs: (service: string) => void;
  onRollback: () => void;
  busy: boolean;
}) {
  const inc = engine.incident;
  if (!inc) {
    return (
      <p className="p-6 text-center text-console-muted">
        ✓ No incidents. Alerts appear here if something goes wrong in production.
      </p>
    );
  }
  if (inc.resolvedAt) {
    return (
      <div role="status" className="rounded-xl border border-ok-dark/40 bg-ok-dark/10 p-4">
        <div className="font-mono text-[11px] font-semibold text-ok-dark">
          RESOLVED ·{' '}
          {inc.resolvedBy === 'rollback' ? `rollback to ${engine.release}` : `hotfix ${engine.release}`}
        </div>
        <h3 className="mt-1 text-[15px] font-semibold text-white">
          Service restored in {engine.timeToRecoverSeconds}s
        </h3>
        <p className="mt-1 font-mono text-xs text-console-muted">
          {inc.title} · started on {inc.release}
        </p>
        {inc.resolvedBy === 'rollback' && (
          <p className="mt-2 text-xs text-warn-dark">
            Note: the rollback also removed your own fix from production. It will need shipping again.
          </p>
        )}
      </div>
    );
  }
  const warn = inc.impactPct < 100;
  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 ${warn ? 'border-warn-dark/45 bg-warn-dark/10' : 'border-bad-dark/45 bg-bad/10'}`}
    >
      <div className={`font-mono text-[11px] font-semibold ${warn ? 'text-warn-dark' : 'text-bad-dark'}`}>
        {inc.severity} · {warn ? 'DEGRADED' : 'OUTAGE'} · since {new Date(inc.startedAt).toLocaleTimeString()}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold text-white">{inc.title}</h3>
      <dl className="mt-2 font-mono text-xs leading-6 text-console-muted">
        <div>
          Release: <b className="text-console-text">{inc.release}</b> (deployed just before the alert)
        </div>
        <div>
          Error rate: <b className="text-console-text">{engine.metrics.errorRatePct.toFixed(1)}%</b>{' '}
          (threshold 2%)
        </div>
        <div>
          Customer impact:{' '}
          <b className="text-console-text">
            {inc.impactPct === 100 ? 'all traffic' : `${inc.impactPct}% (canary)`}
          </b>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="ws-btn" onClick={() => onLogs(inc.service)}>
          View logs
        </button>
        <button
          type="button"
          className="ws-btn border-red-700 bg-red-700 text-white"
          onClick={onRollback}
          disabled={busy || !engine.previousRelease}
        >
          ⟲ Roll back to {engine.previousRelease ?? 'previous'}
        </button>
      </div>
      <p className="mt-3 text-xs text-console-muted">
        Investigate first (logs, <code className="font-mono">git log</code>), then restore service: roll back,
        or ship a hotfix with Commit &amp; Deploy.
      </p>
    </div>
  );
}

/** Zone 3 of the workspace: System Map · Pipeline · Incidents (FR-08..12). */
export function SystemPanel({
  engine,
  history,
  pipelineLog,
  connected,
  onLogs,
  onRollback,
  busy,
}: {
  engine: EngineSnapshot;
  history: Metrics[];
  pipelineLog: PipelineLogPayload[];
  connected: boolean;
  onLogs: (service: string) => void;
  onRollback: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<Tab>('map');
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [webgl, setWebgl] = useState(true);
  const openIncident = engine.incident && !engine.incident.resolvedAt;

  useEffect(() => {
    const ok = hasWebGL();
    setWebgl(ok);
    if (!ok) setView('2d');
    try {
      const saved = localStorage.getItem('prodlike.mapView');
      if (ok && (saved === '2d' || saved === '3d')) setView(saved);
    } catch {
      // storage blocked: keep the default
    }
  }, []);

  // Jump to the relevant tab when something happens.
  useEffect(() => {
    if (engine.state === 'PIPELINE_RUNNING' || engine.state === 'FAILED_PIPELINE') setTab('pipeline');
  }, [engine.state, engine.pipeline?.number]);
  useEffect(() => {
    if (openIncident) setTab('incidents');
  }, [openIncident]);

  const chooseView = (v: '3d' | '2d') => {
    setView(v);
    try {
      localStorage.setItem('prodlike.mapView', v);
    } catch {
      // ignore
    }
  };

  const unhealthy = Object.values(engine.nodes).some((s) => s === 'down' || s === 'degraded');
  return (
    <>
      <div className="flex h-[38px] items-center gap-1 border-b border-console-raised px-2 text-[13px]">
        <div role="tablist" aria-label="System" className="flex items-center gap-1">
          {(
            [
              ['map', 'System Map'],
              ['pipeline', 'Pipeline'],
              ['incidents', 'Incidents'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 ${tab === id ? 'border-accent-live text-white' : 'border-transparent text-console-muted hover:text-console-text'}`}
            >
              {label}
              {id === 'incidents' && openIncident && (
                <span
                  className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white"
                  role="img"
                  aria-label="1 open incident"
                >
                  1
                </span>
              )}
            </button>
          ))}
        </div>
        <span
          role="img"
          className={`ml-auto h-2 w-2 rounded-full ${connected ? 'bg-ok-dark' : 'bg-warn-dark'}`}
          title={connected ? 'Live' : 'Reconnecting… (updates every 2 s)'}
          aria-label={connected ? 'Live updates connected' : 'Live updates reconnecting'}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        {tab === 'map' && (
          <>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs text-console-muted">
                production ·{' '}
                <span className="font-mono" data-testid="release">
                  {engine.release}
                </span>{' '}
                <span className={unhealthy ? STATE_STYLE.down.text : STATE_STYLE.healthy.text}>
                  {unhealthy ? '✕ unhealthy' : '✓ healthy'}
                </span>
              </span>
              <div role="group" aria-label="Map view" className="flex rounded-md bg-console-raised p-0.5">
                {(['3d', '2d'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    disabled={v === '3d' && !webgl}
                    title={
                      v === '3d' && !webgl ? '3D needs WebGL, which this browser does not provide' : undefined
                    }
                    onClick={() => chooseView(v)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${view === v ? 'bg-primary text-white' : 'text-console-muted'}`}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[290px] overflow-hidden rounded-xl border border-console-raised bg-[radial-gradient(circle_at_50%_40%,#13203A,#0B1120_70%)]">
              {view === '3d' ? <Map3D engine={engine} /> : <Map2D engine={engine} />}
            </div>
            <ul className="mt-2 flex flex-wrap gap-3 text-[11px]" aria-label="Legend">
              {Object.values(STATE_STYLE).map((s) => (
                <li key={s.label} className={s.text}>
                  {s.icon} {s.label}
                </li>
              ))}
            </ul>
            <MetricTiles history={history} />
          </>
        )}
        {tab === 'pipeline' && <PipelinePanel engine={engine} live={pipelineLog} />}
        {tab === 'incidents' && (
          <IncidentsPanel engine={engine} onLogs={onLogs} onRollback={onRollback} busy={busy} />
        )}
      </div>
    </>
  );
}
