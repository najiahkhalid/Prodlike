import Link from 'next/link';
import { Badge, Card, StatusPill, buttonClasses } from '@prodlike/ui';
import { PublicNav } from '@/components/PublicNav';
import { getHealth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['01', 'Understand', 'Read a ticket and an unfamiliar codebase with real history.'],
  ['02', 'Change', 'Fix the bug or build the feature in a browser IDE.'],
  ['03', 'Test', 'Run the suite in an isolated sandbox. Add your own tests.'],
  ['04', 'Ship', 'Push through a CI/CD pipeline. Choose direct or canary.'],
  ['05', 'Recover', 'Something breaks. Investigate, roll back, restore service.'],
] as const;

export default async function LandingPage() {
  const health = await getHealth();

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
            <Link href="/demo" className={buttonClasses('primary', 'lg')}>
              ▶ Try a 5-minute demo, no sign-up
            </Link>
            <a href="#how" className={buttonClasses('secondary', 'lg')}>
              How it works
            </a>
          </div>
        </div>
      </header>

      <section id="how" className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-text">How it works</p>
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
