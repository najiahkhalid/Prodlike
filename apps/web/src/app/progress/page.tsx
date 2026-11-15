import Link from 'next/link';
import { Badge, Card, buttonClasses } from '@prodlike/ui';
import type { ProgressResponse } from '@prodlike/shared';
import { AppShell } from '@/components/AppShell';
import { ScoreTrend } from '@/components/progress/ScoreTrend';
import { requireMe, serverApi } from '@/lib/api';

export const metadata = { title: 'Progress History' };

const SKILLS = [
  ['correctness', 'Correctness'],
  ['testing', 'Testing'],
  ['deploymentSafety', 'Deployment safety'],
  ['recovery', 'Recovery'],
] as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const duration = (s: number | null) =>
  s === null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

/** FR-16: score history and per-skill trends across attempts. */
export default async function ProgressPage() {
  const me = await requireMe('/progress');
  const res = await serverApi<ProgressResponse>('/me/progress');
  const p = res.ok ? res.data : null;

  return (
    <AppShell me={me} active="/progress" crumbs="Learner" title="Progress History">
      {!p ? (
        <p role="alert" className="text-bad-text">
          {res.ok ? '' : `${res.error.message} ${res.error.action ?? ''}`}
        </p>
      ) : p.summary.completed === 0 ? (
        <Card className="text-center">
          <h2 className="text-xl font-semibold">No finished scenarios yet</h2>
          <p className="mt-1 text-ink-muted">Finish a scenario to see your score, skills and badges here.</p>
          <Link href="/scenarios" className={`${buttonClasses('primary')} mt-4`}>
            Browse scenarios
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Scenarios completed</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">{p.summary.completed}</div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Average score</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">{p.summary.averageScore}%</div>
              <div className="text-[13px] text-ink-muted">Best: {p.summary.bestScore}%</div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Median time to recover</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">
                {duration(p.summary.medianTimeToRecoverSeconds)}
              </div>
            </Card>
            <Card>
              <div className="text-[13px] font-medium text-ink-muted">Learning gain</div>
              <div className="mt-1 font-head text-3xl font-bold text-ink">
                {p.summary.improvement === null
                  ? '—'
                  : `${p.summary.improvement > 0 ? '+' : ''}${p.summary.improvement}`}
              </div>
              <div className="text-[13px] text-ink-muted">
                {p.summary.improvement === null
                  ? 'After 4 attempts: latest 3 vs first 3'
                  : 'points, latest 3 vs first 3'}
              </div>
            </Card>
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card>
              <h2 className="text-lg font-semibold">Score per attempt</h2>
              <p className="text-xs text-ink-muted">Oldest to newest, 0–100</p>
              {p.attempts.length < 2 && (
                <p className="mt-1 text-xs text-ink-muted">Finish another attempt to see your trend.</p>
              )}
              <div className="mt-3">
                <ScoreTrend
                  points={[...p.attempts]
                    .reverse()
                    .map((a) => ({ label: a.scenario.title, score: a.score, date: fmtDate(a.completedAt) }))}
                />
              </div>
            </Card>
            <Card>
              <h2 className="text-lg font-semibold">Skills</h2>
              <p className="text-xs text-ink-muted">Share of rubric points earned, all attempts</p>
              <ul className="mt-3 space-y-3">
                {SKILLS.map(([key, label]) => {
                  const v = p.skills[key];
                  return (
                    <li key={key} className="grid grid-cols-[130px_1fr_40px] items-center gap-3 text-sm">
                      <span>{label}</span>
                      <div className="h-2 rounded-full bg-slate-200" aria-hidden="true">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${v ?? 0}%` }} />
                      </div>
                      <b className="text-right font-mono text-ink">{v === null ? '—' : v}</b>
                    </li>
                  );
                })}
              </ul>
              {p.badges.length > 0 && (
                <>
                  <h3 className="mt-5 text-base font-semibold">Badges</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {p.badges.map((b) => (
                      <li key={b.id} title={b.description}>
                        <Badge tone="primary">🏅 {b.name}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>

          <Card className="mt-6">
            <h2 className="text-lg font-semibold">Completed attempts</h2>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                  <th className="py-2.5 pr-3">Scenario</th>
                  <th className="py-2.5 pr-3">Finished</th>
                  <th className="py-2.5 pr-3">Score</th>
                  <th className="py-2.5 pr-3">Recovered in</th>
                  <th className="py-2.5 pr-3">Strategy</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>
                {p.attempts.map((a) => (
                  <tr key={a.id} className="border-b border-surface-border">
                    <td className="py-3 pr-3 font-medium text-ink">{a.scenario.title}</td>
                    <td className="py-3 pr-3">{fmtDate(a.completedAt)}</td>
                    <td className="py-3 pr-3 font-mono font-semibold text-ink">{a.score}</td>
                    <td className="py-3 pr-3 font-mono">{duration(a.timeToRecoverSeconds)}</td>
                    <td className="py-3 pr-3 capitalize">{a.strategy ?? '—'}</td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/attempts/${a.id}/debrief`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Debrief
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}
