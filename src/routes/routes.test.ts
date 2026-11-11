import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/queries.js", () => ({
  getDay: vi.fn(),
  getRange: vi.fn(),
  getPage: vi.fn(),
  getTotalSaldo: vi.fn(),
  saveDay: vi.fn(),
  saveEntry: vi.fn(),
  addBlock: vi.fn(),
  updateBlock: vi.fn(),
  deleteBlock: vi.fn(),
  getBlock: vi.fn(),
  deleteDay: vi.fn(),
}));

import Decimal from "decimal.js";
import * as q from "../db/queries.js";
import { analyticsRoutes } from "./analytics.js";
import { dashboardRoutes } from "./dashboard.js";
import { dayRoutes } from "./day.js";
import { historyRoutes } from "./history.js";
import { monthRoutes } from "./month.js";

const app = new Hono();
for (const r of [dashboardRoutes, dayRoutes, monthRoutes, historyRoutes, analyticsRoutes]) app.route("/", r);

const day = (date: string, start: string, end: string | null, brk = "0.50", target = "8.00") => ({
  entry: { id: date, date, targetHours: target, note: "n", createdAt: new Date(), updatedAt: new Date() },
  blocks: [{ id: "b", entryId: date, startTime: start, endTime: end, breakHours: brk, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
});
const post = (path: string, body: Record<string, string | string[]>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) [v].flat().forEach((x) => p.append(k, x));
  return app.request(path, { method: "POST", body: p, headers: { "content-type": "application/x-www-form-urlencoded" } });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(q.getRange).mockResolvedValue([]);
  vi.mocked(q.getDay).mockResolvedValue(null);
  vi.mocked(q.getTotalSaldo).mockResolvedValue(new Decimal(0));
  vi.mocked(q.getPage).mockResolvedValue({ days: [], total: 0 });
});

describe("day", () => {
  it("rejects invalid dates", async () => {
    expect((await app.request("/day/nope")).status).toBe(400);
    expect((await post("/day/2026-13-45", { target_hours: "8" })).status).toBe(400);
  });

  it("shows actual and saldo", async () => {
    vi.mocked(q.getDay).mockResolvedValue(day("2026-05-11", "08:00:00", "17:00:00"));
    const html = await (await app.request("/day/2026-05-11")).text();
    expect(html).toContain("08:30");
    expect(html).toContain("+00:30");
  });

  it("saves entry fields only, blank note -> null", async () => {
    const res = await post("/day/2026-05-11", { target_hours: "8", note: "  ", return_to: "/month/2026-05" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/month/2026-05");
    expect(q.saveEntry).toHaveBeenCalledWith("2026-05-11", "8", null);
  });

  it("adds a block, parsing times and break", async () => {
    const res = await post("/day/2026-05-11/blocks", { start: "8:00", end: "1700", brk: "0.5" });
    expect(res.headers.get("hx-refresh")).toBe("true");
    expect(q.addBlock).toHaveBeenCalledWith("2026-05-11", "8", { start: "08:00", end: "17:00", breakHours: "0.5" });
  });

  it("adds a running block without end/break", async () => {
    await post("/day/2026-05-11/blocks", { start: "09:00", end: "", brk: "" });
    expect(q.addBlock).toHaveBeenCalledWith("2026-05-11", "8", { start: "09:00", end: null, breakHours: "0" });
  });

  it("rejects a block without valid start or with bad break", async () => {
    expect((await post("/day/2026-05-11/blocks", { start: "bad" })).status).toBe(400);
    expect((await post("/day/2026-05-11/blocks", { start: "08:00", brk: "-1" })).status).toBe(400);
    expect(q.addBlock).not.toHaveBeenCalled();
  });

  it("updates and deletes a block by id, rejects non-uuid ids", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    await post(`/day/2026-05-11/block/${id}`, { start: "08:00", end: "12:00", brk: "" });
    expect(q.updateBlock).toHaveBeenCalledWith(id, { start: "08:00", end: "12:00", breakHours: "0" });
    await post(`/day/2026-05-11/block/${id}/delete`, {});
    expect(q.deleteBlock).toHaveBeenCalledWith(id);
    expect((await post("/day/2026-05-11/block/nope/delete", {})).status).toBe(400);
  });

  it("prefills new block start with the end of the last block", async () => {
    vi.mocked(q.getDay).mockResolvedValue(day("2026-05-11", "08:00:00", "12:00:00"));
    expect(await (await app.request("/day/2026-05-11/block-form")).text()).toContain('value="12:00"');
  });

  it("edit editor offers delete", async () => {
    vi.mocked(q.getDay).mockResolvedValue(day("2026-05-11", "08:00:00", "12:00:00"));
    expect(await (await app.request("/day/2026-05-11/block/b/edit")).text()).toContain("/block/b/delete");
    expect((await app.request("/day/2026-05-11/block/zz/edit")).status).toBe(404);
  });

  it("renders saved blocks as timeline segments plus a new-block editor", async () => {
    vi.mocked(q.getDay).mockResolvedValue(day("2026-05-11", "08:00:00", "17:00:00"));
    const html = await (await app.request("/day/2026-05-11")).text();
    expect(html).toContain("08:00–17:00");
    expect(html).toContain("/day/2026-05-11/block/b/edit");
    expect(html).toContain("/day/2026-05-11/blocks");
  });

  it("rejects bad target hours", async () => {
    expect((await post("/day/2026-05-11", { target_hours: "99" })).status).toBe(400);
    expect(q.saveDay).not.toHaveBeenCalled();
  });

  it.each(["//evil.com", "https://evil.com", "evil"])("ignores unsafe return_to %s", async (r) => {
    const res = await post("/day/2026-05-11/delete", { return_to: r });
    expect(res.headers.get("location")).toBe("/month/2026-05");
    expect(q.deleteDay).toHaveBeenCalledWith("2026-05-11");
  });
});

describe("month", () => {
  it("rejects bad months", async () => {
    expect((await app.request("/month/2026-13")).status).toBe(400);
    expect((await app.request("/month/x")).status).toBe(400);
  });

  it("totals the month: missing workdays count as deficit", async () => {
    // Feb 2026: 20 workdays x 8h = 160 target, one 9h day logged.
    vi.mocked(q.getRange).mockResolvedValue([day("2026-02-02", "08:00:00", "17:30:00")]);
    const html = await (await app.request("/month/2026-02")).text();
    expect(html).toContain("160:00");
    expect(html).toContain("-151:00");
    expect(html).toContain("March 2026");
  });

  it("wraps year in navigation", async () => {
    const html = await (await app.request("/month/2026-01")).text();
    expect(html).toContain("/month/2025-12");
  });
});

describe("dashboard", () => {
  it("renders running saldo and 7 days", async () => {
    vi.mocked(q.getTotalSaldo).mockResolvedValue(new Decimal("3.5"));
    const html = await (await app.request("/")).text();
    expect(html).toContain("+03:30");
    expect((html.match(/href="\/day\/\d{4}-\d{2}-\d{2}"/g) ?? []).length).toBe(7);
  });
});

describe("history", () => {
  it("ignores invalid filters and paginates", async () => {
    vi.mocked(q.getPage).mockResolvedValue({ days: [day("2026-05-11", "08:00:00", "17:00:00")], total: 120 });
    vi.mocked(q.getTotalSaldo).mockResolvedValue(new Decimal(2));
    const html = await (await app.request("/history?page=2&from=garbage&to=2026-05-31")).text();
    expect(q.getPage).toHaveBeenCalledWith(50, 50, undefined, "2026-05-31");
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain("120 entries total");
  });
});

describe("analytics", () => {
  it("handles empty data", async () => {
    const res = await app.request("/analytics");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("N/A");
    expect(html).toContain("No data");
  });

  it("computes stats, treating midnight-crossing blocks and open blocks", async () => {
    vi.mocked(q.getRange).mockResolvedValue([
      day("2026-05-11", "08:00:00", "17:00:00"), // 8.5 -> +0.5 (Monday)
      day("2026-05-12", "22:00:00", "02:00:00", "0"), // 4h -> -4
      day("2026-05-13", "08:00:00", null), // running -> 0 actual
    ]);
    const html = await (await app.request("/analytics?range=all&heatmap_year=2026")).text();
    expect(html).toContain("06:15"); // avg of workdays with actual > 0: (8.5 + 4) / 2
    expect(html).toContain("Monday");
    expect(html).toContain("33.3%"); // 1 of 3 workdays over target
  });
});
