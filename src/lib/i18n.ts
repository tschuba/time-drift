import { AsyncLocalStorage } from "node:async_hooks";
import { Hono, type MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const en = {
  "nav.label": "Main", "nav.dashboard": "Dashboard", "nav.month": "Month", "nav.analytics": "Analytics", "nav.history": "History",
  "save": "Save", "cancel": "Cancel", "delete": "Delete", "back": "← Back", "close": "Close", "theme.toggle": "Toggle dark mode",
  "date": "Date", "actual": "Actual", "target": "Target", "saldo": "Saldo", "note": "Note", "start": "Start", "end": "End",
  "breakH": "Break (h)", "noData": "No data",
  "flash.saved": "Saved", "flash.deleted": "Deleted",
  "err.title": "Error", "err.date": "Invalid date", "err.month": "Invalid month", "err.target": "Invalid target hours",
  "dash.running": "Running Saldo", "dash.todaySaldo": "Today's Saldo", "dash.todayBreak": "Today's Break", "dash.today": "Today", "dash.fullEditor": "Full editor", "dash.targetH": "Target (h)",
  "dash.actualColon": "Actual:", "dash.addBlock": "+ Add Block", "dash.last7": "Last 7 Days",
  "day.block": "Block", "day.removeBlock": "Remove block", "edit": "Edit", "day.running": "running", "day.breakShown": "Break {h} h", "day.confirmRemoveBlock": "Remove this block?", "day.newBlock": "New block", "day.addBlock": "Log time", "day.saveBlock": "Update", "day.deleteTitle": "Delete this day?",
  "day.deleteText": "The entry for {date} and all its time blocks will be permanently removed.",
  "day.targetHours": "Target Hours", "day.timeBlocks": "Time Blocks",
  "day.blocksHint": "Click a block to edit it. Leave End empty for a running block.",
  "day.notePlaceholder": "Optional remark...", "day.saldoColon": "Saldo:",
  "month.blocks": "Blocks", "month.total": "Total", "month.brk": "{h}h brk", "month.empty": "No entries",
  "hist.title": "History", "hist.from": "From", "hist.to": "To", "hist.filter": "Filter", "hist.clear": "Clear",
  "hist.running": "Running", "hist.emptyRange": "No entries in this date range.", "hist.empty": "No entries yet.",
  "hist.track": "Track today", "hist.prev": "« Prev", "hist.next": "Next »", "hist.page": "Page {p} of {n}",
  "hist.total": "{n} entries total",
  "an.title": "Analytics", "an.avgHours": "Avg Hours / Workday", "an.avgSaldo": "Avg Daily Saldo", "an.thisMonth": "This Month",
  "an.thisYear": "This Year", "an.busiest": "Busiest Day", "an.overtime": "Overtime Frequency", "an.na": "N/A",
  "an.trend": "Saldo Trend", "an.all": "All", "an.monthly": "Monthly Hours (Actual vs Target)", "an.intensity": "Work Intensity",
  "an.heatHint": "Darker = more hours worked. Tap a day for details.",
};

const de: Partial<Record<keyof typeof en, string>> = {
  "nav.label": "Hauptnavigation", "nav.dashboard": "Übersicht", "nav.month": "Monat", "nav.analytics": "Auswertung", "nav.history": "Verlauf",
  "save": "Speichern", "cancel": "Abbrechen", "delete": "Löschen", "back": "← Zurück", "close": "Schließen", "theme.toggle": "Dunkelmodus umschalten",
  "date": "Datum", "actual": "Ist", "target": "Soll", "saldo": "Saldo", "note": "Notiz", "start": "Start", "end": "Ende",
  "breakH": "Pause (h)", "noData": "Keine Daten",
  "flash.saved": "Gespeichert", "flash.deleted": "Gelöscht",
  "err.title": "Fehler", "err.date": "Ungültiges Datum", "err.month": "Ungültiger Monat", "err.target": "Ungültige Sollstunden",
  "dash.running": "Laufender Saldo", "dash.todaySaldo": "Tages-Saldo", "dash.todayBreak": "Tages-Pausenzeit", "dash.today": "Heute", "dash.fullEditor": "Vollständiger Editor", "dash.targetH": "Soll (h)",
  "dash.actualColon": "Ist:", "dash.addBlock": "+ Block hinzufügen", "dash.last7": "Letzte 7 Tage",
  "day.block": "Block", "day.removeBlock": "Block entfernen", "edit": "Bearbeiten", "day.running": "läuft", "day.breakShown": "Pause {h} h", "day.confirmRemoveBlock": "Diesen Block entfernen?", "day.newBlock": "Neuer Block", "day.addBlock": "Zeit erfassen", "day.saveBlock": "Aktualisieren", "day.deleteTitle": "Diesen Tag löschen?",
  "day.deleteText": "Der Eintrag für {date} und alle Zeitblöcke werden endgültig gelöscht.",
  "day.targetHours": "Sollstunden", "day.timeBlocks": "Zeitblöcke",
  "day.blocksHint": "Block anklicken zum Bearbeiten. Ende leer lassen für einen laufenden Block.",
  "day.notePlaceholder": "Optionale Anmerkung...", "day.saldoColon": "Saldo:",
  "month.blocks": "Blöcke", "month.total": "Summe", "month.brk": "{h}h Pause", "month.empty": "Keine Einträge",
  "hist.title": "Verlauf", "hist.from": "Von", "hist.to": "Bis", "hist.filter": "Filtern", "hist.clear": "Zurücksetzen",
  "hist.running": "Fortlaufend", "hist.emptyRange": "Keine Einträge in diesem Zeitraum.", "hist.empty": "Noch keine Einträge.",
  "hist.track": "Heute erfassen", "hist.prev": "« Zurück", "hist.next": "Weiter »", "hist.page": "Seite {p} von {n}",
  "hist.total": "{n} Einträge insgesamt",
  "an.title": "Auswertung", "an.avgHours": "Ø Stunden / Arbeitstag", "an.avgSaldo": "Ø Tagessaldo", "an.thisMonth": "Dieser Monat",
  "an.thisYear": "Dieses Jahr", "an.busiest": "Arbeitsreichster Tag", "an.overtime": "Überstunden-Quote", "an.na": "k. A.",
  "an.trend": "Saldoverlauf", "an.all": "Alle", "an.monthly": "Monatsstunden (Ist vs. Soll)", "an.intensity": "Arbeitsintensität",
  "an.heatHint": "Dunkler = mehr Stunden. Tag antippen für Details.",
};

export type Key = keyof typeof en;
const dicts: Record<string, Partial<Record<Key, string>>> = { en, de };
export const SUPPORTED = Object.keys(dicts);
const store = new AsyncLocalStorage<{ lang: string; next: string }>();

/** First supported language in Accept-Language (q-ordered); English if none matches. */
export function pickLang(header: string | undefined): string {
  const tags = (header ?? "")
    .split(",")
    .map((p) => {
      const [tag = "", q] = p.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0]!, q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q);
  return tags.find((x) => SUPPORTED.includes(x.lang))?.lang ?? "en";
}

/** Language precedence: explicit cookie (switcher) > Accept-Language > English. */
export const i18n: MiddlewareHandler = (c, next) => {
  const saved = getCookie(c, "lang");
  const u = new URL(c.req.url);
  return store.run({ lang: saved && SUPPORTED.includes(saved) ? saved : pickLang(c.req.header("accept-language")), next: u.pathname + u.search }, next);
};
export const lang = () => store.getStore()?.lang ?? "en";
/** Current path+query, so the switcher can return to the same page. */
export const currentPath = () => store.getStore()?.next ?? "/";

export const langRoutes = new Hono().get("/lang/:code", (c) => {
  const code = c.req.param("code");
  if (!SUPPORTED.includes(code)) return c.text("Unsupported language", 400);
  setCookie(c, "lang", code, { path: "/", maxAge: 31536000, sameSite: "Lax" });
  const next = c.req.query("next");
  return c.redirect(next && /^\/(?!\/|\\)/.test(next) ? next : "/", 303);
});

/** Decimal separator per language; input values must keep "." (HTML number inputs). */
export const dec = (s: string) => (lang() === "de" ? s.replace(".", ",") : s);

/** Translate for the current request; missing keys fall back to English. */
export const t = (key: Key, params: Record<string, string | number> = {}) =>
  (dicts[lang()]?.[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));

const fmt = (opts: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat(lang(), { ...opts, timeZone: "UTC" }).format(d);
/** iso = YYYY-MM-DD → "Nov 11, 2026" / "11.11.2026". */
export const dateLong = (iso: string) => fmt({ dateStyle: "medium" }, new Date(`${iso}T00:00:00Z`));
/** iso → "11/11" / "11.11." (no year). */
export const dateShort = (iso: string) => fmt({ day: "numeric", month: "numeric" }, new Date(`${iso}T00:00:00Z`));
/** wd: 0 = Sunday. */
export const weekday = (wd: number, width: "short" | "long") => fmt({ weekday: width }, new Date(Date.UTC(2023, 0, 1 + wd)));
export const monthYear = (y: number, m: number) => fmt({ month: "long", year: "numeric" }, new Date(Date.UTC(y, m - 1, 1)));
