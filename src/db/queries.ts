import { and, asc, eq, gte, lte } from "drizzle-orm";
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
