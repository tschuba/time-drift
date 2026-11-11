import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { getPage, getTotalSaldo } from "../db/queries.js";
import { dailySaldo, dayActualHours, formatHours } from "../lib/time.js";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PAGE_SIZE = 50;
const validDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined);

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
    <Layout title="History">
      <h1 class="text-2xl font-bold mb-4">History</h1>
      <form method="get" action="/history" class="flex gap-2 items-end mb-4">
        <label class="form-control"><span class="label-text">From</span><input class="input input-bordered" type="date" name="from" value={from ?? ""} /></label>
        <label class="form-control"><span class="label-text">To</span><input class="input input-bordered" type="date" name="to" value={to ?? ""} /></label>
        <button class="btn btn-primary btn-sm">Filter</button>
        {(from || to) && <a href="/history" class="btn btn-sm">Clear</a>}
      </form>
      <table class="table table-sm">
        <thead>
          <tr><th>Date</th><th class="text-right">Actual</th><th class="text-right">Target</th><th class="text-right">Saldo</th><th class="text-right">Running</th><th>Note</th></tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const target = new Decimal(d.entry.targetHours);
            const actual = dayActualHours(d.blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours })));
            const wd = new Date(`${d.entry.date}T00:00:00Z`).getUTCDay();
            return (
              <tr class={wd === 0 || wd === 6 ? "opacity-60" : ""}>
                <td><a class="link" href={`/day/${d.entry.date}`}>{WD[wd]} {d.entry.date.slice(5)}</a></td>
                <td class="text-right">{actual ? formatHours(actual) : "—"}</td>
                <td class="text-right">{formatHours(target)}</td>
                <td class="text-right"><SaldoBadge value={dailySaldo(actual, target)} /></td>
                <td class="text-right"><SaldoBadge value={running[i]!} /></td>
                <td class="opacity-70">{d.entry.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div class="flex gap-2 items-center justify-center my-4">
          {page > 1 && <a class="btn btn-sm" href={qs(page - 1)}>← Prev</a>}
          <span>Page {page} of {totalPages}</span>
          {page < totalPages && <a class="btn btn-sm" href={qs(page + 1)}>Next →</a>}
        </div>
      )}
      <div class="text-center text-sm opacity-70">{total} entries total</div>
    </Layout>,
  );
});
