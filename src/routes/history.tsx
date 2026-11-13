import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { getPage, getTotalSaldo } from "../db/queries.js";
import { dateShort, t, weekday } from "../lib/i18n.js";
import {dailySaldo, dayActualHours, formatHM } from "../lib/time.js";

const PAGE_SIZE = 50;
const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presets() {
  const n = new Date();
  const [y, m, d] = [n.getFullYear(), n.getMonth(), n.getDate()];
  return [
    { key: "hist.q.7d", from: iso(new Date(y, m, d - 6)), to: iso(n) },
    { key: "hist.q.30d", from: iso(new Date(y, m, d - 29)), to: iso(n) },
    { key: "hist.q.month", from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) },
    { key: "hist.q.lastMonth", from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { key: "hist.q.year", from: `${y}-01-01`, to: `${y}-12-31` },
    { key: "hist.q.lastYear", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ] as const;
}

export const historyRoutes = new Hono();

historyRoutes.get("/history", async (c) => {
  const page = Math.max(1, Math.floor(Number(c.req.query("page"))) || 1);
  const from = validDate(c.req.query("from"));
  const to = validDate(c.req.query("to"));
  const { days, total } = await getPage((page - 1) * PAGE_SIZE, PAGE_SIZE, from, to);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const running = await Promise.all(days.map((d) => getTotalSaldo(d.entry.date)));
  const qs = (p: number) => `/history?page=${p}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return c.html(
    <Layout title={t("hist.title")} nav="/history">
      <h1 class="text-2xl font-bold mb-4">{t("hist.title")}</h1>
      <form method="get" action="/history" class="flex flex-wrap gap-2 items-end mb-4">
        <label class="floating-label"><span>{t("hist.from")}</span><input class="input input-sm sm:input-md" type="date" name="from" placeholder={t("hist.from")} value={from ?? ""} /></label>
        <label class="floating-label"><span>{t("hist.to")}</span><input class="input input-sm sm:input-md" type="date" name="to" placeholder={t("hist.to")} value={to ?? ""} /></label>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm sm:btn-md">{t("hist.filter")}</button>
          {(from || to) && <a href="/history" class="btn btn-sm sm:btn-md">{t("hist.clear")}</a>}
        </div>
      </form>
      <div class="flex flex-wrap gap-2 mb-4">
        {presets().map((p) => (
          <a href={`/history?from=${p.from}&to=${p.to}`} class={`btn btn-sm sm:btn-md ${p.from === from && p.to === to ? "btn-primary" : "btn-outline"}`}>{t(p.key)}</a>
        ))}
      </div>
      {days.length === 0 ? (
        <div class="alert" role="status">
          <span>{from || to ? t("hist.emptyRange") : t("hist.empty")} <a class="link" href="/">{t("hist.track")}</a></span>
        </div>
      ) : (
      <div class="overflow-x-auto"><table class="table table-xs sm:table-sm">
        <thead>
          <tr><th>{t("date")}</th><th class="text-right">{t("actual")}</th><th class="text-right">{t("target")}</th><th class="text-right">{t("saldo")}</th><th class="text-right">{t("hist.running")}</th><th>{t("note")}</th></tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const target = new Decimal(d.entry.targetHours);
            const actual = dayActualHours(d.blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours })));
            const wd = new Date(`${d.entry.date}T00:00:00Z`).getUTCDay();
            return (
              <tr class={wd === 0 || wd === 6 ? "opacity-60" : ""}>
                <td class="whitespace-nowrap"><a class="link" href={`/day/${d.entry.date}`}>{weekday(wd, "short")} {dateShort(d.entry.date)}</a></td>
                <td class="text-right">{actual ? formatHM(actual) : "—"}</td>
                <td class="text-right">{formatHM(target)}</td>
                <td class="text-right"><SaldoBadge value={dailySaldo(actual, target)} /></td>
                <td class="text-right"><SaldoBadge value={running[i]!} /></td>
                <td class="opacity-70">{d.entry.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      )}
      {totalPages > 1 && (
        <div class="join flex justify-center my-4">
          <a class={`join-item btn btn-sm sm:btn-md ${page > 1 ? "" : "btn-disabled"}`} href={qs(page - 1)}>{t("hist.prev")}</a>
          <span class="join-item btn btn-sm sm:btn-md no-animation pointer-events-none">{t("hist.page", { p: page, n: totalPages })}</span>
          <a class={`join-item btn btn-sm sm:btn-md ${page < totalPages ? "" : "btn-disabled"}`} href={qs(page + 1)}>{t("hist.next")}</a>
        </div>
      )}
      <div class="text-center text-sm opacity-70">{t("hist.total", { n: total })}</div>
    </Layout>,
  );
});
