import { describe, expect, it } from "vitest";
import { recoveryOdds, type DailyPoint } from "./recovery";

const DAY = 86_400_000;

/** Flat 1000c for `len` days, with dips to 800c that last the given number of days. */
function series(len: number, dips: { at: number; lasts: number }[]) {
  const pts: DailyPoint[] = [];
  for (let i = 0; i < len; i++) {
    const dip = dips.find((d) => i >= d.at && i < d.at + d.lasts);
    pts.push({ day: i * DAY, cents: dip ? 800 : 1000, sales: 10 });
  }
  return pts;
}

describe("recoveryOdds", () => {
  const pts = series(400, [
    { at: 60, lasts: 5 },
    { at: 120, lasts: 10 },
    { at: 200, lasts: 20 },
  ]);

  it("counts past dips as deep as today's and how fast they came back", () => {
    const r = recoveryOdds(pts, 800);
    expect(r.status).toBe("estimate");
    if (r.status !== "estimate") return;
    expect(r.usualCents).toBe(1000);
    expect(r.dropPct).toBeCloseTo(0.2);
    expect(r.episodes).toBe(3);
    expect(r.within.d7).toBeCloseTo(1 / 3);
    expect(r.within.d30).toBe(1);
    expect(r.medianDays).toBe(10);
  });

  it("says when the price is not below usual", () => {
    expect(recoveryOdds(pts, 990).status).toBe("not-below");
  });

  it("can use a drop measured on another market", () => {
    const r = recoveryOdds(pts, 1000, 0.2);
    expect(r.status === "estimate" && r.episodes).toBe(3);
  });

  it("needs enough history", () => {
    expect(recoveryOdds(pts.slice(0, 20), 800).status).toBe("no-data");
  });

  it("ignores a single odd sale", () => {
    const spiky = series(400, []);
    spiky[100] = { ...spiky[100], cents: 100 };
    const r = recoveryOdds(spiky, 800);
    expect(r.status).toBe("no-data");
  });
});
