import { describe, expect, it } from "vitest";
import {
  betterWearThresholds,
  floatSolver,
  planExactFloats,
  type FloatListing,
  type InputGroup,
} from "./exact-float";
import { normalizeFloat, type OutcomeSkin } from "./tradeup";

let nextId = 0;
const listing = (float: number, priceCents: number): FloatListing => ({
  id: `L${nextId++}`,
  marketHashName: "x",
  priceCents,
  float,
  url: "",
});
const group = (
  count: number,
  listings: FloatListing[],
  collectionId = "C",
): InputGroup => ({
  skinName: collectionId,
  collectionId,
  count,
  minFloat: 0,
  maxFloat: 1,
  listings,
});

describe("floatSolver", () => {
  it("takes the cheapest listings when any float will do", () => {
    const g = group(2, [
      listing(0.9, 100),
      listing(0.1, 300),
      listing(0.8, 120),
    ]);
    const r = floatSolver([g])!.cheapestUnder(2)!;
    expect(r.costCents).toBe(220);
    expect(r.picks.map((p) => p.listing.float).sort()).toEqual([0.8, 0.9]);
  });

  it("pays a little more to stay under a float target", () => {
    const g = group(2, [
      listing(0.9, 100),
      listing(0.1, 300),
      listing(0.2, 150),
      listing(0.8, 120),
    ]);
    // Average under 0.5: sum under 1.0. Cheapest fit: 0.2 + 0.8 for 270.
    const r = floatSolver([g])!.cheapestUnder(1.0)!;
    expect(r.costCents).toBe(270);
    expect(r.picks.map((p) => p.listing.float).sort()).toEqual([0.2, 0.8]);
    // Average under 0.15: only 0.1 + 0.2 fits.
    expect(floatSolver([g])!.cheapestUnder(0.3)!.costCents).toBe(450);
    expect(floatSolver([g])!.cheapestUnder(0.1)).toBeNull();
  });

  it("combines groups, and needs enough listings in each", () => {
    const a = group(1, [listing(0.5, 50), listing(0.05, 400)], "A");
    const b = group(
      2,
      [listing(0.1, 80), listing(0.6, 30), listing(0.7, 20)],
      "B",
    );
    // Any float: 50 + 30 + 20.
    expect(floatSolver([a, b])!.cheapestUnder(3)!.costCents).toBe(100);
    // Sum under 0.75: 0.05 + 0.1 + 0.6 = 0.75 for 510; 0.5 + 0.1 + ... doesn't fit.
    expect(floatSolver([a, b])!.cheapestUnder(0.75)!.costCents).toBe(510);
    expect(floatSolver([group(3, [listing(0.1, 1)])])).toBeNull();
  });

  it("never promises a plan that goes over its target", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let trial = 0; trial < 40; trial++) {
      const g = {
        ...group(
          4,
          Array.from({ length: 12 }, () =>
            listing(0.06 + rand() * 0.3, 50 + Math.floor(rand() * 200)),
          ),
        ),
        minFloat: 0.06,
        maxFloat: 0.8,
      };
      const target = 0.1 + rand() * 0.3;
      const r = floatSolver([g])!.cheapestUnder(target * 4);
      if (!r) continue;
      const avg =
        r.picks.reduce(
          (s, p) => s + normalizeFloat(p.listing.float, 0.06, 0.8),
          0,
        ) / 4;
      expect(avg).toBeLessThanOrEqual(target + 1e-9);
      expect(new Set(r.picks.map((p) => p.listing.id)).size).toBe(4);
    }
  });
});

describe("planExactFloats", () => {
  const out: OutcomeSkin = {
    id: "prize",
    name: "Prize",
    collectionId: "C",
    minFloat: 0,
    maxFloat: 1,
    hasWear: true,
  };
  const pool = new Map([["C", [out]]]);
  // Minimal Wear is worth far more than Field-Tested.
  const prices: Record<string, number> = {
    "Factory New": 9000,
    "Minimal Wear": 5000,
    "Field-Tested": 1500,
    "Well-Worn": 1000,
    "Battle-Scarred": 800,
  };
  const noFee = {
    id: "csfloat" as const,
    label: "x",
    feeNote: "",
    net: (p: number) => p,
  };

  it("finds that buying low floats lifts the outcome a wear", () => {
    const listings = [
      ...Array.from({ length: 10 }, () => listing(0.3, 100)), // cheap, lands FT
      ...Array.from({ length: 10 }, () => listing(0.12, 130)), // pricier, lands MW
    ];
    const plans = planExactFloats(
      "Restricted",
      [group(10, listings)],
      pool,
      (_, wear) => (wear ? prices[wear] : null),
      noFee,
    );
    const best = plans[0];
    expect(best.target).not.toBeNull();
    expect(best.result.outcomes[0].wear).toBe("Minimal Wear");
    // Nine low floats and one cheap high float still average 0.138, under 0.149
    // (Minimal Wear's 0.15 less the safety margin): cheaper than ten low floats.
    expect(best.result.costCents).toBe(9 * 130 + 100);
    expect(best.result.avgNormFloat).toBeCloseTo(0.138);
    expect(best.result.profitCents).toBe(5000 - 1270);
    const cheapest = plans.find((p) => p.target === null)!;
    expect(cheapest.result.outcomes[0].wear).toBe("Field-Tested");
    expect(cheapest.result.profitCents).toBe(1500 - 1000);
  });

  it("lists the better-wear thresholds of an outcome", () => {
    expect(betterWearThresholds(out)).toEqual([0.07, 0.15, 0.38, 0.45]);
    expect(
      betterWearThresholds({ ...out, minFloat: 0.1, maxFloat: 0.5 }).map((t) =>
        Number(t.toFixed(3)),
      ),
    ).toEqual([0.125, 0.7, 0.875]);
    expect(betterWearThresholds({ ...out, hasWear: false })).toEqual([]);
  });
});
