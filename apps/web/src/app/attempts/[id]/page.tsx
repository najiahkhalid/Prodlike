import Link from 'next/link';
import type { AttemptView } from '@prodlike/shared';
import { Workspace } from '@/components/workspace/Workspace';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Workspace' };

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMe(`/attempts/${id}`);
  // GET also re-provisions the sandbox if it was lost, restoring saved files (NFR-14).
  const res = await serverApi<AttemptView>(`/attempts/${id}`, { signal: AbortSignal.timeout(30_000) });

  if (!res.ok) {
    return (
      <main className="grid min-h-screen place-items-center bg-console-bg p-6 text-console-text">
        <div role="alert" className="max-w-md rounded-lg border border-console-line bg-console-panel p-7">
          <h1 className="font-head text-2xl font-bold text-white">
            {res.status === 404 ? 'Attempt not found' : 'The workspace could not open'}
          </h1>
          <p className="mt-2 text-console-muted">
            {res.error.message} {res.error.action}
          </p>
          <Link
            href="/scenarios"
            className="mt-5 inline-block font-semibold text-accent-live hover:underline"
          >
            Back to scenarios
          </Link>
        </div>
      </main>
    );
  }
  if (res.data.state === 'ABANDONED' || res.data.state === 'COMPLETED') {
    return (
      <main className="grid min-h-screen place-items-center bg-console-bg p-6 text-console-text">
        <div className="max-w-md rounded-lg border border-console-line bg-console-panel p-7">
          <h1 className="font-head text-2xl font-bold text-white">This attempt has ended</h1>
          <p className="mt-2 text-console-muted">
            Its sandbox has been removed. Start a fresh attempt from the brief.
          </p>
          <Link
            href={`/scenarios/${res.data.scenario.slug}`}
            className="mt-5 inline-block font-semibold text-accent-live hover:underline"
          >
            Back to the brief
          </Link>
        </div>
      </main>
    );
  }
  return <Workspace initial={res.data} />;
}
