import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Debrief } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { Logo } from '@/components/Logo';
import { DebriefView } from '@/components/debrief/DebriefView';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Debrief' };

/** The debrief after an attempt (FR-15). Guests see it too, with an invitation to keep it. */
export default async function DebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(`/attempts/${id}/debrief`);
  const res = await serverApi<Debrief>(`/attempts/${id}/debrief`);
  if (!res.ok) {
    if (res.status === 409) redirect(`/attempts/${id}`); // not finished yet: back to the workspace
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-3xl font-bold">Debrief not found</h1>
        <p className="mt-3 text-ink-muted">
          {res.error.message}{' '}
          <Link href="/scenarios" className="font-semibold text-primary">
            Back to scenarios
          </Link>
        </p>
      </main>
    );
  }
  const d = res.data;

  if (me.role === 'GUEST') {
    return (
      <>
        <nav className="border-b border-surface-border bg-white">
          <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
            <Logo />
            <span className="ml-3 rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-text">
              Guest demo
            </span>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-[13px] text-ink-muted">Demo debrief</p>
          <h1 className="mb-6 text-3xl font-bold">Debrief: {d.scenario.title}</h1>
          <DebriefView d={d} guest />
        </main>
      </>
    );
  }

  return (
    <AppShell
      me={me}
      active="/progress"
      crumbs={
        <>
          <Link href="/progress">Progress</Link> / Debrief
        </>
      }
      title={`Debrief: ${d.scenario.title}`}
    >
      <DebriefView d={d} guest={false} />
    </AppShell>
  );
}
