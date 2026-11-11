// Runs only with TEST_DATABASE_URL set (a disposable Postgres); it wipes the tables.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("queries (postgres)", () => {
  let q: typeof import("./queries.js");
  let dbm: typeof import("./index.js");

  beforeAll(async () => {
    process.env.DATABASE_URL = url; // db/index.ts reads this at import time
    dbm = await import("./index.js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(dbm.db, { migrationsFolder: "drizzle" });
    q = await import("./queries.js");
  });
  beforeEach(async () => {
    await dbm.client`TRUNCATE time_entries CASCADE`;
  });
  afterAll(() => dbm?.client.end());

  it("saves, replaces blocks, and reads back in order", async () => {
    await q.saveDay("2026-05-11", "8", "n", [
      { start: "08:00", end: "12:00", breakHours: "0" },
      { start: "13:00", end: null, breakHours: "0.5" },
    ]);
    await q.saveDay("2026-05-11", "7", null, [{ start: "09:00", end: "10:00", breakHours: "0" }]);
    const d = await q.getDay("2026-05-11");
    expect(d?.entry.targetHours).toBe("7.00");
    expect(d?.entry.note).toBeNull();
    expect(d?.blocks.map((b) => b.startTime)).toEqual(["09:00:00"]);
    expect(d!.entry.updatedAt.getTime()).toBeGreaterThanOrEqual(d!.entry.createdAt.getTime());
  });

  it("deleting a day cascades to blocks", async () => {
    await q.saveDay("2026-05-11", "8", null, [{ start: "08:00", end: "09:00", breakHours: "0" }]);
    await q.deleteDay("2026-05-11");
    expect(await q.getDay("2026-05-11")).toBeNull();
    expect(await dbm.client`SELECT 1 FROM time_blocks`).toHaveLength(0);
  });

  it("getRange is inclusive and ordered", async () => {
    for (const d of ["2026-05-03", "2026-05-01", "2026-06-01"]) await q.saveDay(d, "8", null, [{ start: "08:00", end: "09:00", breakHours: "0" }]);
    const r = await q.getRange("2026-05-01", "2026-05-31");
    expect(r.map((x) => x.entry.date)).toEqual(["2026-05-01", "2026-05-03"]);
  });

  it("getTotalSaldo handles midnight wrap, breaks, open blocks and the upTo bound", async () => {
    await q.saveDay("2026-05-01", "8", null, [{ start: "08:00", end: "17:00", breakHours: "0.5" }]); // +0.5
    await q.saveDay("2026-05-02", "4", null, [{ start: "22:00", end: "02:00", breakHours: "0" }]); // 0
    await q.saveDay("2026-05-03", "8", null, [{ start: "08:00", end: null, breakHours: "0" }]); // open only -> skipped
    await q.saveDay("2026-05-04", "8", null, []); // no blocks -> -8
    expect((await q.getTotalSaldo()).toString()).toBe("-7.5");
    expect((await q.getTotalSaldo("2026-05-02")).toString()).toBe("0.5");
  });

  it("getPage paginates newest first, filters and counts", async () => {
    for (const d of ["2026-05-01", "2026-05-02", "2026-05-03"]) await q.saveDay(d, "8", null, [{ start: "08:00", end: "09:00", breakHours: "0" }]);
    const p = await q.getPage(1, 1, undefined, undefined);
    expect(p.total).toBe(3);
    expect(p.days.map((x) => x.entry.date)).toEqual(["2026-05-02"]);
    expect((await q.getPage(0, 10, "2026-05-02", undefined)).total).toBe(2);
  });
});
