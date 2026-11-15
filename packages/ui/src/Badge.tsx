import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'ok' | 'warn' | 'bad';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-ink-body',
  primary: 'bg-primary-tint text-primary-hover',
  accent: 'bg-accent-tint text-accent-text',
  ok: 'bg-ok-tint text-ok-text',
  warn: 'bg-warn-tint text-warn-text',
  bad: 'bg-bad-tint text-bad-text',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Difficulty → badge tone, as in the prototype catalogue. */
export const difficultyTone = {
  beginner: 'ok',
  intermediate: 'warn',
  advanced: 'bad',
} as const satisfies Record<string, BadgeTone>;
