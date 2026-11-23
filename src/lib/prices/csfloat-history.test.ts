import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../db";
import { dailyHistory } from "./csfloat-history";

const body = [
  { count: 22, day: "2026-11-19T00:00:00Z", avg_price: 4395.4 },
  { count: 71, day: "2026-11-18T00:00:00Z", avg_price: 5088.8 },
];

afterEach(() => vi.unstubAllGlobals());

describe("dailyHistory", () => {
  it("saves CSFloat's daily history oldest first and reuses it for 12 hours", async () => {
    const db = openDb(":memory:");
    const fetchMock = vi.fn(async () => Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    const first = await dailyHistory(db, "AK-47 | Redline (Field-Tested)");
    expect(first.points).toEqual([
      { day: Date.parse("2026-11-18T00:00:00Z"), cents: 5089, sales: 71 },
      { day: Date.parse("2026-11-19T00:00:00Z"), cents: 4395, sales: 22 },
    ]);
    await dailyHistory(db, "AK-47 | Redline (Field-Tested)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the saved copy with an error when CSFloat is down", async () => {
    const db = openDb(":memory:");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    const r = await dailyHistory(db, "X");
    expect(r.points).toEqual([]);
    expect(r.error).toMatch(/error 500/);
  });
});
