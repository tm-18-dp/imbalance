import { describe, expect, it } from "vitest";
import { MARKETPLACES, steamNet } from "./fees";
import {
  ContractError,
  evaluateContract,
  normalizeFloat,
  outcomeProbabilities,
  phaseShares,
  outputFloat,
  type ContractInput,
  type OutcomeSkin,
} from "./tradeup";

const skin = (
  id: string,
  collectionId: string,
  minFloat = 0,
  maxFloat = 1,
): OutcomeSkin => ({
  id,
  name: id,
  collectionId,
  minFloat,
  maxFloat,
  hasWear: true,
});
const input = (
  collectionId: string,
  float: number,
  costCents = 100,
  minFloat = 0,
  maxFloat = 1,
): ContractInput => ({
  collectionId,
  float,
  minFloat,
  maxFloat,
  costCents,
});
const noFee = { ...MARKETPLACES.csfloat, net: (p: number) => p };

describe("fees", () => {
  it("matches Steam's fee rules", () => {
    expect(steamNet(115)).toBe(100); // 100 + 5 + 10
    expect(steamNet(3)).toBe(1); // minimum 1 cent per fee
    expect(steamNet(2)).toBe(0);
    for (const p of [7, 50, 999, 12345]) {
      const s = steamNet(p);
      const fees =
        Math.max(1, Math.floor(s * 0.05)) + Math.max(1, Math.floor(s * 0.1));
      expect(s + fees).toBeLessThanOrEqual(p);
    }
  });
  it("takes 8% on Skinport and 2% on CSFloat", () => {
    expect(MARKETPLACES.skinport.net(10000)).toBe(9200);
    expect(MARKETPLACES.csfloat.net(10000)).toBe(9800);
  });
});

describe("floats", () => {
  it("normalizes within the skin's own range and maps onto the output range", () => {
    expect(normalizeFloat(0.4, 0.1, 0.7)).toBeCloseTo(0.5);
    expect(normalizeFloat(0.5, 0.5, 0.5)).toBe(0);
    expect(outputFloat(0.5, 0, 0.08)).toBeCloseTo(0.04);
  });
});

describe("Doppler phases", () => {
  // Like the real data: every phase has its own id, the name is shared.
  const knife = (name: string, phase?: string) => ({
    id: `${name}-${phase ?? "plain"}-${Math.random()}`,
    name,
    collectionId: "K",
    minFloat: 0,
    maxFloat: 0.08,
    hasWear: true,
    phase,
  });

  it("counts a phased knife as one draw, with rare gems", () => {
    const pool = new Map([
      [
        "K",
        [
          ...[
            "Phase 1",
            "Phase 2",
            "Phase 3",
            "Phase 4",
            "Ruby",
            "Sapphire",
          ].map((p) => knife("kara-doppler", p)),
          knife("kara-fade"),
        ],
      ],
    ]);
    const p = outcomeProbabilities(Array(5).fill("K"), pool);
    const chance = (name: string, phase?: string) =>
      p
        .filter(
          (x) => x.skin.name === name && (!phase || x.skin.phase === phase),
        )
        .reduce((s, x) => s + x.probability, 0);
    // Two knives, not seven: each is half.
    expect(chance("kara-doppler")).toBeCloseTo(0.5);
    expect(chance("kara-fade")).toBeCloseTo(0.5);
    expect(chance("kara-doppler", "Ruby")).toBeCloseTo(0.5 * 0.015);
    expect(chance("kara-doppler", "Phase 2")).toBeCloseTo((0.5 * 0.97) / 4);
    expect(p.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1);
  });

  it("splits evenly when the pool lists only gems", () => {
    expect(phaseShares(["Ruby", "Sapphire"])).toEqual([0.5, 0.5]);
    expect(phaseShares([undefined])).toEqual([1]);
  });
});

describe("outcomeProbabilities", () => {
  const pool = new Map([
    ["A", [skin("a1", "A"), skin("a2", "A")]],
    ["B", [skin("b1", "B")]],
  ]);
  it("uses the pool model: inputs from C over total tickets", () => {
    const p = outcomeProbabilities(["A", ...Array(9).fill("B")], pool);
    const by = Object.fromEntries(p.map((x) => [x.skin.id, x.probability]));
    expect(by.a1).toBeCloseTo(1 / 11);
    expect(by.a2).toBeCloseTo(1 / 11);
    expect(by.b1).toBeCloseTo(9 / 11);
    expect(p.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1);
  });
  it("splits evenly in a single collection", () => {
    const p = outcomeProbabilities(Array(10).fill("A"), pool);
    expect(p.map((x) => x.probability)).toEqual([0.5, 0.5]);
  });
});

describe("evaluateContract", () => {
  const pool = new Map([
    ["A", [skin("cheap", "A"), skin("pricey", "A")]],
    ["B", [skin("mid", "B", 0, 0.5)]],
  ]);
  const prices: Record<string, number> = {
    cheap: 500,
    pricey: 3000,
    mid: 1500,
  };
  const price = (s: OutcomeSkin) => prices[s.id] ?? null;

  it("computes EV, profit, ROI and odds to profit", () => {
    const r = evaluateContract(
      "Restricted",
      Array(10).fill(input("A", 0.2)),
      pool,
      price,
      noFee,
    );
    expect(r.costCents).toBe(1000);
    expect(r.evCents).toBe(1750); // (500 + 3000) / 2
    expect(r.profitCents).toBe(750);
    expect(r.roiPercent).toBeCloseTo(75);
    expect(r.oddsToProfit).toBeCloseTo(0.5);
    expect(r.outcomes[0].skin.id).toBe("pricey");
  });

  it("averages normalized floats, not raw floats", () => {
    // 5 inputs at the bottom of 0.1..0.7 and 5 at the top of 0..0.08: raw avg 0.09, normalized avg 0.5.
    const inputs = [
      ...Array(5).fill(input("A", 0.1, 100, 0.1, 0.7)),
      ...Array(5).fill(input("A", 0.08, 100, 0, 0.08)),
    ];
    const r = evaluateContract("Restricted", inputs, pool, price, noFee);
    expect(r.avgNormFloat).toBeCloseTo(0.5);
    expect(r.outcomes[0].float).toBeCloseTo(0.5);
    expect(r.outcomes[0].wear).toBe("Battle-Scarred");
  });

  it("predicts wear per outcome range and the float needed for a better wear", () => {
    const r = evaluateContract(
      "Restricted",
      Array(10).fill(input("B", 0.2)),
      pool,
      price,
      noFee,
    );
    const mid = r.outcomes[0];
    expect(mid.float).toBeCloseTo(0.1);
    expect(mid.wear).toBe("Minimal Wear");
    expect(mid.betterWear).toEqual({ wear: "Factory New", maxAvgNorm: 0.14 });
  });

  it("applies fees and counts missing prices as zero", () => {
    const r = evaluateContract(
      "Restricted",
      Array(10).fill(input("A", 0.2)),
      pool,
      (s) => (s.id === "pricey" ? 3000 : null),
      MARKETPLACES.skinport,
    );
    expect(r.evCents).toBe(1380); // 3000 * 0.92 / 2
    expect(r.missingPrices).toBe(1);
  });

  it("needs 5 inputs for Covert and rejects bad contracts", () => {
    expect(() =>
      evaluateContract(
        "Covert",
        Array(10).fill(input("A", 0.2)),
        pool,
        price,
        noFee,
      ),
    ).toThrow(ContractError);
    expect(
      evaluateContract(
        "Covert",
        Array(5).fill(input("A", 0.2)),
        pool,
        price,
        noFee,
      ).costCents,
    ).toBe(500);
    expect(() =>
      evaluateContract(
        "Restricted",
        Array(10).fill(input("Z", 0.2)),
        pool,
        price,
        noFee,
      ),
    ).toThrow(/nothing higher/);
    expect(() =>
      evaluateContract(
        "Restricted",
        Array(10).fill(input("A", 0.9, 100, 0, 0.5)),
        pool,
        price,
        noFee,
      ),
    ).toThrow(/outside/);
  });
});
