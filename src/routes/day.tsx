import Decimal from "decimal.js";
import { Hono } from "hono";
import { Layout, SaldoBadge } from "../components/layout.js";
import { deleteDay, getDay, saveDay, type BlockInput } from "../db/queries.js";
import { dailySaldo, dayActualHours, defaultTargetHours, formatHours, parseTimeInput } from "../lib/time.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const num = (s: string) => (Number(s) === 0 ? "" : new Decimal(s).toString());
/** Only same-site paths, to avoid open redirects. */
const safeReturn = (r: unknown, fallback: string) => (typeof r === "string" && /^\/(?!\/)/.test(r) ? r : fallback);
const many = (v: unknown): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);

const BlockRow = ({ start = "", end = "", brk = "" }) => (
  <div class="block-row flex gap-2 items-end mb-2">
    <label class="form-control">
      <span class="label-text">Start</span>
      <input class="input input-bordered" type="time" name="starts" value={start} required />
    </label>
    <label class="form-control">
      <span class="label-text">End</span>
      <input class="input input-bordered" type="time" name="ends" value={end} />
    </label>
    <label class="form-control">
      <span class="label-text">Break (h)</span>
      <input class="input input-bordered w-28" type="number" name="breaks" value={brk} step="0.25" min="0" />
    </label>
    <button type="button" class="btn btn-error btn-sm" onclick="this.closest('.block-row').remove()">✕</button>
  </div>
);

export const dayRoutes = new Hono();

dayRoutes.get("/day/:date/add-block", (c) => c.html(<BlockRow />));

dayRoutes.get("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.text("Invalid date", 400);
  const day = await getDay(date);
  const target = day ? new Decimal(day.entry.targetHours) : defaultTargetHours(date);
  const blocks = day?.blocks ?? [];
  const actual = day ? dayActualHours(blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }))) : null;
  const returnTo = c.req.query("from") === "dashboard" ? "/" : `/month/${date.slice(0, 7)}`;
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

  return c.html(
    <Layout title={date}>
      <div class="flex justify-between mb-4">
        <h1 class="text-2xl font-bold">{weekday}, {date}</h1>
        {day && (
          <form method="post" action={`/day/${date}/delete`} onsubmit="return confirm('Delete this day entry?')">
            <input type="hidden" name="return_to" value={returnTo} />
            <button class="btn btn-error btn-sm">Delete</button>
          </form>
        )}
      </div>
      <form method="post" action={`/day/${date}`} class="space-y-4">
        <input type="hidden" name="return_to" value={returnTo} />
        <label class="form-control">
          <span class="label-text">Target Hours (Soll)</span>
          <input class="input input-bordered w-32" type="number" name="target_hours" value={target.toString()} step="0.5" min="0" max="24" />
        </label>
        <div>
          <h2 class="font-semibold mb-2">Time Blocks</h2>
          <div id="blocks-container">
            {(blocks.length ? blocks : [null]).map((b) => (
              <BlockRow start={hhmm(b?.startTime ?? null)} end={hhmm(b?.endTime ?? null)} brk={b ? num(b.breakHours) : ""} />
            ))}
          </div>
          <button type="button" class="btn btn-sm" hx-get={`/day/${date}/add-block`} hx-target="#blocks-container" hx-swap="beforeend">
            + Add Block
          </button>
        </div>
        <label class="form-control">
          <span class="label-text">Note</span>
          <textarea class="textarea textarea-bordered" name="note" rows={2} placeholder="Optional remark...">{day?.entry.note ?? ""}</textarea>
        </label>
        {actual && (
          <div class="flex justify-between">
            <span>Actual: <strong>{formatHours(actual)}h</strong></span>
            <span>Saldo: <SaldoBadge value={dailySaldo(actual, target)} /></span>
          </div>
        )}
        <button class="btn btn-primary">Save</button> <a href={returnTo} class="btn">Cancel</a>
      </form>
    </Layout>,
  );
});

dayRoutes.post("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.text("Invalid date", 400);
  const f = await c.req.parseBody({ all: true });
  const target = Number(f.target_hours);
  if (!Number.isFinite(target) || target < 0 || target > 24) return c.text("Invalid target hours", 400);
  const [starts, ends, breaks] = [many(f.starts), many(f.ends), many(f.breaks)];
  const blocks: BlockInput[] = [];
  starts.forEach((s, i) => {
    const start = parseTimeInput(s);
    if (!start) return; // skip blocks without a valid start
    const brk = Number(breaks[i]);
    blocks.push({ start, end: parseTimeInput(ends[i] ?? ""), breakHours: String(Number.isFinite(brk) && brk > 0 ? brk : 0) });
  });
  const note = typeof f.note === "string" && f.note.trim() ? f.note : null;
  await saveDay(date, String(target), note, blocks);
  return c.redirect(safeReturn(f.return_to, `/month/${date.slice(0, 7)}`), 303);
});

dayRoutes.post("/day/:date/delete", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.text("Invalid date", 400);
  const f = await c.req.parseBody();
  await deleteDay(date);
  return c.redirect(safeReturn(f.return_to, `/month/${date.slice(0, 7)}`), 303);
});
