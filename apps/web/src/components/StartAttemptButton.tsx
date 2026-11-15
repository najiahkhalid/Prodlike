'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import type { AttemptView } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';

/** Starts (or resumes) an attempt and opens the workspace (FR-05). */
export function StartAttemptButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      const attempt = await clientApi<AttemptView>('/attempts', {
        method: 'POST',
        body: JSON.stringify({ scenario: slug }),
      });
      router.push(`/attempts/${attempt.id}`);
    } catch (e) {
      setError(e instanceof ClientApiError ? `${e.body.message} ${e.body.action ?? ''}` : 'Could not start.');
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="lg" className="mt-4 w-full" onClick={start} disabled={busy} aria-describedby="start-note">
        {busy ? 'Starting your sandbox…' : '▶ Start attempt'}
      </Button>
      {error ? (
        <p role="alert" className="field-error mt-2 text-center">
          {error}
        </p>
      ) : (
        <p id="start-note" className="mt-2 text-center text-xs text-ink-muted">
          A private sandbox starts in about 10 seconds. If you already started this scenario, you continue
          where you left off.
        </p>
      )}
    </>
  );
}
