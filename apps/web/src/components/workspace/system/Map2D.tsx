'use client';

import type { EngineSnapshot } from '@prodlike/shared';
import { STATE_STYLE } from './states';

/**
 * Flat system map (A2 refinement 2: a user choice, and the WebGL fallback, NFR-05).
 * Ported from the prototype's 2D renderer; positions come from the scenario's architecture graph.
 */
export function Map2D({ engine }: { engine: EngineSnapshot }) {
  const xs = engine.layout.map((n) => n.x);
  const ys = engine.layout.map((n) => n.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 440;
  const H = 280;
  const px = (x: number) => 56 + ((x - minX) / Math.max(maxX - minX, 1)) * (W - 112);
  const py = (y: number) => 46 + ((y - minY) / Math.max(maxY - minY, 1)) * (H - 92);
  const pos = new Map(engine.layout.map((n) => [n.id, [px(n.x), py(n.y)] as const]));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="System map, 2D view">
      {engine.edges.map(([a, b]) => {
        const [x1, y1] = pos.get(a)!;
        const [x2, y2] = pos.get(b)!;
        const hot = [a, b].some((id) => engine.nodes[id] === 'down' || engine.nodes[id] === 'degraded');
        const live = [a, b].some((id) => engine.nodes[id] === 'deploying');
        return (
          <g key={`${a}-${b}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeWidth={2} />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={hot ? '#F87171' : live ? '#22D3EE' : '#22C55E'}
              strokeOpacity={hot || live ? 0.9 : 0.35}
              strokeWidth={2}
              strokeDasharray="5 7"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="24"
                to="0"
                dur={hot ? '2.4s' : '1s'}
                repeatCount="indefinite"
              />
            </line>
          </g>
        );
      })}
      {engine.layout.map((n) => {
        const [x, y] = pos.get(n.id)!;
        const st = STATE_STYLE[engine.nodes[n.id] ?? 'healthy'];
        const pulse = engine.nodes[n.id] === 'down' || engine.nodes[n.id] === 'deploying';
        return (
          <g key={n.id} data-node={n.id} data-state={engine.nodes[n.id]}>
            <rect
              x={x - 48}
              y={y - 21}
              width={96}
              height={42}
              rx={8}
              fill="#1E293B"
              stroke={st.colour}
              strokeWidth={2}
            >
              {pulse && (
                <animate
                  attributeName="stroke-opacity"
                  values="1;.25;1"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              )}
            </rect>
            <text x={x} y={y - 3} textAnchor="middle" fontSize="10.5" fontWeight={600} fill="#E2E8F0">
              {n.label}
            </text>
            <text x={x} y={y + 12} textAnchor="middle" fontSize="10" fontWeight={600} fill={st.colour}>
              {st.icon} {st.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
