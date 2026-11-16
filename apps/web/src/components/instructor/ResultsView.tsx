import Link from 'next/link';
import { Badge, Card } from '@prodlike/ui';
import type { AssignmentResults } from '@prodlike/shared';

const duration = (s: number | null) =>
  s === null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/**
 * Score distribution: one measure across 10 ordered buckets, so a single-hue bar chart with
 * thin rounded bars, a 0 baseline and counts labelled on the bars that have learners.
 */
function Distribution({ data }: { data: AssignmentResults['summary']['distribution'] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 420;
  const H = 150;
  const bw = W / data.length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 22}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Score distribution: ${data.map((d) => `${d.bucket}: ${d.count}`).join(', ')}`}
    >
      <line x1={0} x2={W} y1={H} y2={H} stroke="#CBD5E1" />
      {data.map((d, i) => {
        const h = (d.count / max) * (H - 20);
        const x = i * bw + 2;
        return (
          <g key={d.bucket}>
            <title>{`${d.bucket}: ${d.count} learner${d.count === 1 ? '' : 's'}`}</title>
            {d.count > 0 && (
              <path d={`M${x},${H} V${H - h + 4} q0,-4 4,-4 h${bw - 12} q4,0 4,4 V${H} Z`} fill="#4F46E5" />
            )}
            {d.count > 0 && (
              <text
                x={x + (bw - 4) / 2}
                y={H - h - 5}
                textAnchor="middle"
                fontSize="11"
                fontWeight={600}
                fill="#0F172A"
              >
                {d.count}
              </text>
            )}
            <text x={x + (bw - 4) / 2} y={H + 15} textAnchor="middle" fontSize="10" fill="#64748B">
              {d.bucket === '90-100' ? '90+' : d.bucket.split('-')[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** FR-18: one assignment's results, for the instructor. */
export function ResultsView({ r }: { r: AssignmentResults }) {
  const s = r.summary;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.6fr]">
      <Card>
        <h3 className="text-lg font-semibold">Class summary</h3>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-muted">Completed</dt>
            <dd className="font-head text-2xl font-bold text-ink" data-testid="completed-count">
              {s.completed} / {s.learners}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Average score</dt>
            <dd className="font-head text-2xl font-bold text-ink">{s.averageScore ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Median time to recover</dt>
            <dd className="font-mono font-semibold text-ink">{duration(s.medianTimeToRecoverSeconds)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Deadline</dt>
            <dd className="font-semibold text-ink">
              {r.assignment.dueAt ? date(r.assignment.dueAt) : 'None'}
            </dd>
          </div>
        </dl>
        <h4 className="mt-5 text-sm font-semibold">Score distribution</h4>
        <p className="text-xs text-ink-muted">Best score per learner, number of learners per band</p>
        <div className="mt-2">
          <Distribution data={s.distribution} />
        </div>
        {s.commonMisses.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="text-ink-muted">Most often missed: </span>
            <b className="text-ink">{s.commonMisses[0].label}</b>{' '}
            <span className="text-ink-muted">
              ({s.commonMisses[0].missedBy} learner{s.commonMisses[0].missedBy === 1 ? '' : 's'})
            </span>
          </p>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h3 className="text-lg font-semibold">Learner results</h3>
          <a
            href={`/api/instructor/assignments/${r.assignment.id}/results.csv`}
            className="rounded-sm border border-surface-border px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-slate-100"
            download
          >
            ⬇ Export CSV
          </a>
        </div>
        {r.rows.length === 0 ? (
          <p className="px-5 pb-5 text-ink-muted">No learners yet. Share the class join code.</p>
        ) : (
          <table className="w-full text-sm" aria-label="Learner results">
            <thead>
              <tr className="border-y border-surface-border text-left text-xs uppercase tracking-wider text-ink-muted">
                <th className="px-5 py-2.5">Learner</th>
                <th className="px-3 py-2.5">Best</th>
                <th className="px-3 py-2.5">Attempts</th>
                <th className="px-3 py-2.5">Recovery</th>
                <th className="px-3 py-2.5">Strategy</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.learner.id} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{row.learner.name}</div>
                    <div className="text-xs text-ink-muted">{row.learner.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    {row.bestScore === null ? (
                      <Badge>Not done</Badge>
                    ) : (
                      <Badge tone={row.bestScore >= 80 ? 'ok' : row.bestScore >= 50 ? 'primary' : 'warn'}>
                        {row.bestScore}
                      </Badge>
                    )}
                    {row.late && (
                      <span className="ml-1.5 text-xs font-semibold text-bad-text" title="After the deadline">
                        ⚑ late
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono">{row.attempts}</td>
                  <td className="px-3 py-3 font-mono">{duration(row.timeToRecoverSeconds)}</td>
                  <td className="px-3 py-3 capitalize">{row.strategy ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {row.bestAttemptId && (
                      <Link
                        href={`/instructor/attempts/${row.bestAttemptId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Debrief
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
