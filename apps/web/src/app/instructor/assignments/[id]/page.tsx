import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AssignmentResults } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { ResultsView } from '@/components/instructor/ResultsView';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Assignment results' };

/** FR-18: per-learner and class results for one assignment. */
export default async function AssignmentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe(`/instructor/assignments/${id}`);
  const res = await serverApi<AssignmentResults>(`/instructor/assignments/${id}/results`);
  if (!res.ok) notFound();
  const r = res.data;
  return (
    <AppShell
      me={me}
      active="/instructor/reports"
      crumbs={
        <>
          <Link href={`/instructor?cohort=${r.cohort.id}`}>{r.cohort.name}</Link> / Results
        </>
      }
      title={r.assignment.scenario.title}
    >
      <ResultsView r={r} />
    </AppShell>
  );
}
