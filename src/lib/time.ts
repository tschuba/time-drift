import { dec } from "./i18n.js";
import Decimal from "decimal.js";

// Match rust_decimal: 28 significant digits; format!("{:.2}") rounds half-to-even.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export type Block = { start: string; end: string | null; breakHours: Decimal.Value };

const toSeconds = (t: string) => {
  const [h, m, s = "0"] = t.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

/** Actual hours of one block; null while running. A block ending before it starts wraps past midnight. */
export function blockActualHours(start: string, end: string | null, breakHours: Decimal.Value): Decimal | null {
  if (end === null) return null;
  let seconds = toSeconds(end) - toSeconds(start);
  if (seconds < 0) seconds += 86400;
  return new Decimal(seconds).div(3600).minus(breakHours);
}

/** Total for a day; null if any block is still running. */
export function dayActualHours(blocks: Block[]): Decimal | null {
  let total = new Decimal(0);
  for (const b of blocks) {
    const h = blockActualHours(b.start, b.end, b.breakHours);
    if (h === null) return null;
    total = total.plus(h);
  }
  return total;
}

export const dailySaldo = (actual: Decimal | null, target: Decimal.Value) => (actual ? actual.minus(target) : null);

/** Sat/Sun 0, else 8. Takes "YYYY-MM-DD". */
export function defaultTargetHours(date: string): Decimal {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return new Decimal(wd === 0 || wd === 6 ? 0 : 8);
}

/** "8:30", "08:30" or "0830" -> "HH:MM"; null if invalid. */
export function parseTimeInput(input: string): string | null {
  const s = input.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s) ?? (/^\d{4}$/.test(s) ? [s, s.slice(0, 2), s.slice(2)] : null);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export const formatHours = (h: Decimal.Value) => dec(new Decimal(h).toFixed(2));

export function formatSaldo(s: Decimal.Value): string {
  const d = new Decimal(s);
  if (d.gt(0)) return dec(`+${d.toFixed(2)}`);
  if (d.lt(0)) return dec(d.toFixed(2));
  return dec("±0.00");
}
