import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout } from "../components/layout.js";
import { getRange } from "../db/queries.js";
import { BarChart, Heatmap, LineChart } from "../lib/charts.js";
import { blockActualHours } from "../lib/time.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sign = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n < 0 ? n.toFixed(2) : "±0.00");
const tone = (n: number) => (n > 0 ? "text-success" : n < 0 ? "text-error" : "");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const analyticsRoutes = new Hono();

analyticsRoutes.get("/analytics", async (c) => {
  const now = new Date();
  const today = iso(now);
  const range = ["3m", "6m", "1y", "all"].includes(c.req.query("range") ?? "") ? c.req.query("range")! : "1y";
  const heatYear = Math.floor(Number(c.req.query("heatmap_year"))) || now.getFullYear();
  const months = { "3m": 3, "6m": 6, "1y": 12, all: 0 }[range]!;
  const from = months ? iso(new Date(now.getFullYear(), now.getMonth() - months, now.getDate())) : "0001-01-01";

  // Like the legacy SQL, running (open) blocks are ignored.
  const days = (await getRange("0001-01-01", "9999-12-31")).map((d) => {
    const actual = d.blocks.reduce((s, b) => s.plus(blockActualHours(b.startTime, b.endTime, b.breakHours) ?? 0), new Decimal(0)).toNumber();
    const target = Number(d.entry.targetHours);
    return { date: d.entry.date, actual, target, saldo: actual - target };
  });

  const workdays = days.filter((d) => d.target > 0);
  const byWd = DAYS.map((_, wd) => avg(workdays.filter((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === wd).map((d) => d.actual)));
  const busiest = workdays.length ? DAYS[byWd.indexOf(Math.max(...byWd))] : "N/A";
  const sumSaldo = (prefix: string) => days.filter((d) => d.date.startsWith(prefix) && d.date <= today).reduce((s, d) => s + d.saldo, 0);
  const overtimePct = workdays.length ? (100 * workdays.filter((d) => d.actual > d.target).length) / workdays.length : 0;

  let cum = 0;
  const trend = days.map((d) => ({ label: d.date, value: (cum += d.saldo) })).filter((p) => p.label >= from && p.label <= today);
  const monthly = new Map<string, { actual: number; target: number }>();
  for (const d of days.filter((d) => d.date >= from && d.date <= today)) {
    const m = monthly.get(d.date.slice(0, 7)) ?? { actual: 0, target: 0 };
    m.actual += d.actual;
    m.target += d.target;
    monthly.set(d.date.slice(0, 7), m);
  }
  const heat = new Map(days.filter((d) => d.date.startsWith(`${heatYear}-`)).map((d) => [d.date, d.actual]));

  const stats: [string, string, number | null][] = [
    ["Avg Hours / Workday", `${avg(workdays.map((d) => d.actual).filter((a) => a > 0)).toFixed(2)}h`, null],
    ["Avg Daily Saldo", sign(avg(days.map((d) => d.saldo))), avg(days.map((d) => d.saldo))],
    ["This Month", sign(sumSaldo(today.slice(0, 7))), sumSaldo(today.slice(0, 7))],
    ["This Year", sign(sumSaldo(today.slice(0, 4))), sumSaldo(today.slice(0, 4))],
    ["Busiest Day", busiest!, null],
    ["Overtime Frequency", `${overtimePct.toFixed(1)}%`, null],
  ];

  return c.html(
    <Layout title="Analytics">
      <h1 class="text-2xl font-bold mb-4">Analytics</h1>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {stats.map(([label, value, n]) => (
          <div class="card bg-base-200 p-4">
            <div class={`text-2xl ${n === null ? "" : tone(n)}`}>{value}</div>
            <div class="text-sm opacity-70">{label}</div>
          </div>
        ))}
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex justify-between mb-2">
          <h2 class="font-semibold">Saldo Trend</h2>
          <div class="join">
            {(["3m", "6m", "1y", "all"] as const).map((r) => (
              <a class={`btn btn-sm join-item ${r === range ? "btn-primary" : ""}`} href={`/analytics?range=${r}`}>{r === "all" ? "All" : r.toUpperCase()}</a>
            ))}
          </div>
        </div>
        <LineChart points={trend} />
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <h2 class="font-semibold mb-2">Monthly Hours (Actual vs Target)</h2>
        <BarChart bars={[...monthly].sort().map(([label, v]) => ({ label, ...v }))} />
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex justify-between mb-2">
          <h2 class="font-semibold">Work Intensity — {heatYear}</h2>
          <div class="flex gap-2">
            <a class="btn btn-sm" href={`/analytics?range=${range}&heatmap_year=${heatYear - 1}`}>← {heatYear - 1}</a>
            <a class="btn btn-sm" href={`/analytics?range=${range}&heatmap_year=${heatYear + 1}`}>{heatYear + 1} →</a>
          </div>
        </div>
        <Heatmap year={heatYear} days={heat} />
      </div>
    </Layout>,
  );
});
