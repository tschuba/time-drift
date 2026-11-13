import Decimal from "decimal.js";
import { Hono } from "hono";
import { ErrorPage, Layout, SaldoBadge } from "../components/layout.js";
import { getRange } from "../db/queries.js";
import { dec, monthYear, t, weekday } from "../lib/i18n.js";
import {dailySaldo, dayActualHours, formatHM } from "../lib/time.js";

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
    const target = new Decimal(d?.entry.targetHours ?? 0);
    const actual = d ? dayActualHours(d.blocks.map((b) => ({ start: b.startTime, end: b.endTime, breakHours: b.breakHours }))) : null;
    sumActual = sumActual.plus(actual ?? 0);
    sumTarget = sumTarget.plus(target);
    const blocks = (d?.blocks ?? []).map(
      (b) => `${b.startTime.slice(0, 5)}–${b.endTime?.slice(0, 5) ?? "…"}${new Decimal(b.breakHours).gt(0) ? ` (${t("month.brk", { h: dec(new Decimal(b.breakHours).toString()) })})` : ""}`,
    );
    // Missing day: no target, no saldo (matches getTotalSaldo); running day: no saldo yet.
    const saldo = d ? dailySaldo(actual, target) : null;
    const running = !!d?.blocks.some((b) => !b.endTime);
    const brk = (d?.blocks ?? []).reduce((a, b) => a.plus(b.breakHours), new Decimal(0));
    return { date, wd, blocks, actual, target, saldo, brk, has: !!d, running };
  });

  const prev = month === 1 ? [year - 1, 12] as const : [year, month - 1] as const;
  const next = month === 12 ? [year + 1, 1] as const : [year, month + 1] as const;
  const lead = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
  const slots = [...Array(lead).fill(null), ...rows];
  while (slots.length % 7) slots.push(null);
  const weeks = Array.from({ length: slots.length / 7 }, (_, i) => slots.slice(i * 7, i * 7 + 7) as (typeof rows[number] | null)[]);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return c.html(
    <Layout title={label(year, month)} nav="/month">
      <div class="flex justify-between items-center mb-4">
        <a class="btn btn-md" href={`/month/${ym(...prev)}`}>← <span class="hidden sm:inline">{label(...prev)}</span></a>
        <h1 class="text-xl font-bold">{label(year, month)}</h1>
        <a class="btn btn-md" href={`/month/${ym(...next)}`}><span class="hidden sm:inline">{label(...next)}</span> →</a>
      </div>
      <div class="grid grid-cols-7 gap-1 mb-2 text-center text-sm">
        {[1, 2, 3, 4, 5, 6, 0].map((w) => <div class="text-xs opacity-60">{weekday(w, "short")}</div>)}
        {weeks.map((wk) => (
          <>
            {wk.map((r) => r ? (
              <a
                href={`/day/${r.date}`}
                data-date={r.date}
                data-day={`${weekday(r.wd, "short")} ${r.date.slice(8)}`}
                data-blocks={r.blocks.join("|")}
                title={`${t("actual")} ${r.actual ? formatHM(r.actual) : "—"} · ${t("target")} ${formatHM(r.target)} · ${formatHM(r.brk)} ☕`}
                class={`block rounded p-1 sm:p-2 border ${r.has ? (r.saldo?.isNegative() ? "bg-error/20 border-error" : r.saldo ? "bg-success/20 border-success" : "bg-warning/20 border-warning") : "border-base-300"} ${r.wd === 0 || r.wd === 6 ? "opacity-60" : ""} ${r.date === today ? "ring-2 ring-accent" : ""}`}
              >
                <div class="text-base font-bold mb-0.5">{Number(r.date.slice(8))}</div>
                <div class="text-xs">{r.running && <span class="animate-pulse">▶ </span>}{r.saldo ? formatHM(r.saldo, true) : "\u00a0"}</div>
                <div class="hidden sm:block text-xs opacity-70 h-4">{r.brk.gt(0) ? `☕ ${formatHM(r.brk)}` : ""}</div>
                {r.target.gt(0) && (
                  <div class="h-1 mt-1 rounded bg-base-300 overflow-hidden">
                    <div class={`h-full ${r.saldo && !r.saldo.isNegative() ? "bg-success" : "bg-primary"}`} style={`width:${Math.min(100, new Decimal(r.actual ?? 0).div(r.target).times(100).toNumber())}%`} />
                  </div>
                )}
              </a>
            ) : <div />)}
          </>
        ))}
      </div>
      <div id="day-detail" class="hidden mb-6 p-3 rounded border border-base-300 text-sm">
        <a id="dd-link" class="link font-bold" href="#" />
        <div id="dd-blocks" class="mt-1" data-empty={t("month.empty")} />
      </div>
      {/* Click a day: show its blocks and highlight/scroll to its list row; static script, text via textContent. */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){var d=document.getElementById("day-detail"),l=document.getElementById("dd-link"),b=document.getElementById("dd-blocks"),cur,sel,C=["outline","outline-solid","outline-2","outline-offset-2","outline-primary"];document.querySelectorAll("a[data-date]").forEach(function(a){a.addEventListener("click",function(e){if(e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();if(sel){sel.classList.remove.apply(sel.classList,C);if(cur)cur.classList.remove("bg-base-200")}if(sel===a){sel=cur=null;d.classList.add("hidden");return}l.textContent=a.dataset.day+" →";l.href=a.href;b.replaceChildren();(a.dataset.blocks?a.dataset.blocks.split("|"):[b.dataset.empty]).forEach(function(t){var x=document.createElement("div");x.textContent=t;b.appendChild(x)});d.classList.remove("hidden");sel=a;a.classList.add.apply(a.classList,C);cur=document.getElementById("row-"+a.dataset.date);if(cur){cur.classList.add("bg-base-200");cur.scrollIntoView({block:"nearest",behavior:"smooth"})}})})})()` }} />
      <div class="overflow-x-auto"><table class="table table-xs sm:table-sm">
        <thead>
          <tr><th>{t("date")}</th><th class="hidden sm:table-cell">{t("month.blocks")}</th><th class="text-right">{t("actual")}</th><th class="text-right">{t("target")}</th><th class="text-right">{t("saldo")}</th></tr>
        </thead>
        <tbody>
          {rows.filter((r) => r.has).map((r) => (
            <tr id={`row-${r.date}`} class={r.wd === 0 || r.wd === 6 ? "opacity-60" : ""}>
              <td class="whitespace-nowrap"><a class="link" href={`/day/${r.date}`}>{weekday(r.wd, "short")} {r.date.slice(8)}</a>{r.blocks.map((b) => <div class="sm:hidden text-xs opacity-70">{b}</div>)}</td>
              <td class="hidden sm:table-cell">{r.blocks.map((b) => <div>{b}</div>)}</td>
              <td class="text-right">{r.actual ? formatHM(r.actual) : "—"}</td>
              <td class="text-right">{formatHM(r.target)}</td>
              <td class="text-right">{r.saldo && <SaldoBadge value={r.saldo} />}</td>
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
