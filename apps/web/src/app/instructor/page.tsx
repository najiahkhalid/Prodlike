import Link from 'next/link';
import { Card } from '@prodlike/ui';
import type { AssignmentResults, CatalogueResponse, CohortView } from '@prodlike/shared';
import { AppShell, DeniedNotice } from '@/components/AppShell';
import { ResultsView } from '@/components/instructor/ResultsView';
import { ActionButton, AssignButton, JoinCode, NewCohortButton } from '@/components/instructor/dialogs';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Instructor Dashboard' };

const date = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Instructor Dashboard (FR-17, FR-18): one class at a time, its assignments and the selected results. */
export default async function InstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; cohort?: string; assignment?: string }>;
}) {
  const [sp, me] = await Promise.all([searchParams, requireMe('/instructor')]);
  const [cohortsRes, catalogue] = await Promise.all([
    serverApi<CohortView[]>('/instructor/cohorts'),
    serverApi<CatalogueResponse>('/scenarios'),
  ]);
  const cohorts = cohortsRes.ok ? cohortsRes.data : [];
  const cohort = cohorts.find((c) => c.id === sp.cohort) ?? cohorts[0];
  const assignment = cohort?.assignments.find((a) => a.id === sp.assignment) ?? cohort?.assignments[0];
  const results = assignment
    ? await serverApi<AssignmentResults>(`/instructor/assignments/${assignment.id}/results`)
    : null;
  const scenarios = (catalogue.ok ? catalogue.data.items : []).map((s) => ({
    slug: s.slug,
    title: s.title,
    draft: !s.published,
  }));
  const scored = cohort?.assignments.filter((a) => a.averageScore !== null) ?? [];

  return (
    <AppShell
      me={me}
      active="/instructor"
      crumbs="Instructor"
      title="Instructor Dashboard"
      actions={<NewCohortButton />}
    >
      <DeniedNotice path={sp.denied} />
      {!cohortsRes.ok && (
        <p role="alert" className="text-bad-text">
          {cohortsRes.error.message} {cohortsRes.error.action}
        </p>
      )}

      {cohortsRes.ok && !cohort && (
        <Card className="max-w-xl">
          <h2 className="text-lg font-semibold">Create your first class</h2>
          <p className="mt-1 text-ink-muted">
            A class gives you a join code to share with learners. Then assign a scenario, optionally with a
            deadline, and results appear here as learners finish. No manual grading.
          </p>
        </Card>
      )}

      {cohort && (
        <>
          <div role="tablist" aria-label="Classes" className="mb-6 flex flex-wrap gap-2">
            {cohorts.map((c) => (
              <Link
                key={c.id}
                role="tab"
                aria-selected={c.id === cohort.id}
                href={`/instructor?cohort=${c.id}`}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                  c.id === cohort.id
                    ? 'border-primary bg-primary text-white'
                    : 'border-surface-border bg-white text-ink hover:bg-slate-50'
                }`}
              >
                {c.name}
              </Link>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Join code</div>
              <div className="mt-2">
                <JoinCode code={cohort.joinCode} />
              </div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Learners</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink" data-testid="learner-count">
                {cohort.learners.length}
              </div>
              <Link
                href="/instructor/cohorts"
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                Manage class →
              </Link>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Assignments</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">{cohort.assignments.length}</div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Class average</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">
                {scored.length
                  ? Math.round(scored.reduce((n, a) => n + (a.averageScore ?? 0), 0) / scored.length)
                  : '—'}
              </div>
              <div className="text-[13px] text-ink-muted">Across all assignments</div>
            </Card>
          </div>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Assignments</h2>
              <AssignButton cohortId={cohort.id} scenarios={scenarios} />
            </div>
            <Card className="p-0">
              {cohort.assignments.length === 0 ? (
                <p className="p-5 text-ink-muted">Nothing assigned yet. Pick a scenario for this class.</p>
              ) : (
                <table className="w-full text-sm" aria-label="Assignments">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                      <th className="px-5 py-2.5">Scenario</th>
                      <th className="px-3 py-2.5">Deadline</th>
                      <th className="px-3 py-2.5">Completed</th>
                      <th className="px-3 py-2.5">Average</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {cohort.assignments.map((a) => (
                      <tr
                        key={a.id}
                        className={`border-b border-surface-border last:border-0 ${
                          a.id === assignment?.id ? 'bg-primary-tint/40' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <Link
                            href={`/instructor?cohort=${cohort.id}&assignment=${a.id}`}
                            className="font-semibold text-ink hover:text-primary"
                          >
                            {a.scenario.title}
                          </Link>
                          <div className="text-xs capitalize text-ink-muted">{a.scenario.difficulty}</div>
                        </td>
                        <td className="px-3 py-3">
                          {a.dueAt ? date(a.dueAt) : <span className="text-ink-muted">None</span>}
                        </td>
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
                          <ActionButton
                            path={`/instructor/assignments/${a.id}`}
                            label="Remove"
                            confirmText={`Remove "${a.scenario.title}" from ${cohort.name}? Learners keep their attempts.`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          {results?.ok && (
            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">
                Results: {results.data.assignment.scenario.title}
              </h2>
              <ResultsView r={results.data} />
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
