import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { getRange } from "../db/queries.js";
import { dailySaldo, dayActualHours, defaultTargetHours, formatHours } from "../lib/time.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const label = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export const monthRoutes = new Hono();

monthRoutes.get("/month/:ym?", async (c) => {
  const param = c.req.param("ym");
  const now = new Date();
  const match = param ? /^(\d{4})-(\d{2})$/.exec(param) : [null, String(now.getFullYear()), String(now.getMonth() + 1)];
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return c.text("Invalid month", 400);
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
      (b) => `${b.startTime.slice(0, 5)}–${b.endTime?.slice(0, 5) ?? "…"}${new Decimal(b.breakHours).gt(0) ? ` (${new Decimal(b.breakHours)}h brk)` : ""}`,
    );
    // Missing day: full target counts as deficit; running day: no saldo yet.
    const saldo = d ? dailySaldo(actual, target) : target.neg();
    return { date, wd, blocks, actual, target, saldo };
  });

  const prev = month === 1 ? [year - 1, 12] as const : [year, month - 1] as const;
  const next = month === 12 ? [year + 1, 1] as const : [year, month + 1] as const;
  return c.html(
    <Layout title={label(year, month)}>
      <div class="flex justify-between items-center mb-4">
        <a class="btn btn-sm" href={`/month/${ym(...prev)}`}>← {label(...prev)}</a>
        <h2 class="text-xl font-bold">{label(year, month)}</h2>
        <a class="btn btn-sm" href={`/month/${ym(...next)}`}>{label(...next)} →</a>
      </div>
      <table class="table table-sm">
        <thead>
          <tr><th>Date</th><th>Time Blocks</th><th class="text-right">Actual</th><th class="text-right">Target</th><th class="text-right">Saldo</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr class={r.wd === 0 || r.wd === 6 ? "opacity-60" : ""}>
              <td><a class="link" href={`/day/${r.date}`}>{WD[r.wd]} {r.date.slice(8)}</a></td>
              <td>{r.blocks.map((b) => <div>{b}</div>)}</td>
              <td class="text-right">{r.actual ? formatHours(r.actual) : "—"}</td>
              <td class="text-right">{formatHours(r.target)}</td>
              <td class="text-right"><SaldoBadge value={r.saldo} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colspan={2}><strong>Total</strong></td>
            <td class="text-right">{formatHours(sumActual)}</td>
            <td class="text-right">{formatHours(sumTarget)}</td>
            <td class="text-right"><SaldoBadge value={sumActual.minus(sumTarget)} /></td>
          </tr>
        </tfoot>
      </table>
    </Layout>,
  );
});
