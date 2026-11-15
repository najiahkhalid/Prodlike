import Link from 'next/link';
import { Badge, Card, StatusPill, buttonClasses } from '@prodlike/ui';
import type { CatalogueResponse } from '@prodlike/shared';
import { PublicNav } from '@/components/PublicNav';
import { ScenarioCard } from '@/components/ScenarioCard';
import { getHealth, serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['01', 'Understand', 'Read a ticket and an unfamiliar codebase with real history.'],
  ['02', 'Change', 'Fix the bug or build the feature in a browser IDE.'],
  ['03', 'Test', 'Run the suite in an isolated sandbox. Add your own tests.'],
  ['04', 'Ship', 'Push through a CI/CD pipeline. Choose direct or canary.'],
  ['05', 'Recover', 'Something breaks. Investigate, roll back, restore service.'],
] as const;

export default async function LandingPage() {
  const [health, catalogue] = await Promise.all([getHealth(), serverApi<CatalogueResponse>('/scenarios')]);
  const scenarios = catalogue.ok ? catalogue.data.items.slice(0, 4) : [];

  return (
    <>
      <PublicNav />
      <header className="bg-[radial-gradient(800px_400px_at_85%_10%,rgba(6,182,212,.10),transparent_60%),radial-gradient(700px_400px_at_10%_0%,rgba(79,70,229,.10),transparent_60%)] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Badge tone="accent">● Production-like, zero risk</Badge>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-tight">
            Your first production incident <span className="text-primary">shouldn&apos;t be a real one.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg">
            Prodlike drops you into a realistic codebase with a ticket. Fix it, test it, ship it through
            CI/CD, then handle whatever breaks next. Every decision is scored and explained.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonClasses('primary', 'lg')}>
              Create a free account
            </Link>
            <a href="#how" className={buttonClasses('secondary', 'lg')}>
              How it works
            </a>
          </div>
          <p className="mt-3 text-sm text-ink-muted">Free for students. A no-sign-up demo is coming soon.</p>
        </div>
      </header>

      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 text-3xl font-bold">One scenario. The whole engineering lifecycle.</h2>
        <ol className="mt-8 grid gap-0 md:grid-cols-5">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="border border-surface-border bg-white p-5 md:[&+&]:border-l-0">
              <span className="font-mono text-xs font-semibold text-accent-text">{n}</span>
              <h3 className="mt-1 text-lg font-semibold">{title}</h3>
              <p className="text-sm text-ink-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {scenarios.length > 0 && (
        <section id="scenarios" className="border-y border-surface-border bg-white py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Scenario library</p>
                <h2 className="mt-2 text-3xl font-bold">Start with a real-feeling ticket</h2>
              </div>
              <Link href="/scenarios" className={buttonClasses('secondary')}>
                Browse all scenarios →
              </Link>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {scenarios.map((s) => (
                <ScenarioCard key={s.slug} s={s} href={`/scenarios/${s.slug}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="instructors" className="mx-auto max-w-6xl px-6 py-16">
        <p className="eyebrow">For instructors</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold">Practical labs that grade themselves.</h2>
        <p className="mt-3 max-w-2xl">
          Create a cohort, share a join code, assign scenarios with deadlines, and get every attempt scored on
          a transparent rubric.
        </p>
        <Link href="/signup?role=instructor" className={`${buttonClasses('primary')} mt-6`}>
          Sign up as an instructor
        </Link>
      </section>

      <section aria-label="System status" className="mx-auto max-w-6xl px-6 pb-16">
        <Card className="flex flex-wrap items-center gap-4">
          <h2 className="text-base font-semibold">Platform status</h2>
          {health ? (
            <>
              <StatusPill state={health.status === 'ok' ? 'healthy' : 'degraded'} />
              <span className="text-sm">
                API v{health.version} · database <b>{health.checks.database}</b> · up {health.uptimeSeconds}s
              </span>
            </>
          ) : (
            <>
              <StatusPill state="down" />
              <span className="text-sm">
                API unreachable. Start it with <code className="font-mono">pnpm dev</code>.
              </span>
            </>
          )}
        </Card>
      </section>

      <footer className="bg-secondary py-10 text-sm text-slate-400">
        <div className="mx-auto max-w-6xl px-6">
          Prodlike · CS344 Web Engineering, NUST SEECS · Team Prodlike
        </div>
      </footer>
    </>
  );
}
