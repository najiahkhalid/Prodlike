import Link from 'next/link';
import { Badge, Card, buttonClasses } from '@prodlike/ui';
import type { CatalogueResponse, MyCohorts, ProgressResponse } from '@prodlike/shared';
import { AppShell, DeniedNotice } from '@/components/AppShell';
import { JoinClass } from '@/components/JoinClass';
import { OnboardingTour } from '@/components/OnboardingTour';
import { ScenarioCard } from '@/components/ScenarioCard';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Dashboard' };

const duration = (s: number | null) =>
  s === null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; join?: string }>;
}) {
  const [{ denied, join }, me] = await Promise.all([searchParams, requireMe('/dashboard')]);
  const [catalogue, progress, classes] = await Promise.all([
    serverApi<CatalogueResponse>('/scenarios'),
    serverApi<ProgressResponse>('/me/progress'),
    serverApi<MyCohorts>('/me/cohorts'),
  ]);
  const my = classes.ok ? classes.data : { cohorts: [], assignments: [] };
  const scenarios = catalogue.ok ? catalogue.data.items : [];
  const p = progress.ok ? progress.data : null;
  const next = scenarios.find((s) => s.bestScore === null) ?? scenarios[0];
  const first = me.name.split(' ')[0];

  return (
    <AppShell
      me={me}
      active="/dashboard"
      crumbs="Learner"
      title={`Welcome, ${first}`}
      actions={
        <Link href="/scenarios" className={buttonClasses('primary')}>
          Browse scenarios
        </Link>
      }
    >
      {!me.onboarded && <OnboardingTour />}
      <DeniedNotice path={denied} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Scenarios completed</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink" data-testid="completed">
            {p?.summary.completed ?? 0}
          </div>
          <div className="text-[13px] text-ink-muted">of {scenarios.length} available</div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Average score</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">
            {p?.summary.averageScore === null || !p ? '—' : `${p.summary.averageScore}%`}
          </div>
          <div className="text-[13px] text-ink-muted">
            {p?.summary.bestScore != null
              ? `Best: ${p.summary.bestScore}%`
              : 'Finish a scenario to get scored'}
          </div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Median time to recover</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">
            {duration(p?.summary.medianTimeToRecoverSeconds ?? null)}
          </div>
          <div className="text-[13px] text-ink-muted">From alert to restored service</div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Badges</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">{p?.badges.length ?? 0}</div>
          <div className="truncate text-[13px] text-ink-muted">
            {p?.badges.length
              ? `Latest: ${p.badges[p.badges.length - 1].name}`
              : 'Earn them by shipping safely'}
          </div>
        </Card>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Your classes</h2>
          <Card>
            {my.cohorts.length > 0 && (
              <ul className="mb-4 grid gap-1 text-sm" data-testid="my-classes">
                {my.cohorts.map((c) => (
                  <li key={c.id}>
                    <b className="text-ink">{c.name}</b>{' '}
                    <span className="text-ink-muted">with {c.instructor}</span>
                  </li>
                ))}
              </ul>
            )}
            <JoinClass
              initialError={
                join === 'failed' ? 'Your account was created, but that class code did not work.' : undefined
              }
            />
          </Card>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-semibold">Assigned to you</h2>
          <Card className="p-0">
            {my.assignments.length === 0 ? (
              <p className="p-5 text-ink-muted">
                {my.cohorts.length
                  ? 'Your instructors have not assigned anything yet.'
                  : 'Join a class to see assignments here.'}
              </p>
            ) : (
              <table className="w-full text-sm" aria-label="Assignments">
                <tbody>
                  {my.assignments.map((a) => (
                    <tr key={a.id} className="border-b border-surface-border last:border-0">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{a.scenario.title}</div>
                        <div className="text-xs text-ink-muted">
                          {a.cohort}
                          {a.dueAt &&
                            ` · due ${new Date(a.dueAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {a.status === 'done' ? (
                          <Badge tone="ok">✓ Done · {a.bestScore}</Badge>
                        ) : a.status === 'late' ? (
                          <Badge tone="warn">⚑ Late</Badge>
                        ) : (
                          <Badge tone="primary">To do</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/scenarios/${a.scenario.slug}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {a.status === 'done' ? 'Improve' : 'Start'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        {next && (
          <section>
            <h2 className="mb-3 text-xl font-semibold">{p?.summary.completed ? 'Up next' : 'Start here'}</h2>
            <ScenarioCard s={next} href={`/scenarios/${next.slug}`} />
          </section>
        )}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent debriefs</h2>
            {p?.summary.completed ? (
              <Link href="/progress" className="text-sm font-semibold text-primary hover:underline">
                All progress →
              </Link>
            ) : null}
          </div>
          <Card className="p-0">
            {p && p.attempts.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {p.attempts.slice(0, 5).map((a) => (
                    <tr key={a.id} className="border-b border-surface-border last:border-0">
                      <td className="px-5 py-3 font-medium text-ink">{a.scenario.title}</td>
                      <td className="px-3 py-3 font-mono font-semibold text-ink">{a.score}</td>
                      <td className="px-3 py-3 font-mono text-ink-muted">
                        {duration(a.timeToRecoverSeconds)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/attempts/${a.id}/debrief`}
                          className="font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-5 text-ink-muted">Your debriefs will appear here once you finish a scenario.</p>
            )}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
