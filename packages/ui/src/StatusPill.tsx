import { cx } from './cx';

export type SystemState = 'healthy' | 'deploying' | 'degraded' | 'down';

/** Status is never colour alone (NFR-07): every state has an icon AND a label. */
const STATE: Record<SystemState, { icon: string; label: string; light: string; dark: string }> = {
  healthy: { icon: '✓', label: 'healthy', light: 'bg-ok-tint text-ok-text', dark: 'text-ok-dark' },
  deploying: {
    icon: '⟳',
    label: 'deploying',
    light: 'bg-accent-tint text-accent-text',
    dark: 'text-accent-live',
  },
  degraded: { icon: '▲', label: 'degraded', light: 'bg-warn-tint text-warn-text', dark: 'text-warn-dark' },
  down: { icon: '✕', label: 'down', light: 'bg-bad-tint text-bad-text', dark: 'text-bad-dark' },
};

export function StatusPill({
  state,
  theme = 'light',
  className,
}: {
  state: SystemState;
  theme?: 'light' | 'dark';
  className?: string;
}) {
  const s = STATE[state];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        theme === 'light' ? s.light : s.dark,
        className,
      )}
    >
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}
