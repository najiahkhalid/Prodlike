import Link from 'next/link';
import { Badge, Card, buttonClasses } from '@prodlike/ui';
import type { Debrief, MomentKind } from '@prodlike/shared';

const SKILL_LABEL = {
  correctness: 'Correctness',
  testing: 'Testing',
  deploymentSafety: 'Deployment safety',
  recovery: 'Recovery',
} as const;

/** Moment markers: colour AND icon AND a hidden word, never colour alone (NFR-07). */
const MOMENT: Record<MomentKind, { icon: string; dot: string; sr: string }> = {
  good: { icon: '✓', dot: 'border-ok bg-ok-tint text-ok-text', sr: 'Good decision' },
  warn: { icon: '▲', dot: 'border-warn bg-warn-tint text-warn-text', sr: 'Risky decision' },
  bad: { icon: '✕', dot: 'border-bad bg-bad-tint text-bad-text', sr: 'Problem' },
  info: { icon: '•', dot: 'border-slate-300 bg-white text-ink-muted', sr: 'Step' },
};

const clock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const duration = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

function verdict(score: number) {
  if (score >= 85) return 'Production-ready instincts.';
  if (score >= 65) return 'Solid. A few habits to build.';
  if (score >= 40) return 'Good start. Read the notes, then try again.';
  return 'Tough one. The debrief shows exactly what to change.';
}

/** Score as a single-hue ring (one value, so no legend). */
function ScoreRing({ score }: { score: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative h-[168px] w-[168px] flex-none"
      role="img"
      aria-label={`Score ${score} out of 100`}
    >
      <svg viewBox="0 0 168 168" className="-rotate-90">
        <circle cx="84" cy="84" r={r} fill="none" stroke="#E2E8F0" strokeWidth="14" />
        <circle
          cx="84"
          cy="84"
          r={r}
          fill="none"
          stroke="#4F46E5"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-head text-5xl font-bold text-ink" data-testid="score">
            {score}
          </div>
          <div className="text-sm text-ink-muted">out of 100</div>
        </div>
      </div>
    </div>
  );
}

export function DebriefView({ d, guest }: { d: Debrief; guest: boolean }) {
  const summary = [
    d.resolvedBy === 'prevented'
      ? 'You spotted the risky change and fixed it before shipping, so production never broke.'
      : d.resolvedBy === 'rollback'
        ? `You restored service in ${duration(d.timeToRecoverSeconds ?? 0)} by rolling back.`
        : d.resolvedBy === 'hotfix'
          ? `You restored service in ${duration(d.timeToRecoverSeconds ?? 0)} with a hotfix.`
          : 'You shipped your change.',
    d.strategy === 'canary'
      ? 'A canary limited the blast radius.'
      : d.strategy === 'direct'
        ? 'You deployed directly to all traffic.'
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-6">
      {guest && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-0 bg-secondary text-slate-300">
          <div>
            <h2 className="text-xl font-bold text-white">Nice work! Save this result?</h2>
            <p className="text-sm">
              Create a free account to keep this score and your badges, and to unlock the full scenario
              library. Guest results are deleted after 24 hours.
            </p>
          </div>
          <Link href="/signup?claim=1" className={buttonClasses('primary', 'lg')}>
            Create free account
          </Link>
        </Card>
      )}

      <Card className="flex flex-wrap items-center gap-8">
        <ScoreRing score={d.score} />
        <div className="min-w-0 flex-1">
          {d.badges.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label="Badges earned">
              {d.badges.map((b) => (
                <li key={b.id} title={b.description}>
                  <Badge tone="primary">
                    🏅 {b.name}
                    {b.newlyEarned && (
                      <span className="ml-1 rounded bg-primary px-1 text-[10px] text-white">NEW</span>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <h2 className="text-2xl font-bold">{verdict(d.score)}</h2>
          <p className="mt-1 max-w-2xl text-ink-muted">{summary}</p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-ink-muted">Total time</dt>
              <dd className="font-mono font-semibold text-ink">{duration(d.totalSeconds)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Time to recover</dt>
              <dd className="font-mono font-semibold text-ink">
                {d.timeToRecoverSeconds === null
                  ? d.resolvedBy === 'prevented'
                    ? 'prevented'
                    : '—'
                  : duration(d.timeToRecoverSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Hints</dt>
              <dd className="font-mono font-semibold text-ink">
                {d.hintsUsed} {d.hintPenalty > 0 && <span className="text-bad-text">(−{d.hintPenalty})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Attempt</dt>
              <dd className="font-mono font-semibold text-ink">#{d.attemptNumber}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <h2 className="text-lg font-semibold">Rubric breakdown</h2>
          <ul className="mt-3 divide-y divide-surface-border" aria-label="Rubric">
            {d.rubric.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1.3fr)_minmax(80px,1fr)_auto] items-center gap-4 py-3.5"
                data-rubric={r.id}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-ink">
                    {SKILL_LABEL[r.skill]} <span className="font-normal text-ink-muted">· {r.label}</span>
                  </div>
                  <div className="text-xs text-ink-muted">{r.reason}</div>
                </div>
                <div className="h-2 rounded-full bg-slate-200" aria-hidden="true">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${(r.score / r.max) * 100}%` }}
                  />
                </div>
                <div className="text-right font-mono font-semibold text-ink">
                  {r.score}/{r.max}
                </div>
              </li>
            ))}
            {d.hintPenalty > 0 && (
              <li className="grid grid-cols-[minmax(0,1.3fr)_minmax(80px,1fr)_auto] items-center gap-4 py-3.5">
                <div className="font-semibold text-ink">
                  Hints used{' '}
                  <span className="font-normal text-ink-muted">
                    · {d.hintsUsed} × −{d.hintPenalty / Math.max(d.hintsUsed, 1)}
                  </span>
                </div>
                <div />
                <div className="text-right font-mono font-semibold text-bad-text">−{d.hintPenalty}</div>
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Your timeline</h2>
          <ol
            className="relative mt-4 space-y-4 border-l-2 border-surface-border pl-5"
            aria-label="Attempt timeline"
          >
            {d.timeline.map((m, i) => (
              <li key={i} className="relative text-sm">
                <span
                  className={`absolute -left-[31px] top-0 grid h-5 w-5 place-items-center rounded-full border-2 text-[10px] font-bold ${MOMENT[m.kind].dot}`}
                  aria-hidden="true"
                >
                  {MOMENT[m.kind].icon}
                </span>
                <span className="sr-only">{MOMENT[m.kind].sr}: </span>
                <span className="font-mono text-xs font-semibold text-ink-muted">
                  {clock(m.offsetSeconds)}
                </span>
                <div className="text-ink-body">{m.text}</div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="border-l-4 border-l-accent bg-accent-tint">
        <h2 className="text-lg font-semibold">💬 What a senior engineer would do differently</h2>
        {d.tips.length ? (
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {d.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">
            Honestly? Not much. You checked the release train, shipped safely and kept production healthy.
          </p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-xl font-semibold">What next</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/scenarios/${d.scenario.slug}`} className={buttonClasses('secondary')}>
            ⟲ Try this scenario again
          </Link>
          {!guest && (
            <Link href="/progress" className={buttonClasses('secondary')}>
              See your progress
            </Link>
          )}
        </div>
        {d.recommendations.length > 0 && !guest && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.recommendations.map((r) => (
              <Link
                key={r.slug}
                href={`/scenarios/${r.slug}`}
                className="rounded border border-surface-border bg-white p-4 shadow-card hover:border-primary"
              >
                <Badge>{r.difficulty}</Badge>
                <h3 className="mt-2 font-semibold">{r.title}</h3>
                <p className="text-sm text-ink-muted">{r.reason}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
