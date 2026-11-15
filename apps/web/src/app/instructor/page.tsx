import Link from 'next/link';
import { Card, buttonClasses } from '@prodlike/ui';
import { AppShell, DeniedNotice } from '@/components/AppShell';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Instructor Dashboard' };

interface Overview {
  cohorts: { id: string; name: string; joinCode: string; learners: number }[];
  learners: number;
}

export default async function InstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [{ denied }, me] = await Promise.all([searchParams, requireMe('/instructor')]);
  const overview = await serverApi<Overview>('/instructor/overview');

  return (
    <AppShell
      me={me}
      active="/instructor"
      crumbs="Instructor"
      title="Instructor Dashboard"
      actions={
        <Link href="/scenarios" className={buttonClasses('secondary')}>
          Browse scenarios
        </Link>
      }
    >
      <DeniedNotice path={denied} />
      {!overview.ok ? (
        <p role="alert" className="text-bad-text">
          {overview.error.message} {overview.error.action}
        </p>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Cohorts</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">{overview.data.cohorts.length}</div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Learners enrolled</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">{overview.data.learners}</div>
            </Card>
          </div>
          <Card className="mt-6">
            <h2 className="text-lg font-semibold">Cohorts and assignments</h2>
            <p className="mt-1 text-ink-muted">
              {overview.data.cohorts.length === 0
                ? 'You have no cohorts yet. Creating cohorts, sharing join codes and assigning scenarios arrives in Phase 5.'
                : overview.data.cohorts.map((c) => `${c.name} (${c.learners})`).join(', ')}
            </p>
          </Card>
        </>
      )}
    </AppShell>
  );
}
