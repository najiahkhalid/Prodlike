import Link from 'next/link';
import { Card } from '@prodlike/ui';
import type { CohortView } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Learner reports' };

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Learner reports (FR-18): every assignment across the instructor's classes. */
export default async function ReportsPage() {
  const me = await requireMe('/instructor/reports');
  const res = await serverApi<CohortView[]>('/instructor/cohorts');
  const rows = res.ok ? res.data.flatMap((c) => c.assignments.map((a) => ({ c, a }))) : [];

  return (
    <AppShell me={me} active="/instructor/reports" crumbs="Instructor" title="Learner reports">
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-ink-muted">
            Reports appear once you assign a scenario to a class.{' '}
            <Link href="/instructor" className="font-semibold text-primary">
              Go to the dashboard
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Assignments">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-2.5">Class</th>
                  <th className="px-3 py-2.5">Scenario</th>
                  <th className="px-3 py-2.5">Deadline</th>
                  <th className="px-3 py-2.5">Completed</th>
                  <th className="px-3 py-2.5">Average</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, a }) => (
                  <tr key={a.id} className="border-b border-surface-border last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{c.name}</td>
                    <td className="px-3 py-3">{a.scenario.title}</td>
                    <td className="px-3 py-3">{a.dueAt ? date(a.dueAt) : '—'}</td>
                    <td className="px-3 py-3 font-mono">
                      {a.completed} / {a.learners}
                    </td>
                    <td className="px-3 py-3 font-mono">{a.averageScore ?? '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/instructor/assignments/${a.id}`}
                        className="mr-4 font-semibold text-primary hover:underline"
                      >
                        Results
                      </Link>
                      <a
                        href={`/api/instructor/assignments/${a.id}/results.csv`}
                        className="font-semibold text-primary hover:underline"
                        download
                      >
                        CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
