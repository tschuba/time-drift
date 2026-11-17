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
  let from = validDate(c.req.query("from"));
  let to = validDate(c.req.query("to"));
  if (from && to && from > to) [from, to] = [to, from]; // von <= bis
  const { days, total } = await getPage((page - 1) * PAGE_SIZE, PAGE_SIZE, from, to);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const running = await Promise.all(days.map((d) => getTotalSaldo(d.entry.date)));
  const qs = (p: number) => `/history?page=${p}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`;

  return c.html(
    <Layout title={t("hist.title")} nav="/history">
      <h1 class="text-2xl font-bold mb-4">{t("hist.title")}</h1>
      <form method="get" action="/history" class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-end mb-4">
        <label class="floating-label relative sm:w-56 max-sm:order-1">
          <span>{t("hist.from")}</span><input class="input input-md w-full pr-26 max-sm:pr-21 max-sm:pl-2 max-sm:text-sm [&::-webkit-calendar-picker-indicator]:hidden" type="date" name="from" placeholder={t("hist.from")} value={from ?? ""} />
          <div class="absolute right-0 top-1/2 -translate-y-1/2 flex">
          <button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-pick="from" aria-label={t("hist.pick")} title={t("hist.pick")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg></button><button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-today="from" aria-label={t("hist.today")} title={t("hist.today")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.971 11.278a9 9 0 1 0 -8.313 9.698" /><path d="M12 7v5l1.5 1.5" /><path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879" /><path d="M19 18v.01" /></svg></button>
          <button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-clear="from" aria-label={t("hist.clearField")} title={t("hist.clearField")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>
        </label>
        <div class="join max-sm:order-3"><button type="button" id="hist-eq" class="join-item btn btn-md btn-square" disabled={!from === !to} aria-label={t("hist.equal")} title={t("hist.equal")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10h14" /><path d="M5 14h14" /></svg></button><button type="button" id="hist-swap" class="join-item btn btn-md btn-square" disabled={!from === !to} aria-label={t("hist.swap")} title={t("hist.swap")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10h14l-4 -4" /><path d="M17 14h-14l4 4" /></svg></button></div>
        <label class="floating-label relative sm:w-56 max-sm:order-2">
          <span>{t("hist.to")}</span><input class="input input-md w-full pr-26 max-sm:pr-21 max-sm:pl-2 max-sm:text-sm [&::-webkit-calendar-picker-indicator]:hidden" type="date" name="to" placeholder={t("hist.to")} value={to ?? ""} />
          <div class="absolute right-0 top-1/2 -translate-y-1/2 flex">
          <button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-pick="to" aria-label={t("hist.pick")} title={t("hist.pick")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg></button><button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-today="to" aria-label={t("hist.today")} title={t("hist.today")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.971 11.278a9 9 0 1 0 -8.313 9.698" /><path d="M12 7v5l1.5 1.5" /><path d="M21.121 20.121a3 3 0 1 0 -4.242 0c.418 .419 1.125 1.045 2.121 1.879c1.051 -.89 1.759 -1.516 2.121 -1.879" /><path d="M19 18v.01" /></svg></button>
          <button type="button" class="btn btn-ghost btn-square size-8 max-sm:size-7" data-clear="to" aria-label={t("hist.clearField")} title={t("hist.clearField")}><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>
        </label>
        <div class="flex gap-2 max-sm:order-4 max-sm:justify-end">
          <button class="btn btn-primary btn-md icon-only:btn-square" aria-label={t("hist.filter")} title={t("hist.filter")}><svg class="w-5 h-5 hidden icon-only:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg><span class="icon-only:hidden">{t("hist.filter")}</span></button>
          {(from || to) && <a href="/history" class="btn btn-md icon-only:btn-square" aria-label={t("hist.clear")} title={t("hist.clear")}><svg class="w-5 h-5 hidden icon-only:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg><span class="icon-only:hidden">{t("hist.clear")}</span></a>}
        </div>
        <div class="flex gap-2 sm:flex-wrap sm:basis-full max-sm:order-5 max-sm:col-span-2 max-sm:overflow-x-auto max-sm:scrollbar-none scroll-fade">
          {presets().map((p) => (
            <a href={`/history?from=${p.from}&to=${p.to}`} class={`btn btn-sm shrink-0 ${p.from === from && p.to === to ? "btn-primary" : "btn-outline"}`}>{t(p.key)}</a>
          ))}
        </div>
      </form>
      <script dangerouslySetInnerHTML={{ __html: `(function(){var f=document.querySelector("input[name=from]"),t=document.querySelector("input[name=to]"),q=document.getElementById("hist-eq"),w=document.getElementById("hist-swap");function sync(){t.min=f.value;f.max=t.value;q.disabled=!f.value===!t.value;w.disabled=q.disabled}function today(){var n=new Date();return n.getFullYear()+"-"+String(n.getMonth()+1).padStart(2,"0")+"-"+String(n.getDate()).padStart(2,"0")}var i={from:f,to:t};document.querySelectorAll("[data-today]").forEach(function(b){b.onclick=function(){i[b.dataset.today].value=today();sync()}});document.querySelectorAll("[data-pick]").forEach(function(b){b.onclick=function(){i[b.dataset.pick].showPicker()}});document.querySelectorAll("[data-clear]").forEach(function(b){b.onclick=function(){i[b.dataset.clear].value="";sync()}});w.onclick=function(){var v=f.value;f.value=t.value;t.value=v;sync()};q.onclick=function(){if(f.value)t.value=f.value;else f.value=t.value;sync()};f.oninput=t.oninput=sync;sync()})()` }} />
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
          <a class={`join-item btn btn-md ${page > 1 ? "" : "btn-disabled"}`} href={qs(page - 1)}>{t("hist.prev")}</a>
          <span class="join-item btn btn-md no-animation pointer-events-none">{t("hist.page", { p: page, n: totalPages })}</span>
          <a class={`join-item btn btn-md ${page < totalPages ? "" : "btn-disabled"}`} href={qs(page + 1)}>{t("hist.next")}</a>
        </div>
      )}
      <div class="text-center text-sm opacity-70">{t("hist.total", { n: total })}</div>
    </Layout>,
  );
});
