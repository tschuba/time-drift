import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout } from "../components/layout.js";
import { getRange } from "../db/queries.js";
import { BarChart, Heatmap, LineChart } from "../lib/charts.js";
import { dec, t, weekday } from "../lib/i18n.js";
import { blockActualHours } from "../lib/time.js";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sign = (n: number) => dec(n > 0 ? `+${n.toFixed(2)}` : n < 0 ? n.toFixed(2) : "±0.00");
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
  const byWd = Array.from({ length: 7 }, (_, wd) => avg(workdays.filter((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === wd).map((d) => d.actual)));
  const busiest = workdays.length ? weekday(byWd.indexOf(Math.max(...byWd)), "long") : t("an.na");
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
    [t("an.avgHours"), `${dec(avg(workdays.map((d) => d.actual).filter((a) => a > 0)).toFixed(2))}h`, null],
    [t("an.avgSaldo"), sign(avg(days.map((d) => d.saldo))), avg(days.map((d) => d.saldo))],
    [t("an.thisMonth"), sign(sumSaldo(today.slice(0, 7))), sumSaldo(today.slice(0, 7))],
    [t("an.thisYear"), sign(sumSaldo(today.slice(0, 4))), sumSaldo(today.slice(0, 4))],
    [t("an.busiest"), busiest!, null],
    [t("an.overtime"), `${dec(overtimePct.toFixed(1))}%`, null],
  ];

  return c.html(
    <Layout title={t("an.title")} nav="/analytics">
      <h1 class="text-2xl font-bold mb-4">{t("an.title")}</h1>
      <div class="stats grid grid-flow-row grid-cols-2 sm:grid-cols-3 bg-base-200 w-full mb-4">
        {stats.map(([label, value, n]) => (
          <div class="stat">
            <div class="stat-title">{label}</div>
            <div class={`stat-value text-2xl ${n === null ? "" : tone(n)}`}>{value}</div>
          </div>
        ))}
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex flex-wrap justify-between gap-2 mb-2">
          <h2 class="font-semibold">{t("an.trend")}</h2>
          <div class="join">
            {(["3m", "6m", "1y", "all"] as const).map((r) => (
              <a class={`btn btn-sm join-item ${r === range ? "btn-primary" : ""}`} href={`/analytics?range=${r}`}>{r === "all" ? t("an.all") : r.toUpperCase()}</a>
            ))}
          </div>
        </div>
        <LineChart points={trend} />
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <h2 class="font-semibold mb-2">{t("an.monthly")}</h2>
        <BarChart bars={[...monthly].sort().map(([label, v]) => ({ label, ...v }))} />
      </div>
      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex flex-wrap justify-between gap-2 mb-2">
          <h2 class="font-semibold">{t("an.intensity")} — {heatYear}</h2>
          <div class="flex gap-2">
            <a class="btn btn-sm" href={`/analytics?range=${range}&heatmap_year=${heatYear - 1}`}>← {heatYear - 1}</a>
            <a class="btn btn-sm" href={`/analytics?range=${range}&heatmap_year=${heatYear + 1}`}>{heatYear + 1} →</a>
          </div>
        </div>
        <div class="overflow-x-auto"><div class="min-w-[640px]"><Heatmap year={heatYear} days={heat} /></div></div>
        <div id="heat-info" class="text-sm mt-2 min-h-5" role="status" aria-live="polite">{t("an.heatHint")}</div>
        {/* Tap/click a cell: show its <title> text below; static script, text via textContent. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var i=document.getElementById("heat-info"),sel;document.querySelectorAll("svg rect").forEach(function(r){var t=r.querySelector("title");if(!t)return;r.addEventListener("click",function(){if(sel)sel.removeAttribute("stroke");sel=r;r.setAttribute("stroke","currentColor");i.textContent=t.textContent})})})()` }} />
      </div>
    </Layout>,
  );
});
