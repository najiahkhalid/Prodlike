'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@prodlike/ui';
import { JoinCohortSchema } from '@prodlike/shared';
import { ClientApiError, clientApi } from '@/lib/client-api';

/** "Join a class" on the learner dashboard (FR-17). */
export function JoinClass({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; action?: string } | undefined>(
    initialError ? { message: initialError } : undefined,
  );
  const [joined, setJoined] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = JoinCohortSchema.safeParse({ code: new FormData(e.currentTarget).get('code') ?? '' });
    if (!parsed.success) {
      setError({ message: parsed.error.issues[0].message });
      return;
    }
    setBusy(true);
    try {
      const res = await clientApi<{ cohort: { name: string } }>('/cohorts/join', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setJoined(res.cohort.name);
      setError(undefined);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? { message: err.body.message, action: err.body.action }
          : { message: 'Could not join.' },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="code" className="field-label">
        Class join code
      </label>
      <div className="flex gap-2">
        <input
          id="code"
          name="code"
          placeholder="ABCD-1234"
          autoComplete="off"
          className="field-input font-mono uppercase tracking-widest"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'code-error' : undefined}
        />
        <Button type="submit" disabled={busy}>
          Join
        </Button>
      </div>
      {error && (
        <p id="code-error" role="alert" className="field-error">
          {error.message} {error.action}
        </p>
      )}
      {joined && (
        <p role="status" className="mt-2 text-sm font-semibold text-ok-text">
          ✓ You joined {joined}.
        </p>
      )}
    </form>
  );
}
