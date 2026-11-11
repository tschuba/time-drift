import Decimal from "decimal.js";
import { Hono } from "hono";
import { ErrorPage, Layout, SaldoBadge } from "../components/layout.js";
import { getRange } from "../db/queries.js";
import { dec, monthYear, t, weekday } from "../lib/i18n.js";
import {dailySaldo, dayActualHours, defaultTargetHours, formatHM } from "../lib/time.js";

const label = monthYear;
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export const monthRoutes = new Hono();

monthRoutes.get("/month/:ym?", async (c) => {
  const param = c.req.param("ym");
  const now = new Date();
  const match = param ? /^(\d{4})-(\d{2})$/.exec(param) : [null, String(now.getFullYear()), String(now.getMonth() + 1)];
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return c.html(<ErrorPage message={t("err.month")} />, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const entries = new Map((await getRange(`${ym(year, month)}-01`, `${ym(year, month)}-${daysInMonth}`)).map((d) => [d.entry.date, d]));

  let sumActual = new Decimal(0);
  let sumTarget = new Decimal(0);
  const rows = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${ym(year, month)}-${String(i + 1).padStart(2, "0")}`;
    const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
    const d = entries.get(date);
    const target = d ? new Decimal(d.entry.targetHours) : defaultTargetHours(date);
    const actual = d ? dayActualHours(d.blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }))) : null;
    sumActual = sumActual.plus(actual ?? 0);
    sumTarget = sumTarget.plus(target);
    const blocks = (d?.blocks ?? []).map(
      (b) => `${b.startTime.slice(0, 5)}–${b.endTime?.slice(0, 5) ?? "…"}${new Decimal(b.breakHours).gt(0) ? ` (${t("month.brk", { h: dec(new Decimal(b.breakHours).toString()) })})` : ""}`,
    );
    // Missing day: full target counts as deficit; running day: no saldo yet.
    const saldo = d ? dailySaldo(actual, target) : target.neg();
    return { date, wd, blocks, actual, target, saldo };
  });

  const prev = month === 1 ? [year - 1, 12] as const : [year, month - 1] as const;
  const next = month === 12 ? [year + 1, 1] as const : [year, month + 1] as const;
  return c.html(
    <Layout title={label(year, month)} nav="/month">
      <div class="flex justify-between items-center mb-4">
        <a class="btn btn-sm" href={`/month/${ym(...prev)}`}>← <span class="hidden sm:inline">{label(...prev)}</span></a>
        <h1 class="text-xl font-bold">{label(year, month)}</h1>
        <a class="btn btn-sm" href={`/month/${ym(...next)}`}><span class="hidden sm:inline">{label(...next)}</span> →</a>
      </div>
      <div class="overflow-x-auto"><table class="table table-xs sm:table-sm">
        <thead>
          <tr><th>{t("date")}</th><th class="hidden sm:table-cell">{t("month.blocks")}</th><th class="text-right">{t("actual")}</th><th class="text-right">{t("target")}</th><th class="text-right">{t("saldo")}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr class={r.wd === 0 || r.wd === 6 ? "opacity-60" : ""}>
              <td class="whitespace-nowrap"><a class="link" href={`/day/${r.date}`}>{weekday(r.wd, "short")} {r.date.slice(8)}</a>{r.blocks.map((b) => <div class="sm:hidden text-xs opacity-70">{b}</div>)}</td>
              <td class="hidden sm:table-cell">{r.blocks.map((b) => <div>{b}</div>)}</td>
              <td class="text-right">{r.actual ? formatHM(r.actual) : "—"}</td>
              <td class="text-right">{formatHM(r.target)}</td>
              <td class="text-right"><SaldoBadge value={r.saldo} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>{t("month.total")}</strong></td><td class="hidden sm:table-cell" />
            <td class="text-right">{formatHM(sumActual)}</td>
            <td class="text-right">{formatHM(sumTarget)}</td>
            <td class="text-right"><SaldoBadge value={sumActual.minus(sumTarget)} /></td>
          </tr>
        </tfoot>
      </table></div>
    </Layout>,
  );
});
