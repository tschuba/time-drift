import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { getDay, getRange, getTotalSaldo } from "../db/queries.js";
import { dateLong, dateShort, t, weekday } from "../lib/i18n.js";
import {dailySaldo, dayActualHours, defaultTargetHours, formatHM } from "../lib/time.js";
import { BlocksSection, Ico, Lbl } from "./day.js";

// Local calendar date (server TZ), not UTC.
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/", async (c) => {
  const now = new Date();
  const today = iso(now);
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const [total, todayDay, recent] = await Promise.all([getTotalSaldo(), getDay(today), getRange(days[6]!, today)]);
  const byDate = new Map(recent.map((d) => [d.entry.date, d]));
  const toBlocks = (d: { blocks: { startTime: string; endTime: string | null; breakHours: string }[] }) =>
    d.blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }));

  const target = todayDay ? new Decimal(todayDay.entry.targetHours) : defaultTargetHours(today);
  const blocks = todayDay?.blocks ?? [];
  const actual = todayDay ? dayActualHours(toBlocks(todayDay)) : null;

  // Running blocks count up to now, so the stat is live.
  const nowT = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
  const todayActual = dayActualHours(toBlocks({ blocks }).map((b) => ({ ...b, end: b.end ?? nowT })));
  const todaySaldo = (todayActual ?? new Decimal(0)).minus(target);
  const todayBreak = blocks.reduce((s, b) => s.plus(b.breakHours), new Decimal(0));
  const cls = (v: Decimal) => (v.gt(0) ? "text-success" : v.lt(0) ? "text-error" : "");

  return c.html(
    <Layout title={t("nav.dashboard")} nav="/">
      <div class="stats bg-base-200 w-full mb-4">
        <div class="stat">
          <div class="stat-title">{t("dash.running")}</div>
          <div class={`stat-value ${total.gt(0) ? "text-success" : total.lt(0) ? "text-error" : ""}`}>{formatHM(total, true)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{t("dash.todaySaldo")}</div>
          <div class={`stat-value ${cls(todaySaldo)}`}>{formatHM(todaySaldo, true)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{t("dash.todayBreak")}</div>
          <div class="stat-value">{formatHM(todayBreak)}</div>
        </div>
      </div>

      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex flex-wrap justify-between gap-2 mb-2">
          <h2 class="font-semibold">{t("dash.today")} — {weekday(now.getDay(), "long")}, {dateLong(today)}</h2>
          <a class="btn btn-sm" href={`/day/${today}?from=dashboard`} aria-label={t("dash.fullEditor")} title={t("dash.fullEditor")}><Ico n="maximize" /><Lbl>{t("dash.fullEditor")}</Lbl></a>
        </div>
        <form method="post" action={`/day/${today}`}>
          <input type="hidden" name="return_to" value="/" />
          <div class="flex flex-wrap gap-3 items-center mb-3">
            <label class="floating-label">
              <span>{t("dash.targetH")}</span>
              <input class="input input-sm sm:input-md w-28" placeholder={t("dash.targetH")} type="number" inputmode="decimal" name="target_hours" value={target.toString()} step="0.5" min="0" max="24" />
            </label>
            <button class="btn btn-primary btn-sm" aria-label={t("save")} title={t("save")}><Ico n="save" /><Lbl>{t("save")}</Lbl></button>
            {actual && (
              <div>{t("dash.actualColon")} <strong>{formatHM(actual)}</strong> <SaldoBadge value={dailySaldo(actual, target)} /></div>
            )}
          </div>
          <input type="hidden" name="note" value={todayDay?.entry.note ?? ""} />
        </form>
        <div class="mt-4"><BlocksSection date={today} blocks={blocks} /></div>
      </div>

      <div class="card bg-base-200 p-4">
        <h2 class="font-semibold mb-2">{t("dash.last7")}</h2>
        <div class="overflow-x-auto"><table class="table table-xs sm:table-sm">
          <thead><tr><th>{t("date")}</th><th class="text-right">{t("actual")}</th><th class="text-right">{t("target")}</th><th class="text-right">{t("saldo")}</th></tr></thead>
          <tbody>
            {days.map((date) => {
              const d = byDate.get(date);
              const t = d ? new Decimal(d.entry.targetHours) : defaultTargetHours(date);
              const a = d ? dayActualHours(toBlocks(d)) : null;
              const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
              return (
                <tr class={wd === 0 || wd === 6 ? "opacity-60" : ""}>
                  <td class="whitespace-nowrap"><a class="link" href={`/day/${date}`}>{weekday(wd, "short")} {dateShort(date)}</a></td>
                  <td class="text-right">{a ? formatHM(a) : "—"}</td>
                  <td class="text-right">{formatHM(t)}</td>
                  <td class="text-right">{d && dailySaldo(a, t) && <SaldoBadge value={dailySaldo(a, t)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </Layout>,
  );
});
