'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeployInput } from '@prodlike/shared';

/** Commit message + deployment strategy (FR-09), styled like the A2 prototype's deploy modal. */
export function DeployDialog({
  open,
  hotfix,
  canaryPercent,
  onClose,
  onDeploy,
}: {
  open: boolean;
  hotfix: boolean;
  canaryPercent: number;
  onClose: () => void;
  onDeploy: (input: DeployInput) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [strategy, setStrategy] = useState<'direct' | 'canary'>('direct');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(undefined);
      setBusy(false);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3)
      return setError('Write a short commit message, e.g. "fix: include Rs 1000".');
    setBusy(true);
    try {
      await onDeploy({ message: message.trim(), strategy });
      setMessage('');
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="deploy-title"
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-console-line bg-console-panel p-6 text-console-text shadow-2xl"
      >
        <h2 id="deploy-title" className="font-head text-xl font-bold text-white">
          {hotfix ? 'Ship a hotfix' : 'Commit & deploy to production'}
        </h2>
        {hotfix && (
          <p className="mt-1 text-xs text-warn-dark">
            An incident is open: this release goes out as a hotfix.
          </p>
        )}
        <label htmlFor="commit-message" className="mt-4 block text-sm font-semibold">
          Commit message
        </label>
        <input
          ref={input}
          id="commit-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="fix(discount): include orders of exactly Rs 1000"
          className="mt-1.5 w-full rounded-md border border-console-line bg-slate-950 px-3 py-2.5 font-mono text-sm text-white focus:border-primary focus:outline-none"
        />
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Deployment strategy</legend>
          {(
            [
              ['direct', 'Direct', 'Replace every instance at once. Fastest.'],
              [
                'canary',
                `Canary (${canaryPercent}%)`,
                `Send ${canaryPercent}% of traffic to the new release first. Safer.`,
              ],
            ] as const
          ).map(([value, title, text]) => (
            <label
              key={value}
              className={`mt-2 flex cursor-pointer gap-2.5 rounded-lg border p-3 ${strategy === value ? 'border-primary bg-primary/15' : 'border-console-line'}`}
            >
              <input
                type="radio"
                name="strategy"
                value={value}
                checked={strategy === value}
                onChange={() => setStrategy(value)}
              />
              <span>
                <b className="text-white">{title}</b>
                <span className="block text-xs text-console-muted">{text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad-dark">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="ws-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ws-btn border-primary bg-primary text-white" disabled={busy}>
            {busy ? 'Starting…' : 'Run pipeline'}
          </button>
        </div>
      </form>
    </div>
  );
}
