import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import {
  classifyTrend,
  MAX_TREND_CUT,
  pruneSnapshots,
  snapshotSeries,
  TREND_MIN_SALES_30D,
  trendCut,
} from "./trend";

const t = (
  nowCents: number | null,
  d1: number | null,
  d7: number | null,
  d30: number | null,
  d90: number | null,
) => ({
  nowCents,
  median24h: d1,
  median7d: d7,
  median30d: d30,
  median90d: d90,
});

describe("classifyTrend", () => {
  it.each([
    ["dip", t(85, 90, 95, 100, 100)], // cheap now, long-term steady
    ["falling", t(70, 70, 75, 90, 100)], // weeks of decline
    ["rebounding", t(90, 92, 85, 100, 100)], // dropped, last day climbing back
    ["rising", t(120, 120, 120, 100, 100)],
    ["stable", t(100, 100, 100, 100, 100)],
    ["unknown", t(100, null, null, 100, 100)],
  ])("%s", (signal, input) => expect(classifyTrend(input)).toBe(signal));

  it("does not call a drop a dip when the long-term price is moving too", () => {
    expect(classifyTrend(t(85, 90, 95, 100, 130))).not.toBe("dip");
  });
});

describe("snapshots", () => {
  const DAY = 86_400_000;
  it("keeps the last 7 days, one a day to 90 days, one a week after", () => {
    const db = openDb(":memory:");
    const now = 400 * DAY;
    const ins = db.prepare(
      "INSERT INTO price_snapshots (market_hash_name, source, version, taken_at, min_cents, quantity) VALUES ('A', 'skinport', '', ?, ?, 1)",
    );
    // Every 6 hours for 200 days.
    for (let at = now - 200 * DAY; at < now; at += DAY / 4) ins.run(at, 100);
    pruneSnapshots(db, now);
    const series = snapshotSeries(db, "A");
    const count = (from: number, to: number) =>
      series.filter((p) => p.at >= now - from * DAY && p.at < now - to * DAY)
        .length;
    expect(count(7, 0)).toBe(28);
    expect(count(90, 7)).toBe(83);
    expect(count(200, 90)).toBeLessThanOrEqual(17);
    expect(series[0].at).toBeLessThan(series[1].at);
  });
});

describe("trend cut for trade-up sell prices", () => {
  const falling = { median7d: 8000, median30d: 9000 };

  it("lowers falling items by the 30-day to 7-day drop", () => {
    expect(trendCut("falling", falling, 20)).toBeCloseTo(1 / 9);
  });

  it("caps the cut at 25%", () => {
    expect(trendCut("falling", { median7d: 4000, median30d: 9000 }, 20)).toBe(
      MAX_TREND_CUT,
    );
  });

  it("leaves other trends, thin markets and odd medians alone", () => {
    expect(trendCut("rising", falling, 20)).toBe(0);
    expect(trendCut("dip", falling, 20)).toBe(0);
    expect(trendCut("falling", falling, TREND_MIN_SALES_30D - 1)).toBe(0);
    // Falling against the 90-day price but up this week: no extra cut.
    expect(trendCut("falling", { median7d: 9500, median30d: 9000 }, 20)).toBe(
      0,
    );
    expect(trendCut("falling", { median7d: null, median30d: 9000 }, 20)).toBe(
      0,
    );
  });
});
