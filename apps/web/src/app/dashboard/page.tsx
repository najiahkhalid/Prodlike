import Link from 'next/link';
import { Card, buttonClasses } from '@prodlike/ui';
import type { CatalogueResponse } from '@prodlike/shared';
import { AppShell, DeniedNotice } from '@/components/AppShell';
import { OnboardingTour } from '@/components/OnboardingTour';
import { ScenarioCard } from '@/components/ScenarioCard';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [{ denied }, me] = await Promise.all([searchParams, requireMe('/dashboard')]);
  const catalogue = await serverApi<CatalogueResponse>('/scenarios');
  const scenarios = catalogue.ok ? catalogue.data.items : [];
  const attempted = scenarios.filter((s) => s.bestScore !== null);
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

      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Scenarios completed</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">{attempted.length}</div>
          <div className="text-[13px] text-ink-muted">of {scenarios.length} available</div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Best average score</div>
          <div className="mt-1 font-head text-3xl font-bold text-ink">
            {attempted.length
              ? `${Math.round(attempted.reduce((a, s) => a + (s.bestScore ?? 0), 0) / attempted.length)}%`
              : '—'}
          </div>
          <div className="text-[13px] text-ink-muted">Scores and skill trends arrive with the debrief</div>
        </Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-muted">Account</div>
          <div className="mt-1 truncate font-semibold text-ink">{me.email}</div>
          <div className="text-[13px] text-ink-muted">{me.organisation ?? 'No organisation set'}</div>
        </Card>
      </div>

      {next && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">{attempted.length ? 'Up next' : 'Start here'}</h2>
          <div className="max-w-sm">
            <ScenarioCard s={next} href={`/scenarios/${next.slug}`} />
          </div>
        </section>
      )}
      {!catalogue.ok && (
        <p role="alert" className="mt-6 text-bad-text">
          {catalogue.error.message} {catalogue.error.action}
        </p>
      )}
    </AppShell>
  );
}
