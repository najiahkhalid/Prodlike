'use client';

import { useState } from 'react';
import type { AttemptView, HintResult } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';

/**
 * Hints with a cost (A2 refinement 3). Asking is a deliberate step: the learner sees the price
 * first, then the hint, and every hint used so far stays readable for free.
 */
export function HintDialog({
  attemptId,
  hints,
  open,
  onClose,
  onUsed,
}: {
  attemptId: string;
  hints: AttemptView['hints'];
  open: boolean;
  onClose: () => void;
  onUsed: (h: HintResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!open) return null;

  async function reveal() {
    setBusy(true);
    setError(undefined);
    try {
      onUsed(await clientApi<HintResult>(`/attempts/${attemptId}/hints`, { method: 'POST' }));
    } catch (e) {
      setError(
        e instanceof ClientApiError ? `${e.body.message} ${e.body.action ?? ''}` : 'Could not get a hint.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hint-title"
        className="w-full max-w-md rounded-2xl border border-console-line bg-console-panel p-6 text-console-text shadow-2xl"
      >
        <h2 id="hint-title" className="font-head text-xl font-bold text-white">
          Hints
        </h2>
        {hints.used.length > 0 && (
          <ol className="mt-3 space-y-2" aria-label="Hints you have used">
            {hints.used.map((h, i) => (
              <li key={h.index} className="rounded-lg bg-console-raised p-3 text-sm">
                <span className="mr-1 font-mono text-xs text-warn-dark">#{i + 1}</span> {h.text}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-sm text-warn-dark">
          Each new hint costs <b>{hints.penalty} points</b> from your score. Used so far: {hints.used.length}{' '}
          (−
          {hints.used.length * hints.penalty}).
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad-dark">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="ws-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="ws-btn border-warn-dark bg-warn-dark/90 text-slate-950"
            onClick={reveal}
            disabled={busy || hints.remaining === 0}
          >
            {hints.remaining === 0
              ? 'No hints left'
              : busy
                ? 'Revealing…'
                : `Reveal a hint (−${hints.penalty})`}
          </button>
        </div>
      </div>
    </div>
  );
}
