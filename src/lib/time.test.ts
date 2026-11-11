import { describe, expect, it } from "vitest";
import { blockActualHours, dailySaldo, dayActualHours, formatSaldo, parseTimeInput } from "./time.js";

describe("time", () => {
  it("wraps blocks past midnight and subtracts break", () => {
    expect(blockActualHours("22:00", "02:00", "0.5")?.toString()).toBe("3.5");
  });
  it("is null while a block runs", () => {
    expect(blockActualHours("08:00", null, 0)).toBeNull();
    expect(dayActualHours([{ start: "08:00", end: null, breakHours: 0 }])).toBeNull();
  });
  it("computes saldo", () => {
    const a = dayActualHours([{ start: "08:00", end: "17:00", breakHours: 0.5 }]);
    expect(formatSaldo(dailySaldo(a, 8)!)).toBe("+0.50");
  });
  it("parses time input", () => {
    expect(parseTimeInput("8:30")).toBe("08:30");
    expect(parseTimeInput("0830")).toBe("08:30");
    expect(parseTimeInput("2460")).toBeNull();
  });
});

describe("formatHM", () => {
  it("formats HH:MM, rounds to the minute, signs", async () => {
    const { formatHM } = await import("./time.js");
    expect(formatHM("7.83")).toBe("07:50");
    expect(formatHM("0.5", true)).toBe("+00:30");
    expect(formatHM("-4", true)).toBe("-04:00");
    expect(formatHM("0", true)).toBe("±00:00");
  });
});
