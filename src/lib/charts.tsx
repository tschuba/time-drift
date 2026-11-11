// Minimal inline-SVG charts, rendered server-side as hono/jsx.
export type Point = { label: string; value: number };
const W = 720;
const H = 240;
const PAD = { l: 40, r: 10, t: 10, b: 24 };
const empty = <p class="opacity-60 p-4">No data</p>;

function scale(min: number, max: number) {
  if (min === max) max = min + 1;
  return (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
}

export function LineChart({ points }: { points: Point[] }) {
  if (!points.length) return empty;
  const vals = points.map((p) => p.value);
  const y = scale(Math.min(0, ...vals), Math.max(0, ...vals));
  const x = (i: number) => PAD.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="w-full">
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.3" stroke-dasharray="4" />
      <text x={PAD.l - 4} y={y(0) + 4} text-anchor="end" font-size="10">0</text>
      <text x={PAD.l - 4} y={y(Math.max(0, ...vals)) + 4} text-anchor="end" font-size="10">{Math.max(0, ...vals).toFixed(0)}</text>
      <text x={PAD.l - 4} y={y(Math.min(0, ...vals)) + 4} text-anchor="end" font-size="10">{Math.min(0, ...vals).toFixed(0)}</text>
      <path d={path} fill="none" stroke="currentColor" stroke-width="2" />
      <text x={PAD.l} y={H - 6} font-size="10">{points[0]!.label}</text>
      <text x={W - PAD.r} y={H - 6} font-size="10" text-anchor="end">{points.at(-1)!.label}</text>
    </svg>
  );
}

export function BarChart({ bars }: { bars: { label: string; actual: number; target: number }[] }) {
  if (!bars.length) return empty;
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
          <g>
            <rect x={cx - bw} y={y(b.target)} width={bw} height={y(0) - y(b.target)} fill="currentColor" opacity="0.25" />
            <rect x={cx} y={y(b.actual)} width={bw} height={y(0) - y(b.actual)} fill="currentColor" />
            {(bars.length <= 12 || i % Math.ceil(bars.length / 12) === 0) && (
              <text x={cx} y={H - 6} font-size="9" text-anchor="middle">{b.label.slice(2)}</text>
            )}
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
        <title>{iso}{h === undefined ? "" : `: ${h.toFixed(2)}h`}</title>
      </rect>,
    );
  }
  return <svg viewBox={`0 0 ${54 * (cell + 2)} ${7 * (cell + 2)}`} class="w-full">{cells}</svg>;
}
