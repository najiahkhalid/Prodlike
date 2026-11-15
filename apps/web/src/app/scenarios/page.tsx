import Link from 'next/link';
import { DIFFICULTIES, type CatalogueResponse } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { ScenarioCard } from '@/components/ScenarioCard';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Scenario Catalogue' };

type Params = { difficulty?: string; skill?: string; q?: string };

/** Builds a catalogue URL keeping the other filters (filters live in the URL, so they are shareable). */
function hrefWith(current: Params, change: Partial<Params>) {
  const merged = { ...current, ...change };
  const qs = new URLSearchParams(Object.entries(merged).filter(([, v]) => v) as [string, string][]);
  const s = qs.toString();
  return s ? `/scenarios?${s}` : '/scenarios';
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? 'true' : undefined}
      className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
        on
          ? 'border-primary bg-primary text-white'
          : 'border-surface-border bg-white text-ink-body hover:border-slate-300'
      }`}
    >
      {on && <span aria-hidden="true">✓ </span>}
      {children}
    </Link>
  );
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const me = await requireMe('/scenarios');
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  const [filtered, all] = await Promise.all([
    serverApi<CatalogueResponse>(`/scenarios${qs ? `?${qs}` : ''}`),
    serverApi<CatalogueResponse>('/scenarios'),
  ]);
  const skills = all.ok ? all.data.skills : [];
  const active = me.role === 'INSTRUCTOR' ? '/scenarios' : '/scenarios';

  return (
    <AppShell
      me={me}
      active={active}
      crumbs={
        <>
          <Link href="/dashboard">Dashboard</Link> / Scenarios
        </>
      }
      title="Scenario Catalogue"
      actions={
        <form action="/scenarios" role="search" className="flex gap-2">
          {params.difficulty && <input type="hidden" name="difficulty" value={params.difficulty} />}
          {params.skill && <input type="hidden" name="skill" value={params.skill} />}
          <label htmlFor="q" className="sr-only">
            Search scenarios
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q}
            placeholder="Search scenarios…"
            className="field-input w-64"
          />
        </form>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-6" role="group" aria-label="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-ink-muted">Difficulty</span>
          <Chip href={hrefWith(params, { difficulty: undefined })} on={!params.difficulty}>
            All
          </Chip>
          {DIFFICULTIES.map((d) => (
            <Chip key={d} href={hrefWith(params, { difficulty: d })} on={params.difficulty === d}>
              {d[0].toUpperCase() + d.slice(1)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-ink-muted">Skill</span>
          <Chip href={hrefWith(params, { skill: undefined })} on={!params.skill}>
            All
          </Chip>
          {skills.map((k) => (
            <Chip
              key={k}
              href={hrefWith(params, { skill: k })}
              on={params.skill?.toLowerCase() === k.toLowerCase()}
            >
              {k}
            </Chip>
          ))}
        </div>
      </div>

      {!filtered.ok ? (
        <p role="alert" className="text-bad-text">
          {filtered.error.message} {filtered.error.action}
        </p>
      ) : filtered.data.items.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 p-12 text-center text-ink-muted">
          No scenarios match these filters.{' '}
          <Link href="/scenarios" className="font-semibold text-primary">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.data.items.map((s) => (
            <ScenarioCard key={s.slug} s={s} href={`/scenarios/${s.slug}`} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
