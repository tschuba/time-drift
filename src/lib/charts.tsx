import { dateLong, monthShort, t } from "./i18n.js";
import { formatHM } from "./time.js";
// Minimal inline-SVG charts, rendered server-side as hono/jsx.
export type Point = { label: string; value: number };
const W = 720;
const H = 240;
const PAD = { l: 40, r: 10, t: 24, b: 24 };
// Hover labels live in the reserved top band (PAD.t), so they never overlap the plot.
const anchor = (i: number, n: number) => (i < n * 0.15 ? "start" : i > n * 0.85 ? "end" : "middle");
const empty = () => <p class="opacity-60 p-4">{t("noData")}</p>;

function scale(min: number, max: number) {
  if (min === max) max = min + 1;
  return (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
}

/** `points[].label` is an ISO date. X ticks sit on month starts, thinned to ≤8 so they scale with the range. */
export function LineChart({ points }: { points: Point[] }) {
  if (!points.length) return empty();
  const vals = points.map((p) => p.value);
  const y = scale(Math.min(0, ...vals), Math.max(0, ...vals));
  const x = (i: number) => PAD.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const starts = points.flatMap((p, i) => (i && p.label.slice(0, 7) === points[i - 1]!.label.slice(0, 7) ? [] : [i]));
  const ticks = starts.filter((_, k) => k % Math.ceil(starts.length / 8) === 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full">
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.3" stroke-dasharray="4" />
      <text x={PAD.l - 4} y={y(0) + 4} text-anchor="end" font-size="10">0</text>
      <text x={PAD.l - 4} y={y(Math.max(0, ...vals)) + 4} text-anchor="end" font-size="10">{Math.max(0, ...vals).toFixed(0)}</text>
      <text x={PAD.l - 4} y={y(Math.min(0, ...vals)) + 4} text-anchor="end" font-size="10">{Math.min(0, ...vals).toFixed(0)}</text>
      <path d={path} fill="none" stroke="currentColor" stroke-width="2" />
      {ticks.map((i) => (
        <g>
          <line x1={x(i)} x2={x(i)} y1={H - PAD.b} y2={H - PAD.b + 4} stroke="currentColor" opacity="0.4" />
          <text x={x(i)} y={H - 6} font-size="10" text-anchor={i === 0 ? "start" : "middle"}>{monthShort(points[i]!.label.slice(0, 7))}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const w = (W - PAD.l - PAD.r) / Math.max(1, points.length - 1);
        return (
          <g class="group">
            <rect x={x(i) - w / 2} y={PAD.t} width={w} height={H - PAD.t - PAD.b} fill="transparent" />
            <g class="opacity-0 group-hover:opacity-100 pointer-events-none">
              <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" opacity="0.4" />
              <circle cx={x(i)} cy={y(p.value)} r="4" fill="currentColor" />
              <text x={x(i)} y={14} font-size="11" font-weight="bold" text-anchor={anchor(i, points.length)}>
                {dateLong(p.label)}: {formatHM(p.value, true)}
              </text>
            </g>
          </g>
        );
      })}
      {!ticks.length && <text x={PAD.l} y={H - 6} font-size="10">{dateLong(points[0]!.label)}</text>}
    </svg>
  );
}

export function BarChart({ bars }: { bars: { label: string; actual: number; target: number }[] }) {
  if (!bars.length) return empty();
  const max = Math.max(1, ...bars.flatMap((b) => [b.actual, b.target]));
  const y = scale(0, max);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.min(20, slot / 2.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full">
      <text x={PAD.l - 4} y={y(max) + 4} text-anchor="end" font-size="10">{max.toFixed(0)}</text>
      <text x={PAD.l - 4} y={y(0)} text-anchor="end" font-size="10">0</text>
      {bars.map((b, i) => {
        const cx = PAD.l + slot * (i + 0.5);
        return (
          <g class="group">
            <rect x={cx - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="currentColor" opacity="0" class="group-hover:opacity-10" />
            <rect x={cx - bw} y={y(b.target)} width={bw} height={y(0) - y(b.target)} fill="currentColor" opacity="0.25" />
            <rect x={cx} y={y(b.actual)} width={bw} height={y(0) - y(b.actual)} fill="currentColor" />
            {(bars.length <= 12 || i % Math.ceil(bars.length / 12) === 0) && (
              <text x={cx} y={H - 6} font-size="9" text-anchor="middle">{b.label}</text>
            )}
            <text x={cx} y={14} font-size="11" font-weight="bold" text-anchor={anchor(i, bars.length)} class="opacity-0 group-hover:opacity-100 pointer-events-none">
              {b.label}: {formatHM(b.actual)} / {formatHM(b.target)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** GitHub-style grid: columns = weeks (Mon-first), rows = weekdays. `days` maps YYYY-MM-DD -> hours. */
export function Heatmap({ year, days }: { year: number; days: Map<string, number> }) {
  const cell = 12;
  const start = new Date(Date.UTC(year, 0, 1));
  const cells = [];
  for (let d = new Date(start); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const row = (d.getUTCDay() + 6) % 7;
    const col = Math.floor((Math.round((d.getTime() - start.getTime()) / 864e5) + (start.getUTCDay() + 6) % 7) / 7);
    const h = days.get(iso);
    const opacity = h === undefined ? 0.06 : h <= 0 ? 0.1 : Math.min(1, 0.25 + h / 12);
    cells.push(
      <rect x={col * (cell + 2)} y={row * (cell + 2)} width={cell} height={cell} rx="2" fill="currentColor" opacity={opacity}>
        <title>{dateLong(iso)}{h === undefined ? "" : `: ${formatHM(h)}`}</title>
      </rect>,
    );
  }
  return <svg viewBox={`0 0 ${54 * (cell + 2)} ${7 * (cell + 2)}`} class="w-full">{cells}</svg>;
}
