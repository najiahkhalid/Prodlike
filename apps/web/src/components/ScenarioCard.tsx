import Link from 'next/link';
import { Badge, difficultyTone } from '@prodlike/ui';
import type { ScenarioSummary } from '@prodlike/shared';

const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

export function ScenarioCard({ s, href }: { s: ScenarioSummary; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col rounded border border-surface-border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={difficultyTone[s.difficulty]}>{LEVEL[s.difficulty]}</Badge>
        {!s.published && <Badge>Draft</Badge>}
      </div>
      <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
      <p className="mb-2.5 text-[13px] text-ink-muted">{s.company}</p>
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {s.skills.map((k) => (
          <Badge key={k}>{k}</Badge>
        ))}
      </div>
      <div className="mt-auto flex justify-between border-t border-surface-border pt-3 text-[13px] text-ink-muted">
        <span>⏱ ~{s.estimatedMinutes} min</span>
        <span>
          {s.bestScore === null ? (
            'Not attempted'
          ) : (
            <>
              Best: <b className="text-ink">{s.bestScore}%</b>
            </>
          )}
        </span>
      </div>
    </Link>
  );
}
