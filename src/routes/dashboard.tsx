import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { getDay, getRange, getTotalSaldo } from "../db/queries.js";
import { dateLong, dateShort, t, weekday } from "../lib/i18n.js";
import { dailySaldo, dayActualHours, defaultTargetHours, formatHours, formatSaldo } from "../lib/time.js";
import { BlockRow, hhmm, num } from "./day.js";

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

  return c.html(
    <Layout title={t("nav.dashboard")} nav="/">
      <div class="stats bg-base-200 w-full mb-4">
        <div class="stat">
          <div class="stat-title">{t("dash.running")}</div>
          <div class={`stat-value ${total.gt(0) ? "text-success" : total.lt(0) ? "text-error" : ""}`}>{formatSaldo(total)}h</div>
        </div>
      </div>

      <div class="card bg-base-200 p-4 mb-4">
        <div class="flex flex-wrap justify-between gap-2 mb-2">
          <h2 class="font-semibold">{t("dash.today")} — {weekday(now.getDay(), "long")}, {dateLong(today)}</h2>
          <a class="btn btn-sm" href={`/day/${today}?from=dashboard`}>{t("dash.fullEditor")}</a>
        </div>
        <form method="post" action={`/day/${today}`}>
          <input type="hidden" name="return_to" value="/" />
          <div class="flex gap-4 items-end mb-2">
            <label class="flex flex-col gap-1">
              <span class="text-sm opacity-70">{t("dash.targetH")}</span>
              <input class="input input-bordered w-24" type="number" name="target_hours" value={target.toString()} step="0.5" min="0" max="24" />
            </label>
            {actual && (
              <div>{t("dash.actualColon")} <strong>{formatHours(actual)}h</strong> <SaldoBadge value={dailySaldo(actual, target)} /></div>
            )}
          </div>
          <div id="blocks-container">
            {(blocks.length ? blocks : [null]).map((b) => (
              <BlockRow start={hhmm(b?.startTime ?? null)} end={hhmm(b?.endTime ?? null)} brk={b ? num(b.breakHours) : ""} />
            ))}
          </div>
          <input type="hidden" name="note" value={todayDay?.entry.note ?? ""} />
          <div class="flex gap-2 mt-2">
            <button type="button" class="btn btn-sm" hx-get={`/day/${today}/add-block`} hx-target="#blocks-container" hx-swap="beforeend">{t("dash.addBlock")}</button>
            <button class="btn btn-primary btn-sm">{t("save")}</button>
          </div>
        </form>
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
                  <td class="text-right">{a ? formatHours(a) : "—"}</td>
                  <td class="text-right">{formatHours(t)}</td>
                  <td class="text-right"><SaldoBadge value={d ? dailySaldo(a, t) : t.neg()} /></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </Layout>,
  );
});
