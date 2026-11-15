'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AttemptView,
  CommandResult,
  DeployInput,
  EngineSnapshot,
  TestRunResult,
  WorkspaceFile,
} from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';
import { CodeEditor } from './CodeEditor';
import { Explorer, TerminalPanel, TestsPanel, type TerminalLine } from './panels';
import { DeployDialog } from './system/DeployDialog';
import { SystemPanel } from './system/SystemPanel';
import { useEngine, type RealtimeConfig } from './useEngine';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';
const STEPS = ['Understand', 'Change', 'Test', 'Ship', 'Recover'] as const;

function useElapsed(startedAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The Scenario Workspace (WF-04): Code · Terminal/Tests · System. FR-05..12. */
export function Workspace({ initial, realtime }: { initial: AttemptView; realtime: RealtimeConfig }) {
  const router = useRouter();
  const { engine, setEngine, history, pipelineLog, connected } = useEngine(
    initial.id,
    initial.engine,
    realtime,
  );
  const [deployOpen, setDeployOpen] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState(initial.scenario.entryFile);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [save, setSave] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string>();
  const [bottom, setBottom] = useState<'terminal' | 'tests'>('terminal');
  const [lines, setLines] = useState<TerminalLine[]>(() => [
    {
      kind: 'system',
      text:
        initial.provisionedInMs !== undefined
          ? `Sandbox ready in ${(initial.provisionedInMs / 1000).toFixed(1)}s · isolated · no network · type "help" for commands`
          : 'Sandbox reconnected · type "help" for commands',
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState<TestRunResult | null>(null);
  const [testsBusy, setTestsBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const elapsed = useElapsed(view.startedAt);

  const file = view.files.find((f) => f.path === open);
  const fail = (e: unknown) =>
    e instanceof ClientApiError ? `${e.body.message} ${e.body.action ?? ''}` : String(e);

  // Load a file the first time it is opened.
  useEffect(() => {
    if (contents[open] !== undefined) return;
    clientApi<{ content: string }>(`/attempts/${view.id}/file?path=${encodeURIComponent(open)}`)
      .then((r) => setContents((c) => ({ ...c, [open]: r.content })))
      .catch((e) => setLines((l) => [...l, { kind: 'system', text: `Could not open ${open}: ${fail(e)}` }]));
  }, [open, contents, view.id]);

  const persist = useCallback(
    async (path: string, content: string) => {
      setSave('saving');
      try {
        const saved = await clientApi<WorkspaceFile>(`/attempts/${view.id}/files`, {
          method: 'PUT',
          body: JSON.stringify({ path, content }),
        });
        setView((v) => ({
          ...v,
          progress: { ...v.progress, changed: true },
          files: v.files.map((f) => (f.path === path ? { ...f, modified: saved.modified } : f)),
        }));
        setSave('saved');
        setSaveError(undefined);
      } catch (e) {
        setSave('error');
        setSaveError(fail(e));
      }
    },
    [view.id],
  );

  function onEdit(value: string) {
    setContents((c) => ({ ...c, [open]: value }));
    setSave('unsaved');
    clearTimeout(timer.current);
    const path = open;
    timer.current = setTimeout(() => void persist(path, value), 700);
  }

  async function flush() {
    if (save === 'unsaved') {
      clearTimeout(timer.current);
      await persist(open, contents[open]);
    }
  }

  async function runTests() {
    await flush();
    setBottom('tests');
    setTestsBusy(true);
    try {
      const r = await clientApi<TestRunResult>(`/attempts/${view.id}/tests`, { method: 'POST' });
      setTests(r);
      if (r.failed === 0 && r.total > 0)
        setView((v) => ({ ...v, progress: { ...v.progress, testsPassed: true } }));
    } catch (e) {
      setTests(null);
      setLines((l) => [...l, { kind: 'system', text: `Tests could not run: ${fail(e)}` }]);
      setBottom('terminal');
    } finally {
      setTestsBusy(false);
    }
  }

  async function runCommand(line: string) {
    if (line === 'clear') return setLines([]);
    if (line === 'help') {
      return setLines((l) => [
        ...l,
        { kind: 'input', text: line },
        ...view.scenario.terminalCommands.map((c) => ({
          kind: 'system' as const,
          text: `  ${c.command.padEnd(12)} ${c.description}`,
        })),
        { kind: 'system', text: '  clear        Clear the terminal' },
      ]);
    }
    await flush();
    setLines((l) => [...l, { kind: 'input', text: line }]);
    setBusy(true);
    try {
      const r = await clientApi<CommandResult>(`/attempts/${view.id}/commands`, {
        method: 'POST',
        body: JSON.stringify({ line }),
      });
      setLines((l) => [
        ...l,
        { kind: 'output', text: r.output || (r.exitCode === 0 ? '' : `(exit ${r.exitCode})`) },
      ]);
    } catch (e) {
      setLines((l) => [...l, { kind: 'system', text: fail(e) }]);
    } finally {
      setBusy(false);
    }
  }

  async function deploy(input: DeployInput) {
    await flush();
    try {
      const snap = await clientApi<EngineSnapshot>(`/attempts/${view.id}/deploy`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setEngine(snap);
      setLines((l) => [
        ...l,
        {
          kind: 'system',
          text: `▶ Pipeline #${snap.pipeline?.number} started for ${snap.pipeline?.release} (${input.strategy})`,
        },
      ]);
    } catch (e) {
      throw new Error(fail(e));
    }
  }

  async function rollback() {
    setEngineBusy(true);
    setBottom('terminal');
    await runCommand('rollback');
    setEngineBusy(false);
  }

  async function finish() {
    await flush();
    try {
      await clientApi(`/attempts/${view.id}/finish`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setLines((l) => [...l, { kind: 'system', text: fail(e) }]);
      setBottom('terminal');
    }
  }

  async function endAttempt() {
    if (
      !confirm(
        'End this attempt? Your sandbox will be removed. You can start a fresh attempt from the brief.',
      )
    )
      return;
    await flush();
    await clientApi(`/attempts/${view.id}/end`, { method: 'POST' }).catch(() => undefined);
    router.push(`/scenarios/${view.scenario.slug}`);
  }

  const deployed =
    view.progress.deployed || ['DEPLOYED', 'INCIDENT_ACTIVE', 'RECOVERED'].includes(engine.state);
  const recovered = view.progress.recovered || engine.state === 'RECOVERED';
  // A successful deploy ran the test stage, so it counts as tests passed too.
  const stepDone = [true, view.progress.changed, view.progress.testsPassed || deployed, deployed, recovered];
  const pipelineRunning = engine.state === 'PIPELINE_RUNNING' || engine.state === 'RECOVERING';
  const incidentOpen = engine.state === 'INCIDENT_ACTIVE';
  const current = stepDone.indexOf(false);

  return (
    <div className="grid h-screen grid-cols-[210px_minmax(0,1fr)_380px] grid-rows-[52px_minmax(0,1fr)_240px] bg-console-bg text-sm text-console-text max-lg:grid-cols-[180px_minmax(0,1fr)] max-lg:grid-rows-[52px_minmax(0,1fr)_240px_200px]">
      {/* ------------------------------------------------ top bar */}
      <header className="col-span-full flex items-center gap-4 border-b border-console-raised bg-console-panel px-3.5">
        <Link
          href="/dashboard"
          title="Back to dashboard (your work is saved)"
          className="grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-primary"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <path d="M4 17l6-6-6-6" />
            <path d="M12 19h8" />
          </svg>
          <span className="sr-only">Dashboard</span>
        </Link>
        <h1 className="truncate font-body text-sm font-semibold text-white">
          {view.scenario.title}
          <span className="ml-2 font-normal text-console-muted">
            {view.scenario.company} · {view.scenario.ticketId}
          </span>
        </h1>
        <ol aria-label="Progress" className="hidden gap-1 xl:flex">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === current ? 'step' : undefined}
              className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${
                stepDone[i]
                  ? 'bg-ok-dark/15 text-ok-dark'
                  : i === current
                    ? 'bg-primary text-white'
                    : 'bg-console-raised text-console-muted'
              }`}
            >
              {stepDone[i] && <span aria-hidden="true">✓ </span>}
              {s}
            </li>
          ))}
        </ol>
        <div className="flex-1" />
        <span
          className="rounded-md bg-console-raised px-2.5 py-1.5 font-mono text-sm font-semibold"
          aria-label="Elapsed time"
        >
          {elapsed}
        </span>
        <button type="button" disabled title="Hints arrive in Phase 4" className="ws-btn">
          💡 Hint
        </button>
        {engine.canFinish ? (
          <button type="button" onClick={finish} className="ws-btn border-green-700 bg-green-700 text-white">
            ✓ Finish attempt
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setDeployOpen(true)}
            disabled={pipelineRunning || engineBusy}
            title={pipelineRunning ? 'A pipeline or rollback is running' : undefined}
            className="ws-btn border-primary bg-primary text-white"
          >
            {pipelineRunning ? '⟳ Pipeline running…' : incidentOpen ? '⇪ Ship hotfix' : '⇪ Commit & Deploy'}
          </button>
        )}
        <button type="button" onClick={endAttempt} className="ws-btn">
          End attempt
        </button>
      </header>

      {/* ------------------------------------------------ explorer */}
      <nav
        aria-label="Explorer"
        className="flex min-h-0 flex-col border-r border-console-raised bg-console-panel"
      >
        <div className="px-3.5 py-3 text-[11px] font-semibold uppercase tracking-widest text-console-muted">
          Explorer
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Explorer files={view.files} open={open} onOpen={(p) => void flush().then(() => setOpen(p))} />
        </div>
        <div className="border-t border-console-raised p-3 text-xs leading-relaxed text-console-muted">
          <b className="text-console-text">Ticket:</b> {view.scenario.ticketTitle}{' '}
          <Link href={`/scenarios/${view.scenario.slug}`} className="text-accent-live hover:underline">
            Full brief
          </Link>
        </div>
      </nav>

      {/* ------------------------------------------------ editor */}
      <section aria-label="Editor" className="flex min-h-0 flex-col">
        <div className="flex h-[38px] items-center border-b border-console-raised px-3">
          <span className="border-b-2 border-accent-live py-2.5 font-mono text-[13px] text-white">
            {open.split('/').pop()}
            {file?.readOnly && <span className="ml-1.5 text-[11px] text-console-muted">(read-only)</span>}
          </span>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-console-muted">
            {open}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {contents[open] === undefined ? (
            <p className="p-4 font-mono text-[13px] text-console-muted">Loading {open}…</p>
          ) : (
            <CodeEditor path={open} value={contents[open]} readOnly={!!file?.readOnly} onChange={onEdit} />
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-console-raised bg-console-panel px-3 py-1.5 text-xs text-console-muted">
          <span role="status" aria-live="polite">
            {save === 'saving' && 'Saving…'}
            {save === 'saved' && '✓ Saved'}
            {save === 'unsaved' && 'Unsaved changes'}
            {save === 'error' && <span className="text-bad-dark">✕ Not saved: {saveError}</span>}
          </span>
          <div className="flex-1" />
          <button type="button" onClick={runTests} disabled={testsBusy} className="ws-btn">
            ▶ Run tests
          </button>
        </div>
      </section>

      {/* ------------------------------------------------ system */}
      <aside
        aria-label="System"
        className="row-span-2 flex min-h-0 flex-col border-l border-console-raised bg-console-panel max-lg:col-span-full max-lg:row-span-1"
      >
        <SystemPanel
          engine={engine}
          history={history}
          pipelineLog={pipelineLog}
          connected={connected}
          busy={engineBusy || pipelineRunning}
          onRollback={() => void rollback()}
          onLogs={(service) => {
            setBottom('terminal');
            void runCommand(`logs ${service}`);
          }}
        />
      </aside>

      {/* ------------------------------------------------ terminal / tests */}
      <section
        aria-label="Terminal and test results"
        className="col-span-2 flex min-h-0 flex-col border-t border-console-raised max-lg:col-span-full"
      >
        <div
          role="tablist"
          className="flex h-[38px] items-center gap-1 border-b border-console-raised bg-console-panel px-2"
        >
          {(['terminal', 'tests'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={bottom === t}
              onClick={() => setBottom(t)}
              className={`border-b-2 px-3 py-2.5 text-[13px] ${bottom === t ? 'border-accent-live text-white' : 'border-transparent text-console-muted hover:text-console-text'}`}
            >
              {t === 'terminal' ? 'Terminal' : 'Test results'}
              {t === 'tests' && tests && (
                <span className={`ml-1.5 ${tests.failed ? 'text-bad-dark' : 'text-ok-dark'}`}>
                  {tests.failed ? `✕ ${tests.failed}` : `✓ ${tests.passed}`}
                </span>
              )}
            </button>
          ))}
          <span className="ml-auto text-[11px] uppercase tracking-widest text-console-muted">
            sandbox · node 20 · isolated
          </span>
        </div>
        <div className="min-h-0 flex-1">
          {bottom === 'terminal' ? (
            <TerminalPanel lines={lines} busy={busy} onRun={(l) => void runCommand(l)} />
          ) : (
            <TestsPanel result={tests} busy={testsBusy} />
          )}
        </div>
      </section>

      <DeployDialog
        open={deployOpen}
        hotfix={incidentOpen}
        canaryPercent={engine.canaryPercent}
        onClose={() => setDeployOpen(false)}
        onDeploy={deploy}
      />
    </div>
  );
}
