import Decimal from "decimal.js";
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { raw } from "hono/html";
import { ErrorPage, Layout } from "../components/layout.js";
import { addBlock, deleteBlock, deleteDay, getDay, saveEntry, updateBlock, type BlockInput, type BlockRow } from "../db/queries.js";
import { dateLong, t, weekday as weekdayName } from "../lib/i18n.js";
import {dailySaldo, dayActualHours, defaultTargetHours, formatHM, parseTimeInput } from "../lib/time.js";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
export const num = (s: string) => (Number(s) === 0 ? "" : new Decimal(s).toString());
/** Only same-site paths, to avoid open redirects. */
const safeReturn = (r: unknown, fallback: string) => (typeof r === "string" && /^\/(?!\/)/.test(r) ? r : fallback);

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const target = { "hx-target": "#block-editor", "hx-swap": "innerHTML" };

/** Day timeline: one bar, each block a clickable segment at its real clock position. */
const Timeline = ({ date, blocks }: { date: string; blocks: BlockRow[] }) => {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = localIso(now) === date;
  // End may be past midnight (>1440) for blocks crossing it; running blocks have end=null.
  const segs = blocks.map((b) => {
    const s = mins(b.startTime);
    let e = b.endTime ? mins(b.endTime) : null;
    if (e !== null && e < s) e += 1440;
    return { b, s, e };
  });
  const ends = segs.map((x) => x.e ?? (isToday ? Math.max(nowMin, x.s + 15) : x.s + 60));
  const lo = segs.length ? Math.max(0, Math.floor(Math.min(...segs.map((x) => x.s)) / 60) * 60 - 60) : 360;
  const hi = segs.length ? Math.ceil(Math.max(...ends) / 60) * 60 + 60 : 1200;
  const span = hi - lo;
  const pct = (m: number) => (((m - lo) / span) * 100).toFixed(2);
  const step = span > 720 ? 120 : 60;
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => lo + i * step);
  return (
    <div class="mb-3">
      <div class="relative h-14 rounded-box bg-base-300 overflow-hidden">
        {segs.map(({ b, s, e }) => {
          const end = e ?? (isToday ? Math.max(nowMin, s + 15) : hi);
          const m = Math.max(0, Math.round(end - s - Number(b.breakHours) * 60));
          const dur = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          return (
            <button type="button" data-block={b.id} hx-get={`/day/${date}/block/${b.id}/edit`} {...target}
              hx-on--before-request={`if(document.querySelector('#block-editor form[hx-post$="/block/${b.id}"]')){event.preventDefault();htmx.ajax('GET','/day/${date}/block-form',{target:'#block-editor',swap:'innerHTML'})}`}
              class={`@container absolute top-1 bottom-1 rounded-field bg-primary text-primary-content text-xs px-1 overflow-hidden whitespace-nowrap hover:brightness-110 focus-visible:outline`}
              style={`left:${pct(s)}%;width:${pct(end - s + lo)}%;${e === null ? "background-image:repeating-linear-gradient(45deg,transparent 0 6px,rgb(255 255 255/.25) 6px 12px)" : ""}`}
              title={`${hhmm(b.startTime)} – ${e === null ? t("day.running") : hhmm(b.endTime)} · ${dur}${Number(b.breakHours) > 0 ? ` · ${t("day.breakShown", { h: num(b.breakHours) })}` : ""}`}>
              {/* Detail by segment width: range + duration, then duration only, then nothing. */}
              <span class="hidden @[9rem]:inline">{hhmm(b.startTime)}–{e === null ? <span class="badge badge-warning badge-sm font-bold uppercase gap-1 align-middle"><span class="inline-block size-1.5 rounded-full bg-current animate-pulse" />{t("day.running")}</span> : hhmm(b.endTime)} · </span>
              <span class="hidden @[3rem]:inline font-semibold">{dur}</span>
              {Number(b.breakHours) > 0 && <span class="hidden @[14rem]:inline"> · {t("day.breakShown", { h: num(b.breakHours) })}</span>}
            </button>
          );
        })}
      </div>
      <div class="relative h-5 text-xs opacity-60">
        {ticks.map((m) => <span class="absolute -translate-x-1/2" style={`left:${pct(m)}%`}>{String((m / 60) % 24).padStart(2, "0")}</span>)}
      </div>
    </div>
  );
};

// Tabler Icons (outline, MIT)
const ICON = {
  trash: ["M4 7l16 0", "M10 11l0 6", "M14 11l0 6", "M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12", "M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"],
  x: ["M18 6l-12 12", "M6 6l12 12"],
  check: ["M5 12l5 5l10 -10"],
  save: ["M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2", "M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M14 4l0 4l-6 0l0 -4"],
  clockPlus: ["M20.984 12.535a9 9 0 1 0 -8.468 8.45", "M16 19h6", "M19 16v6", "M12 7v5l3 3"],
  maximize: ["M16 4l4 0l0 4", "M14 10l6 -6", "M8 20l-4 0l0 -4", "M4 20l6 -6", "M16 20l4 0l0 -4", "M14 14l6 6", "M8 4l-4 0l0 4", "M4 4l6 6"],
};
export const Ico = ({ n }: { n: keyof typeof ICON }) => (
  <svg class="w-5 h-5 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICON[n].map((d) => <path d={d} />)}</svg>
);
export const Lbl = ({ children }: { children: string }) => <span class="hidden sm:inline">{children}</span>;

/** One editor under the bar: new block (no id) or the selected segment. */
export const BlockEditor = ({ date, id, start = "", end = "", brk = "" }: { date: string; id?: string; start?: string; end?: string; brk?: string }) => (
  <form class="p-2 rounded-box bg-base-100 border border-base-300" hx-post={id ? `/day/${date}/block/${id}` : `/day/${date}/blocks`} hx-swap="none">
    {/* Highlight the bar being edited; the style disappears with the form. */}
    {id && <style>{raw(`[data-block="${id}"]{box-shadow:inset 0 0 0 3px light-dark(#0e7490,#facc15),inset 0 0 0 5px var(--color-base-100)}`)}</style>}
    <div class="flex flex-wrap items-end gap-2">
      <label class="floating-label flex-1 min-w-24">
        <span>{t("start")}</span>
        <div class="input input-sm sm:input-md w-full relative">
          <input class="grow min-w-0 pr-12" placeholder={t("start")} type="time" name="start" value={start} required />
          <button type="button" class="btn btn-ghost btn-xs absolute right-9 top-1/2 -translate-y-1/2" onclick="this.form.start.value=new Date().toTimeString().slice(0,5)">{t("now")}</button>
        </div>
      </label>
      <label class="floating-label flex-1 min-w-24">
        <span>{t("end")}</span>
        <div class="input input-sm sm:input-md w-full relative">
          <input class="grow min-w-0 pr-12" placeholder={t("end")} type="time" name="end" value={end} />
          <button type="button" class="btn btn-ghost btn-xs absolute right-9 top-1/2 -translate-y-1/2" onclick="this.form.end.value=new Date().toTimeString().slice(0,5)">{t("now")}</button>
        </div>
      </label>
      <label class="floating-label flex-1 min-w-24">
        <span>{t("breakH")}</span>
        <div class="input input-sm sm:input-md w-full pr-1 gap-1">
          <input class="grow min-w-0" type="number" inputmode="decimal" name="brk" value={brk} placeholder={t("breakH")} step="0.25" min="0" max="24" />
          {[["0.5", "30m"], ["1", "1h"]].map(([v, l]) => <button type="button" class="btn btn-ghost btn-xs" onclick={`this.form.brk.value='${v}'`}>{l}</button>)}
        </div>
      </label>
      {id && <button type="button" class="btn btn-ghost btn-sm sm:btn-md text-error" hx-post={`/day/${date}/block/${id}/delete`} hx-confirm={t("day.confirmRemoveBlock")} hx-swap="none" aria-label={t("delete")} title={t("delete")}><Ico n="trash" /><Lbl>{t("delete")}</Lbl></button>}
      {id && <button type="button" class="btn btn-ghost btn-sm sm:btn-md" hx-get={`/day/${date}/block-form`} {...target} aria-label={t("cancel")} title={t("cancel")}><Ico n="x" /><Lbl>{t("cancel")}</Lbl></button>}
      {id ? <button class="btn btn-primary btn-sm sm:btn-md" aria-label={t("day.saveBlock")} title={t("day.saveBlock")}><Ico n="check" /><Lbl>{t("day.saveBlock")}</Lbl></button> : <button class="btn btn-primary btn-sm sm:btn-md" aria-label={t("day.addBlock")} title={t("day.addBlock")}><Ico n="clockPlus" /><Lbl>{t("day.addBlock")}</Lbl></button>}
    </div>
  </form>
);

/** Start of a new block = end of the last block, if set. */
const nextStart = (blocks: BlockRow[]) => hhmm(blocks.at(-1)?.endTime ?? null);

/** Timeline + always-visible editor; lives outside the day form. */
export const BlocksSection = ({ date, blocks }: { date: string; blocks: BlockRow[] }) => (
  <div>
    <p class="text-xs opacity-70 mb-1">{t("day.blocksHint")}</p>
    <Timeline date={date} blocks={blocks} />
    <div id="block-editor"><BlockEditor date={date} start={nextStart(blocks)} /></div>
  </div>
);

const parseBlock = (f: Record<string, unknown>): BlockInput | null => {
  const start = parseTimeInput(String(f.start ?? ""));
  const brk = Number(f.brk);
  if (!start || (f.brk && (!Number.isFinite(brk) || brk < 0 || brk > 24))) return null;
  return { start, end: parseTimeInput(String(f.end ?? "")), breakHours: String(brk > 0 ? brk : 0) };
};
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const refresh = (c: Context) => { c.header("HX-Refresh", "true"); return c.body(null, 204); };

export const dayRoutes = new Hono();

dayRoutes.get("/day/:date/block-form", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.text("", 400);
  return c.html(<BlockEditor date={date} start={nextStart((await getDay(date))?.blocks ?? [])} />);
});

dayRoutes.post("/day/:date/blocks", async (c) => {
  const date = c.req.param("date");
  const b = parseBlock(await c.req.parseBody());
  if (!isDate(date) || !b) return c.text(t("err.date"), 400);
  await addBlock(date, defaultTargetHours(date).toString(), b);
  return refresh(c);
});

dayRoutes.get("/day/:date/block/:id/edit", async (c) => {
  const date = c.req.param("date");
  const b = (isDate(date) ? ((await getDay(date))?.blocks ?? []) : []).find((x) => x.id === c.req.param("id"));
  if (!b) return c.text("", 404);
  return c.html(<BlockEditor date={date} id={b.id} start={hhmm(b.startTime)} end={hhmm(b.endTime)} brk={num(b.breakHours)} />);
});

dayRoutes.post("/day/:date/block/:id", async (c) => {
  const b = parseBlock(await c.req.parseBody());
  if (!isId(c.req.param("id")) || !b) return c.text(t("err.date"), 400);
  await updateBlock(c.req.param("id"), b);
  return refresh(c);
});

dayRoutes.post("/day/:date/block/:id/delete", async (c) => {
  if (!isId(c.req.param("id"))) return c.text("", 400);
  await deleteBlock(c.req.param("id"));
  return refresh(c);
});

dayRoutes.get("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.html(<ErrorPage message={t("err.date")} />, 400);
  const day = await getDay(date);
  const target = day ? new Decimal(day.entry.targetHours) : defaultTargetHours(date);
  const blocks = day?.blocks ?? [];
  const actual = day ? dayActualHours(blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }))) : null;
  const saldo = (actual ?? new Decimal(0)).minus(target);
  const returnTo = c.req.query("from") === "dashboard" ? "/" : `/month/${date.slice(0, 7)}`;
  const weekday = weekdayName(new Date(`${date}T00:00:00Z`).getUTCDay(), "long");

  return c.html(
    <Layout title={dateLong(date)}>
      <div class="flex justify-between items-start gap-2 mb-4">
        <h1 class="text-xl sm:text-2xl font-bold">{weekday}, <span class="whitespace-nowrap">{dateLong(date)}</span></h1>
        {day && (
          <>
            <button type="button" class="btn btn-error btn-sm sm:btn-md" onclick="document.getElementById('delete-modal').showModal()">{t("delete")}</button>
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
      <div class="stats bg-base-200 w-full mb-4">
        <div class="stat">
          <div class="stat-title">{t("actual")}</div>
          <div class="stat-value">{formatHM(actual ?? new Decimal(0))}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{t("saldo")}</div>
          <div class={`stat-value ${saldo.gt(0) ? "text-success" : saldo.lt(0) ? "text-error" : ""}`}>{formatHM(saldo, true)}</div>
        </div>
        <div class="stat">
          <div class="stat-title">{t("dash.todayBreak")}</div>
          <div class="stat-value">{formatHM(blocks.reduce((s, b) => s.plus(b.breakHours), new Decimal(0)))}</div>
        </div>
      </div>
      <div class="card bg-base-200 p-4 space-y-4">
        <BlocksSection date={date} blocks={blocks} />
        <form method="post" action={`/day/${date}`} class="space-y-3">
          <input type="hidden" name="return_to" value={returnTo} />
          <div class="flex flex-wrap gap-3">
            <label class="floating-label">
              <span>{t("day.targetHours")}</span>
              <input class="input input-sm sm:input-md w-28" placeholder={t("day.targetHours")} type="number" inputmode="decimal" name="target_hours" value={target.toString()} step="0.5" min="0" max="24" />
            </label>
            <label class="floating-label flex-1 min-w-48">
              <span>{t("note")}</span>
              <textarea class="textarea textarea-sm sm:textarea-md w-full" name="note" rows={1} placeholder={t("day.notePlaceholder")}>{day?.entry.note ?? ""}</textarea>
            </label>
          </div>
          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <a href={returnTo} class="btn btn-ghost btn-sm sm:btn-md">{t("cancel")}</a>
            <button class="btn btn-primary btn-sm sm:btn-md sm:px-10">{t("save")}</button>
          </div>
        </form>
      </div>
    </Layout>,
  );
});

dayRoutes.post("/day/:date", async (c) => {
  const date = c.req.param("date");
  if (!isDate(date)) return c.html(<ErrorPage message={t("err.date")} />, 400);
  const f = await c.req.parseBody();
  const target = Number(f.target_hours);
  if (!Number.isFinite(target) || target < 0 || target > 24) return c.html(<ErrorPage message={t("err.target")} />, 400);
  const note = typeof f.note === "string" && f.note.trim() ? f.note : null;
  await saveEntry(date, String(target), note);
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
