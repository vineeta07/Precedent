import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { DashboardSummary } from '../api';
import { monthLabel } from '../lib/format';
import { EASE } from './ui';

/** Keep-rate ring: one headline number, so it is a meter, not a chart with axes. */
export function KeepRing({ rate, kept, missed }: { rate: number | null; kept: number; missed: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = rate === null ? 0 : Math.max(0, Math.min(100, rate)) / 100;
  const reduce = useReducedMotion();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={rate === null ? 'No promise has come due yet' : `Promise keep rate ${rate}%`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--chart-track)" strokeWidth="9" />
        <motion.circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="var(--chart-kept)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          transform="rotate(-90 66 66)"
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.3, ease: EASE, delay: 0.15 }}
        />
        <text x="66" y="64" textAnchor="middle" style={{ font: '420 30px var(--font-display)', fill: 'var(--ink)', letterSpacing: '-0.03em' }}>
          {rate === null ? '—' : `${Math.round(rate)}%`}
        </text>
        <text x="66" y="84" textAnchor="middle" style={{ font: '600 10px var(--font-body)', fill: 'var(--ink-faint)', letterSpacing: '0.12em' }}>
          KEPT
        </text>
      </svg>
      <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <div>
          <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--chart-kept)', marginRight: 8 }} />
          <b className="num">{kept}</b> <span className="muted">kept</span>
        </div>
        <div>
          <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--chart-missed)', marginRight: 8 }} />
          <b className="num">{missed}</b> <span className="muted">broken or overdue</span>
        </div>
        <div className="faint" style={{ fontSize: 12, maxWidth: 190 }}>
          Counts only promises that have come due.
        </div>
      </div>
    </div>
  );
}

/** Promises by due month: kept vs missed. Two series, one axis, grouped thin bars with a hover tooltip. */
export function MonthBars({ months }: { months: DashboardSummary['months'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 190;
  const pad = { l: 28, r: 8, t: 10, b: 26 };
  const max = Math.max(2, ...months.map((m) => Math.max(m.kept, m.missed)));
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  const band = (W - pad.l - pad.r) / months.length;
  const bar = Math.min(16, band / 3.2);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const base = y(0);
  const tip = hover !== null ? months[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Promises kept and missed by due month" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth="1" strokeDasharray={t === 0 ? undefined : '2 4'} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" style={{ font: '500 10px var(--font-mono)', fill: 'var(--ink-faint)' }}>
              {t}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = pad.l + band * i + band / 2;
          const bars = [
            { v: m.kept, x: cx - bar - 1, fill: 'var(--chart-kept)' },
            { v: m.missed, x: cx + 1, fill: 'var(--chart-missed)' },
          ];
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill={hover === i ? 'var(--stone-soft)' : 'transparent'} opacity="0.6" rx="6" />
              {bars.map((b, j) =>
                b.v > 0 ? (
                  <motion.path
                    key={j}
                    d={roundedBar(b.x, y(b.v), bar, base - y(b.v), 4)}
                    fill={b.fill}
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.05 * i + 0.06 * j, ease: EASE }}
                    style={{ transformOrigin: `${b.x + bar / 2}px ${base}px`, transformBox: 'view-box' }}
                  />
                ) : null,
              )}
              <text x={cx} y={H - 8} textAnchor="middle" style={{ font: '500 11px var(--font-body)', fill: hover === i ? 'var(--ink)' : 'var(--ink-faint)' }}>
                {monthLabel(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && hover !== null ? (
        <div className="chart-tip" style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, top: `${(y(Math.max(tip.kept, tip.missed)) / H) * 100}%` }}>
          <b>{monthLabel(tip.month)} {tip.month.slice(0, 4)}</b>
          {tip.kept} kept · {tip.missed} missed
        </div>
      ) : null}
      <table className="sr-only">
        <caption>Promises by due month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Kept</th>
            <th>Missed</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{m.month}</td>
              <td>{m.kept}</td>
              <td>{m.missed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function roundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`;
}
