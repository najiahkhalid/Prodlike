import Link from 'next/link';
import type { Debrief } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { DebriefView } from '@/components/debrief/DebriefView';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Learner debrief' };

/** FR-18 drill-down: any learner's debrief, for the instructor of their class only. */
export default async function LearnerDebriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(`/instructor/attempts/${id}`);
  const res = await serverApi<Debrief & { learner: string }>(`/instructor/attempts/${id}/debrief`);
  return (
    <AppShell
      me={me}
      active="/instructor/reports"
      crumbs={
        <>
          <Link href="/instructor/reports">Learner reports</Link> / Debrief
        </>
      }
      title={res.ok ? `${res.data.learner}: ${res.data.scenario.title}` : 'Debrief not found'}
    >
      {res.ok ? (
        <DebriefView d={res.data} guest={false} readOnly />
      ) : (
        <p role="alert" className="text-bad-text">
          {res.error.message} {res.error.action}
        </p>
      )}
    </AppShell>
  );
}
