'use client';

import { useState } from 'react';

export interface TrendPoint {
  label: string;
  score: number;
  date: string;
}

const W = 640;
const H = 220;
const PAD = { top: 18, right: 44, bottom: 30, left: 36 };

/**
 * Score over completed attempts: one series, so one hue and no legend (the title names it).
 * 2px line, 8px markers, recessive grid, one 0–100 axis, the latest value labelled directly,
 * and a tooltip on hover/focus. The attempts table below is the table view of the same data.
 */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.score)}`).join(' ');
  const last = points.length - 1;
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Score trend: ${points.map((p) => p.score).join(', ')}`}
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#E2E8F0" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#64748B">
              {v}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={`x${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748B">
            #{i + 1}
          </text>
        ))}
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="#94A3B8"
            strokeDasharray="3 3"
          />
        )}
        <path d={path} fill="none" stroke="#4F46E5" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={`m${i}`}
            cx={x(i)}
            cy={y(p.score)}
            r={4}
            fill="#4F46E5"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        ))}
        <text x={x(last) + 8} y={y(points[last].score) + 4} fontSize="12" fontWeight={600} fill="#0F172A">
          {points[last].score}
        </text>
        {/* Hit targets larger than the marks, keyboard-focusable */}
        {points.map((p, i) => (
          <circle
            key={`h${i}`}
            cx={x(i)}
            cy={y(p.score)}
            r={16}
            fill="transparent"
            tabIndex={0}
            aria-label={`Attempt ${i + 1}: ${p.label}, score ${p.score}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>
      {h && hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-secondary px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(h.score) / H) * 100}%`, marginTop: -10 }}
        >
          <div className="font-semibold">{h.score} / 100</div>
          <div className="text-slate-300">
            {h.label} · {h.date}
          </div>
        </div>
      )}
    </div>
  );
}
