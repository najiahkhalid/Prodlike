import Link from 'next/link';
import type { AttemptView } from '@prodlike/shared';
import { Workspace } from '@/components/workspace/Workspace';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Workspace' };

/**
 * How the browser reaches the live event stream (ADR-007). On the host (pnpm dev) the API runs on
 * its own port; behind Caddy (Docker) it is the same origin under /api, so REALTIME_PORT is empty.
 */
const realtimePort = process.env.REALTIME_PORT === undefined ? '4000' : process.env.REALTIME_PORT || null;

function EndCard({
  title,
  children,
  href,
  cta,
}: {
  title: string;
  children: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-console-bg p-6 text-console-text">
      <div className="max-w-md rounded-lg border border-console-line bg-console-panel p-7">
        <h1 className="font-head text-2xl font-bold text-white">{title}</h1>
        <div className="mt-2 text-console-muted">{children}</div>
        <Link href={href} className="mt-5 inline-block font-semibold text-accent-live hover:underline">
          {cta}
        </Link>
      </div>
    </main>
  );
}

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMe(`/attempts/${id}`);
  // GET also re-provisions the sandbox if it was lost, restoring saved files (NFR-14).
  const res = await serverApi<AttemptView>(`/attempts/${id}`, { signal: AbortSignal.timeout(30_000) });

  if (!res.ok) {
    return (
      <EndCard
        title={res.status === 404 ? 'Attempt not found' : 'The workspace could not open'}
        href="/scenarios"
        cta="Back to scenarios"
      >
        <p role="alert">
          {res.error.message} {res.error.action}
        </p>
      </EndCard>
    );
  }
  const a = res.data;
  if (a.state === 'COMPLETED') {
    const inc = a.engine.incident;
    return (
      <EndCard title="Scenario complete" href={`/scenarios/${a.scenario.slug}`} cta="Back to the brief">
        <p>
          {inc?.resolvedAt
            ? `You restored service in ${a.engine.timeToRecoverSeconds}s by ${inc.resolvedBy === 'rollback' ? 'rolling back' : 'shipping a hotfix'}.`
            : 'You shipped a release that kept production healthy.'}{' '}
          Production is on <span className="font-mono text-console-text">{a.engine.release}</span>.
        </p>
        <p className="mt-2 text-sm">
          Your scored debrief, with the timeline of your decisions, arrives in Phase 4.
        </p>
      </EndCard>
    );
  }
  if (a.state === 'ABANDONED') {
    return (
      <EndCard title="This attempt has ended" href={`/scenarios/${a.scenario.slug}`} cta="Back to the brief">
        <p>Its sandbox has been removed. Start a fresh attempt from the brief.</p>
      </EndCard>
    );
  }
  return <Workspace initial={a} realtime={{ port: realtimePort }} />;
}
