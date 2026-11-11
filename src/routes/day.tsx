import Decimal from "decimal.js";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { ErrorPage, Layout, SaldoBadge } from "../components/layout.js";
import { deleteDay, getDay, saveDay, type BlockInput } from "../db/queries.js";
import { dateLong, t, weekday as weekdayName } from "../lib/i18n.js";
import { dailySaldo, dayActualHours, defaultTargetHours, formatHours, parseTimeInput } from "../lib/time.js";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
export const num = (s: string) => (Number(s) === 0 ? "" : new Decimal(s).toString());
/** Only same-site paths, to avoid open redirects. */
const safeReturn = (r: unknown, fallback: string) => (typeof r === "string" && /^\/(?!\/)/.test(r) ? r : fallback);
const many = (v: unknown): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);

export const BlockRow = ({ start = "", end = "", brk = "" }) => (
  <div class="block-row flex flex-wrap gap-2 items-end mb-2">
    <label class="flex flex-col gap-1">
      <span class="text-sm opacity-70">{t("start")}</span>
      <input class="input input-bordered w-28 sm:w-32" type="time" name="starts" value={start} required />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm opacity-70">{t("end")}</span>
      <input class="input input-bordered w-28 sm:w-32" type="time" name="ends" value={end} />
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm opacity-70">{t("breakH")}</span>
      <input class="input input-bordered w-24" type="number" name="breaks" value={brk} step="0.25" min="0" />
    </label>
    <button type="button" class="btn btn-error btn-outline btn-sm" aria-label={t("day.removeBlock")} title={t("day.removeBlock")} onclick="this.closest('.block-row').remove()">✕</button>
  </div>
);

export const dayRoutes = new Hono();

dayRoutes.get("/day/:date/add-block", (c) => c.html(<BlockRow />));

dayRoutes.get("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.html(<ErrorPage message={t("err.date")} />, 400);
  const day = await getDay(date);
  const target = day ? new Decimal(day.entry.targetHours) : defaultTargetHours(date);
  const blocks = day?.blocks ?? [];
  const actual = day ? dayActualHours(blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }))) : null;
  const returnTo = c.req.query("from") === "dashboard" ? "/" : `/month/${date.slice(0, 7)}`;
  const weekday = weekdayName(new Date(`${date}T00:00:00Z`).getUTCDay(), "long");

  return c.html(
    <Layout title={dateLong(date)}>
      <div class="flex justify-between items-start gap-2 mb-4">
        <h1 class="text-xl sm:text-2xl font-bold">{weekday}, <span class="whitespace-nowrap">{dateLong(date)}</span></h1>
        {day && (
          <>
            <button type="button" class="btn btn-error btn-sm" onclick="document.getElementById('delete-modal').showModal()">{t("delete")}</button>
            <dialog id="delete-modal" class="modal modal-bottom sm:modal-middle">
              <div class="modal-box">
                <h3 class="font-bold text-lg">{t("day.deleteTitle")}</h3>
                <p class="py-4">{t("day.deleteText", { date: dateLong(date) })}</p>
                <form method="post" action={`/day/${date}/delete`} class="modal-action">
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button type="button" class="btn" onclick="this.closest('dialog').close()">{t("cancel")}</button>
                  <button class="btn btn-error">{t("delete")}</button>
                </form>
              </div>
              <form method="dialog" class="modal-backdrop"><button aria-label={t("close")}>{t("close")}</button></form>
            </dialog>
          </>
        )}
      </div>
      <form method="post" action={`/day/${date}`} class="space-y-4">
        <input type="hidden" name="return_to" value={returnTo} />
        <label class="flex flex-col gap-1">
          <span class="text-sm opacity-70">{t("day.targetHours")}</span>
          <input class="input input-bordered w-32" type="number" name="target_hours" value={target.toString()} step="0.5" min="0" max="24" />
        </label>
        <div>
          <h2 class="font-semibold mb-2">{t("day.timeBlocks")}</h2>
          <p class="text-sm opacity-70 mb-2">{t("day.blocksHint")}</p>
          <div id="blocks-container">
            {(blocks.length ? blocks : [null]).map((b) => (
              <BlockRow start={hhmm(b?.startTime ?? null)} end={hhmm(b?.endTime ?? null)} brk={b ? num(b.breakHours) : ""} />
            ))}
          </div>
          <button type="button" class="btn btn-sm" hx-get={`/day/${date}/add-block`} hx-target="#blocks-container" hx-swap="beforeend">
            {t("dash.addBlock")}
          </button>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-sm opacity-70">{t("note")}</span>
          <textarea class="textarea textarea-bordered" name="note" rows={2} placeholder={t("day.notePlaceholder")}>{day?.entry.note ?? ""}</textarea>
        </label>
        {actual && (
          <div class="flex justify-between">
            <span>{t("dash.actualColon")} <strong>{formatHours(actual)}h</strong></span>
            <span>{t("day.saldoColon")} <SaldoBadge value={dailySaldo(actual, target)} /></span>
          </div>
        )}
        <button class="btn btn-primary">{t("save")}</button> <a href={returnTo} class="btn">{t("cancel")}</a>
      </form>
    </Layout>,
  );
});

dayRoutes.post("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.html(<ErrorPage message={t("err.date")} />, 400);
  const f = await c.req.parseBody({ all: true });
  const target = Number(f.target_hours);
  if (!Number.isFinite(target) || target < 0 || target > 24) return c.html(<ErrorPage message={t("err.target")} />, 400);
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
  setCookie(c, "flash", t("flash.saved"), { path: "/", maxAge: 10 });
  return c.redirect(safeReturn(f.return_to, `/month/${date.slice(0, 7)}`), 303);
});

dayRoutes.post("/day/:date/delete", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.html(<ErrorPage message={t("err.date")} />, 400);
  const f = await c.req.parseBody();
  await deleteDay(date);
  setCookie(c, "flash", t("flash.deleted"), { path: "/", maxAge: 10 });
  return c.redirect(safeReturn(f.return_to, `/month/${date.slice(0, 7)}`), 303);
});
