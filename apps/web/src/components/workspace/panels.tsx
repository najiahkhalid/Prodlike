'use client';

import { useEffect, useRef, useState } from 'react';
import type { TestRunResult, WorkspaceFile } from '@prodlike/shared';
import { parseAnsi } from './ansi';

/* ------------------------------------------------------------------ explorer */

interface TreeNode {
  name: string;
  path: string;
  file?: WorkspaceFile;
  children: TreeNode[];
}

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const f of files) {
    let node = root;
    const parts = f.path.split('/');
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path, children: [], ...(i === parts.length - 1 ? { file: f } : {}) };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode[]): TreeNode[] =>
    n
      .sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, children: sort(c.children) }));
  return sort(root.children);
}

export function Explorer({
  files,
  open,
  onOpen,
}: {
  files: WorkspaceFile[];
  open: string;
  onOpen: (path: string) => void;
}) {
  const render = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) =>
      n.file ? (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => onOpen(n.path)}
            aria-current={open === n.path ? 'true' : undefined}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[13px] ${
              open === n.path
                ? 'bg-primary/25 text-white'
                : 'text-console-muted hover:bg-console-raised hover:text-console-text'
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            <span className="truncate">{n.name}</span>
            {n.file.modified && (
              <span className="font-semibold text-warn-dark" title="Modified">
                M
              </span>
            )}
            {n.file.readOnly && (
              <span className="text-[10px] text-slate-400" title="Read-only">
                ro
              </span>
            )}
          </button>
        </li>
      ) : (
        <li key={n.path}>
          <div
            className="px-2 py-1.5 font-mono text-[13px] text-slate-400"
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            ▾ {n.name}
          </div>
          <ul>{render(n.children, depth + 1)}</ul>
        </li>
      ),
    );
  return (
    <ul aria-label="Files" className="p-1.5">
      {render(buildTree(files), 0)}
    </ul>
  );
}

/* ------------------------------------------------------------------ terminal */

export interface TerminalLine {
  kind: 'input' | 'output' | 'system';
  text: string;
}

export function Ansi({ text }: { text: string }) {
  return (
    <>
      {parseAnsi(text).map((s, i) => (
        <span key={i} className={s.className}>
          {s.text}
        </span>
      ))}
    </>
  );
}

export function TerminalPanel({
  lines,
  busy,
  onRun,
}: {
  lines: TerminalLine[];
  busy: boolean;
  onRun: (line: string) => void;
}) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: an effect must return nothing or a cleanup function, never another value.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3.5 py-2.5 font-mono text-[13px] leading-relaxed text-slate-300"
      >
        {lines.map((l, i) =>
          l.kind === 'input' ? (
            <div key={i}>
              <span className="text-accent-live">$</span> {l.text}
            </div>
          ) : l.kind === 'system' ? (
            <div key={i} className="text-slate-400">
              {l.text}
            </div>
          ) : (
            <div key={i}>
              <Ansi text={l.text} />
            </div>
          ),
        )}
        {busy && <div className="animate-pulse text-slate-400">running…</div>}
        <div ref={end} />
      </div>
      <form
        className="flex items-center gap-2 border-t border-console-raised px-3.5 py-1.5 font-mono text-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          const line = value.trim();
          if (!line || busy) return;
          setHistory((h) => [line, ...h].slice(0, 50));
          setCursor(-1);
          setValue('');
          onRun(line);
        }}
      >
        <label htmlFor="terminal-input" className="whitespace-nowrap text-accent-live">
          learner@sandbox:~$
        </label>
        <input
          id="terminal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && history[cursor + 1]) {
              e.preventDefault();
              setCursor(cursor + 1);
              setValue(history[cursor + 1]);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = cursor - 1;
              setCursor(Math.max(next, -1));
              setValue(next >= 0 ? history[next] : '');
            }
          }}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          placeholder="try: npm test · git diff · git log · help"
          className="flex-1 bg-transparent text-white placeholder:text-slate-600 focus:outline-none"
        />
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ tests */

export function TestsPanel({ result, busy }: { result: TestRunResult | null; busy: boolean }) {
  if (busy)
    return <p className="animate-pulse p-4 font-mono text-[13px] text-slate-400">Running the test suite…</p>;
  if (!result)
    return <p className="p-4 font-mono text-[13px] text-slate-400">Run the tests to see results here.</p>;
  return (
    <div className="h-full overflow-auto bg-slate-950 px-3.5 py-2.5 font-mono text-[13px]">
      <p className="mb-2" role="status">
        {result.failed === 0 ? (
          <span className="text-ok-dark">✓ {result.passed} passed</span>
        ) : (
          <span className="text-bad-dark">
            ✕ {result.failed} failed, {result.passed} passed
          </span>
        )}
        <span className="text-slate-400">
          {' '}
          · {result.total} total · {(result.durationMs / 1000).toFixed(1)}s
        </span>
      </p>
      <ul className="space-y-1">
        {result.cases.map((c) => (
          <li key={c.file + c.name}>
            <span
              className={
                c.status === 'passed'
                  ? 'text-ok-dark'
                  : c.status === 'failed'
                    ? 'text-bad-dark'
                    : 'text-slate-400'
              }
            >
              {c.status === 'passed' ? '✓' : c.status === 'failed' ? '✕' : '–'} {c.name}
            </span>
            {c.file && <span className="text-slate-600"> · {c.file}</span>}
            {c.failure && <pre className="ml-5 mt-1 whitespace-pre-wrap text-bad-dark/90">{c.failure}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
