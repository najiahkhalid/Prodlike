import type { NodeState } from '@prodlike/shared';

/** One source of truth for how a system state looks: colour + icon + label (never colour alone, NFR-07). */
export const STATE_STYLE: Record<
  NodeState,
  { icon: string; label: string; colour: string; fill: string; text: string }
> = {
  healthy: { icon: '✓', label: 'healthy', colour: '#22C55E', fill: '#166534', text: 'text-ok-dark' },
  deploying: { icon: '⟳', label: 'deploying', colour: '#22D3EE', fill: '#155E75', text: 'text-accent-live' },
  degraded: { icon: '▲', label: 'degraded', colour: '#F59E0B', fill: '#92400E', text: 'text-warn-dark' },
  down: { icon: '✕', label: 'down', colour: '#F87171', fill: '#991B1B', text: 'text-bad-dark' },
};

/** True when the browser can render WebGL (otherwise the map falls back to 2D, NFR-05). */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
