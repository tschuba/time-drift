import { sql } from "drizzle-orm";
import { date, index, numeric, pgTable, smallint, text, time, timestamp, uuid } from "drizzle-orm/pg-core";

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    date: date("date").notNull().unique(),
    targetHours: numeric("target_hours", { precision: 4, scale: 2 }).notNull().default("8.0"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_time_entries_date_desc").on(t.date.desc())],
);

export const timeBlocks = pgTable(
  "time_blocks",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    entryId: uuid("entry_id").notNull().references(() => timeEntries.id, { onDelete: "cascade" }),
    startTime: time("start_time").notNull(),
    endTime: time("end_time"),
    breakHours: numeric("break_hours", { precision: 4, scale: 2 }).notNull().default("0"),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_time_blocks_entry_id").on(t.entryId)],
);
