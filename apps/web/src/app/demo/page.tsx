'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AttemptView, CatalogueResponse } from '@prodlike/shared';
import { Logo } from '@/components/Logo';
import { ClientApiError, clientApi } from '@/lib/client-api';

/**
 * Guest demo (A2 refinement 1, NFR-06): one click from the landing page into a real scenario,
 * no sign-up. Creates a temporary guest session (24 h), then starts the demo scenario.
 */
export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState<{ message: string; action?: string }>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in development
    started.current = true;
    (async () => {
      try {
        await clientApi('/auth/guest', { method: 'POST' });
        const catalogue = await clientApi<CatalogueResponse>('/scenarios');
        const demo = catalogue.items.find((s) => s.guestDemo);
        if (!demo) {
          setError({
            message: 'The demo scenario is not available right now.',
            action: 'Create a free account instead.',
          });
          return;
        }
        const attempt = await clientApi<AttemptView>('/attempts', {
          method: 'POST',
          body: JSON.stringify({ scenario: demo.slug }),
        });
        router.replace(`/attempts/${attempt.id}`);
      } catch (e) {
        setError(
          e instanceof ClientApiError
            ? { message: e.body.message, action: e.body.action }
            : { message: 'The demo could not start.', action: 'Try again in a moment.' },
        );
      }
    })();
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-console-bg p-6 text-console-text">
      <div className="w-full max-w-md rounded-2xl border border-console-line bg-console-panel p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo dark />
        </div>
        {error ? (
          <div role="alert">
            <h1 className="font-head text-2xl font-bold text-white">{error.message}</h1>
            <p className="mt-2 text-console-muted">{error.action}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" className="ws-btn" onClick={() => location.reload()}>
                Try again
              </button>
              <Link href="/signup" className="ws-btn border-primary bg-primary text-white">
                Create a free account
              </Link>
            </div>
          </div>
        ) : (
          <div role="status" aria-live="polite">
            <h1 className="font-head text-2xl font-bold text-white">Setting up your demo…</h1>
            <p className="mt-2 text-console-muted">
              Starting a private sandbox with a real codebase. No sign-up needed: your result is kept for 24
              hours.
            </p>
            <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-console-raised">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-accent-live" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
