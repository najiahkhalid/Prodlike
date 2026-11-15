import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Card, difficultyTone } from '@prodlike/ui';
import type { ScenarioBrief } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { requireMe, serverApi } from '@/lib/api';

const SKILL_LABEL = {
  correctness: 'Correctness',
  testing: 'Testing',
  deploymentSafety: 'Deployment safety',
  recovery: 'Recovery',
} as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await serverApi<ScenarioBrief>(`/scenarios/${slug}`);
  return { title: res.ok ? res.data.title : 'Scenario' };
}

/** FR-04: everything the learner needs before the timer starts, and nothing hidden. */
export default async function BriefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireMe(`/scenarios/${slug}`);
  const res = await serverApi<ScenarioBrief>(`/scenarios/${slug}`);
  if (!res.ok) notFound();
  const s = res.data;
  const b = s.brief;

  return (
    <AppShell
      me={me}
      active="/scenarios"
      crumbs={
        <>
          <Link href="/scenarios">Scenarios</Link> / Brief
        </>
      }
      title={s.title}
    >
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={difficultyTone[s.difficulty]}>
          {s.difficulty[0].toUpperCase() + s.difficulty.slice(1)}
        </Badge>
        {s.skills.map((k) => (
          <Badge key={k}>{k}</Badge>
        ))}
        <span className="text-sm text-ink-muted">⏱ about {s.estimatedMinutes} minutes</span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center gap-2.5 font-mono text-[13px] font-semibold text-ink-muted">
              <Badge tone="bad">
                {b.priority} · {b.type[0].toUpperCase() + b.type.slice(1)}
              </Badge>
              {b.ticketId} · reported by {b.reportedBy}
            </div>
            <h2 className="mt-3 text-xl font-semibold">{b.title}</h2>
            <p className="mt-2">{b.body}</p>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Company context</h2>
            <p className="mt-1 text-sm">
              <b className="text-ink">{s.company.name}.</b> {s.company.description}
            </p>
            {b.teammateMessage && (
              <div className="mt-4 flex gap-3 rounded border border-surface-border bg-surface-bg p-3.5">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-text text-[13px] font-semibold text-white">
                  {b.teammateMessage.from[0]}
                </span>
                <div>
                  <b className="text-ink">
                    {b.teammateMessage.from} ({b.teammateMessage.role})
                  </b>
                  <p className="text-sm">{b.teammateMessage.text}</p>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Your objectives</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              {b.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ol>
            {b.constraints.length > 0 && (
              <>
                <h3 className="mt-5 text-base font-semibold">Constraints</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {b.constraints.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6">
          <Card>
            <h2 className="text-lg font-semibold">How you&apos;ll be scored</h2>
            <dl className="mt-2">
              {s.rubric.map((r) => (
                <div
                  key={r.label}
                  className="flex justify-between gap-3 border-b border-dashed border-surface-border py-2.5 text-sm last:border-0"
                >
                  <dt>
                    <span className="font-medium text-ink">{SKILL_LABEL[r.skill]}</span> — {r.label}
                  </dt>
                  <dd className="font-mono font-semibold text-ink">{r.weight}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-muted">
              Any valid solution that passes the checks gets full marks. {s.hintCount} hints available, −
              {s.hintPenalty} points each.
            </p>
            <Button size="lg" className="mt-4 w-full" disabled aria-describedby="start-note">
              ▶ Start attempt
            </Button>
            <p id="start-note" className="mt-2 text-center text-xs text-ink-muted">
              The sandbox workspace opens in the next release (Phase 2).
            </p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
