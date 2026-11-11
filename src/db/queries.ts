import Decimal from "decimal.js";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./index.js";
import { timeBlocks, timeEntries } from "./schema/index.js";

export type DayWithBlocks = { entry: typeof timeEntries.$inferSelect; blocks: (typeof timeBlocks.$inferSelect)[] };
export type BlockInput = { start: string; end: string | null; breakHours: string };

export async function getDay(date: string): Promise<DayWithBlocks | null> {
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.date, date));
  if (!entry) return null;
  const blocks = await db.select().from(timeBlocks).where(eq(timeBlocks.entryId, entry.id)).orderBy(asc(timeBlocks.sortOrder));
  return { entry, blocks };
}

export async function getRange(from: string, to: string): Promise<DayWithBlocks[]> {
  const rows = await db
    .select()
    .from(timeEntries)
    .leftJoin(timeBlocks, eq(timeBlocks.entryId, timeEntries.id))
    .where(and(gte(timeEntries.date, from), lte(timeEntries.date, to)))
    .orderBy(asc(timeEntries.date), asc(timeBlocks.sortOrder));
  const out = new Map<string, DayWithBlocks>();
  for (const r of rows) {
    const d = out.get(r.time_entries.id) ?? { entry: r.time_entries, blocks: [] };
    if (r.time_blocks) d.blocks.push(r.time_blocks);
    out.set(r.time_entries.id, d);
  }
  return [...out.values()];
}

/** Upsert entry fields only; blocks are managed individually. */
export async function saveEntry(date: string, targetHours: string, note: string | null) {
  await db
    .insert(timeEntries)
    .values({ date, targetHours, note })
    .onConflictDoUpdate({ target: timeEntries.date, set: { targetHours, note, updatedAt: new Date() } });
}

export type BlockRow = typeof timeBlocks.$inferSelect;

/** Append a block; creates the day's entry with defaultTarget if it does not exist yet. */
export async function addBlock(date: string, defaultTarget: string, b: BlockInput) {
  await db.transaction(async (tx) => {
    await tx.insert(timeEntries).values({ date, targetHours: defaultTarget }).onConflictDoNothing({ target: timeEntries.date });
    const [entry] = await tx.select({ id: timeEntries.id }).from(timeEntries).where(eq(timeEntries.date, date));
    const [{ next }] = await tx.select({ next: sql<number>`COALESCE(MAX(${timeBlocks.sortOrder}) + 1, 0)` }).from(timeBlocks).where(eq(timeBlocks.entryId, entry!.id));
    await tx.insert(timeBlocks).values({ entryId: entry!.id, startTime: b.start, endTime: b.end, breakHours: b.breakHours, sortOrder: next! });
  });
}

export const updateBlock = (id: string, b: BlockInput) =>
  db.update(timeBlocks).set({ startTime: b.start, endTime: b.end, breakHours: b.breakHours, updatedAt: new Date() }).where(eq(timeBlocks.id, id));

export const deleteBlock = (id: string) => db.delete(timeBlocks).where(eq(timeBlocks.id, id));

/** Upsert entry and replace all its blocks atomically. */
export async function saveDay(date: string, targetHours: string, note: string | null, blocks: BlockInput[]) {
  await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(timeEntries)
      .values({ date, targetHours, note })
      .onConflictDoUpdate({ target: timeEntries.date, set: { targetHours, note, updatedAt: new Date() } })
      .returning({ id: timeEntries.id });
    await tx.delete(timeBlocks).where(eq(timeBlocks.entryId, entry!.id));
    if (blocks.length)
      await tx.insert(timeBlocks).values(
        blocks.map((b, i) => ({ entryId: entry!.id, startTime: b.start, endTime: b.end, breakHours: b.breakHours, sortOrder: i })),
      );
  });
}

export const deleteDay = (date: string) => db.delete(timeEntries).where(eq(timeEntries.date, date));

/** Sum of (actual - target) over all days, optionally up to a date. Days whose only blocks are still running are skipped. */
export async function getTotalSaldo(upTo?: string): Promise<Decimal> {
  const rows = await db.execute<{ saldo: string }>(sql`
    SELECT COALESCE(SUM(
      (SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (CASE WHEN b.end_time < b.start_time
          THEN b.end_time::interval + interval '24 hours' - b.start_time::interval
          ELSE b.end_time::interval - b.start_time::interval END)) / 3600.0 - b.break_hours
      ), 0) FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL)
      - e.target_hours
    ), 0)::text AS saldo
    FROM time_entries e
    WHERE (${upTo ?? null}::date IS NULL OR e.date <= ${upTo ?? null}::date)
      AND (NOT EXISTS (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NULL)
        OR EXISTS (SELECT 1 FROM time_blocks b WHERE b.entry_id = e.id AND b.end_time IS NOT NULL))`);
  return new Decimal(rows[0]!.saldo);
}

export async function getPage(offset: number, limit: number, from?: string, to?: string) {
  const where = and(from ? gte(timeEntries.date, from) : undefined, to ? lte(timeEntries.date, to) : undefined);
  const [{ n }] = (await db.select({ n: count() }).from(timeEntries).where(where)) as [{ n: number }];
  const entries = await db.select().from(timeEntries).where(where).orderBy(desc(timeEntries.date)).limit(limit).offset(offset);
  const blocks = entries.length
    ? await db.select().from(timeBlocks).where(inArray(timeBlocks.entryId, entries.map((e) => e.id))).orderBy(asc(timeBlocks.sortOrder), asc(timeBlocks.startTime))
    : [];
  const days: DayWithBlocks[] = entries.map((entry) => ({ entry, blocks: blocks.filter((b) => b.entryId === entry.id) }));
  return { days, total: n };
}
