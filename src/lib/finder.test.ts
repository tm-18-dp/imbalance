import { describe, expect, it } from "vitest";
import { MARKETPLACES } from "./fees";
import { findContracts, optionCost, type InputOption } from "./finder";
import { openDb } from "./db";
import { saveCatalog } from "./catalog";
import { saveSkinport } from "./prices/skinport";
import { floorEstimate, loadTierData, sellPrice } from "./tradeup-data";
import { addHolding } from "./tracker";
import type { OutcomeSkin } from "./tradeup";

const noFee = { ...MARKETPLACES.csfloat, net: (p: number) => p };
const opt = (
  collectionId: string,
  costCents: number,
  float = 0.2,
  wear: InputOption["wear"] = "Field-Tested",
): InputOption => ({
  skinId: `${collectionId}-${wear}`,
  skinName: collectionId,
  image: null,
  collectionId,
  wear,
  marketHashName: `${collectionId} (${wear})`,
  float,
  minFloat: 0,
  maxFloat: 1,
  costCents,
  quantity: 50,
});
const out = (id: string, collectionId: string): OutcomeSkin => ({
  id,
  name: id,
  collectionId,
  minFloat: 0,
  maxFloat: 1,
  hasWear: true,
});

describe("findContracts", () => {
  const outcomes = new Map([
    ["GOLD", [out("jackpot", "GOLD")]],
    ["JUNK", [out("dud1", "JUNK"), out("dud2", "JUNK")]],
  ]);
  const prices: Record<string, number> = { jackpot: 50000, dud1: 10, dud2: 10 };
  const price = (s: OutcomeSkin) => prices[s.id];

  it("finds that all-target beats mixing in a bad filler", () => {
    const found = findContracts(
      [opt("GOLD", 300), opt("JUNK", 50)],
      outcomes,
      price,
      { tier: "Restricted", market: noFee },
    );
    expect(found[0].inputs).toEqual([
      { option: expect.objectContaining({ collectionId: "GOLD" }), count: 10 },
    ]);
    expect(found[0].result.profitCents).toBe(47000);
  });

  it("finds a cheap-filler mix when the target is expensive", () => {
    const found = findContracts(
      [opt("GOLD", 1000), opt("JUNK", 10)],
      outcomes,
      price,
      { tier: "Restricted", market: noFee, budgetCents: 5000 },
    );
    // 10x GOLD costs 10000, over budget. Best within budget mixes in JUNK fillers.
    expect(found.every((f) => f.result.costCents <= 5000)).toBe(true);
    const best = found[0];
    expect(best.inputs.map((i) => i.option.collectionId).sort()).toEqual([
      "GOLD",
      "JUNK",
    ]);
    expect(best.result.profitCents).toBeGreaterThan(0);
  });

  it("never needs more of a skin than is listed or owned", () => {
    const scarce = { ...opt("GOLD", 300), quantity: 3 };
    const found = findContracts([scarce, opt("JUNK", 50)], outcomes, price, {
      tier: "Restricted",
      market: noFee,
    });
    expect(
      found.every((f) => f.inputs.every((i) => i.count <= i.option.quantity)),
    ).toBe(true);
    const owned = findContracts(
      [{ ...scarce, owned: true }, opt("JUNK", 50)],
      outcomes,
      price,
      { tier: "Restricted", market: noFee },
    );
    expect(
      owned.some((f) => f.inputs.some((i) => i.option.owned && i.count === 3)),
    ).toBe(true);
    expect(
      owned.every((f) => f.inputs.every((i) => i.count <= i.option.quantity)),
    ).toBe(true);
  });

  it("prices only the first copy at the cheapest listing", () => {
    const gold = { ...opt("GOLD", 300), nextCostCents: 400 };
    expect(optionCost(gold, 1)).toBe(300);
    expect(optionCost(gold, 10)).toBe(300 + 9 * 400);
    expect(optionCost(opt("JUNK", 50), 4)).toBe(200);
    const found = findContracts([gold], outcomes, price, {
      tier: "Restricted",
      market: noFee,
    });
    expect(found[0].result.costCents).toBe(3900);
    expect(found[0].result.profitCents).toBe(50000 - 3900);
  });

  it("skips options whose collection can't trade up", () => {
    expect(
      findContracts([opt("NOWHERE", 1)], outcomes, price, {
        tier: "Restricted",
        market: noFee,
      }),
    ).toEqual([]);
  });
});

describe("swap search", () => {
  // GOLD's outcome is worth far more in Minimal Wear (average float position under 15%).
  // Only 5 cheap fillers are listed. Best two-skin mix: 7 GOLD + 3 low-float (+20.43).
  // Best overall: 6 GOLD + 2 low-float + 2 cheap (+21.29), whose average 0.148 just
  // reaches Minimal Wear. No single swap gets from the first to the second.
  const outcomes = new Map([
    ["GOLD", [out("prize", "GOLD")]],
    ["JUNK", [out("dud1", "JUNK"), out("dud2", "JUNK")]],
  ]);
  const price = (s: OutcomeSkin, wear: string | null) =>
    s.id === "prize" ? (wear === "Minimal Wear" ? 40000 : 15000) : 10;
  const options = [
    opt("GOLD", 1500, 0.2),
    {
      ...opt("JUNK", 10, 0.12),
      quantity: 5,
      skinId: "cheap",
      marketHashName: "Cheap filler",
    },
    {
      ...opt("JUNK", 3000, 0.02),
      skinId: "low",
      marketHashName: "Low-float filler",
    },
  ];
  const run = (improveSeeds?: number) =>
    findContracts(options, outcomes, price, {
      tier: "Restricted",
      market: noFee,
      improveSeeds,
    });

  it("finds a three-skin mix that beats every two-skin one", () => {
    const simple = run(0)[0];
    const swapped = run()[0];
    expect(simple.inputs).toHaveLength(2);
    expect(swapped.inputs).toHaveLength(3);
    expect(swapped.result.profitCents).toBeGreaterThan(
      simple.result.profitCents,
    );
    expect(swapped.result.avgNormFloat).toBeLessThan(0.15);
    expect(
      Object.fromEntries(swapped.inputs.map((i) => [i.option.skinId, i.count])),
    ).toEqual({ "GOLD-Field-Tested": 6, low: 2, cheap: 2 });
  });

  it("keeps and swaps to only contracts the rule accepts", () => {
    // Reject anything costing over 150: the 6 + 2 + 2 mix (150.20) is out.
    const found = findContracts(options, outcomes, price, {
      tier: "Restricted",
      market: noFee,
      accept: (r) => r.costCents <= 15000,
    });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((c) => c.result.costCents <= 15000)).toBe(true);
  });

  it("stops at the deadline", () => {
    const found = findContracts(options, outcomes, price, {
      tier: "Restricted",
      market: noFee,
      deadline: Date.now() - 1,
    });
    expect(found[0].inputs.length).toBeLessThanOrEqual(2);
  });
});

describe("loadTierData", () => {
  it("builds options at the worst float of each wear and prices outcomes by variant", () => {
    const db = openDb(":memory:");
    saveCatalog(db, {
      skins: [
        {
          id: "in",
          name: "P250 | Input",
          rarity: { id: "r", name: "Restricted" },
          min_float: 0,
          max_float: 0.5,
          stattrak: true,
          wears: [{ id: "a", name: "Field-Tested" }],
          collections: [{ id: "C", name: "C" }],
        },
        {
          id: "out",
          name: "AK-47 | Output",
          rarity: { id: "r", name: "Classified" },
          min_float: 0,
          max_float: 1,
          stattrak: true,
          wears: [{ id: "a", name: "Field-Tested" }],
          collections: [{ id: "C", name: "C" }],
        },
      ],
      collections: [{ id: "C", name: "C" }],
      crates: [],
    });
    saveSkinport(db, {
      items: [
        {
          market_hash_name: "StatTrak™ P250 | Input (Field-Tested)",
          min_price: 1,
          quantity: 3,
        },
        {
          market_hash_name: "P250 | Input (Field-Tested)",
          min_price: 0.5,
          quantity: 3,
        },
        {
          market_hash_name: "StatTrak™ AK-47 | Output (Field-Tested)",
          min_price: 30,
          quantity: 2,
        },
      ],
      history: [],
    });
    const d = loadTierData(db, "Restricted", "stattrak");
    expect(d.options).toHaveLength(1);
    expect(d.options[0]).toMatchObject({
      costCents: 100,
      wear: "Field-Tested",
    });
    expect(d.options[0].float).toBeCloseTo(0.38 - 1e-6);
    addHolding(db, {
      marketHashName: "StatTrak™ P250 | Input (Field-Tested)",
      costCents: 90,
      boughtAt: 1,
      float: 0.16,
    });
    addHolding(db, {
      marketHashName: "StatTrak™ P250 | Input (Field-Tested)",
      costCents: 110,
      boughtAt: 1,
      float: 0.31,
    });
    const owned = loadTierData(db, "Restricted", "stattrak", true).options.find(
      (o) => o.owned,
    )!;
    expect(owned).toMatchObject({ quantity: 2, float: 0.31, costCents: 100 });
    const outSkin = d.outcomes.get("C")![0];
    expect(d.price(outSkin, "Field-Tested")).toBe(3000);
    expect(d.priceSource(outSkin, "Field-Tested")).toBe("skinport");
    expect(d.options[0].nextCostCents).toBe(100);

    // A checked Steam price wins when selling on Steam, and only then.
    db.prepare(
      `INSERT INTO prices (market_hash_name, source, version, min_cents, median_cents, quantity, updated_at)
       VALUES (?, 'steam', '', 3600, 3500, 40, ?)`,
    ).run("StatTrak™ AK-47 | Output (Field-Tested)", Date.now());
    const steam = loadTierData(db, "Restricted", "stattrak", false, true);
    expect(steam.price(outSkin, "Field-Tested")).toBe(3500);
    expect(steam.priceSource(outSkin, "Field-Tested")).toBe("steam");
    expect(
      loadTierData(db, "Restricted", "stattrak").price(outSkin, "Field-Tested"),
    ).toBe(3000);

    // Falling for weeks: 90 days at $40, 30 days at $36, this week $32. The sell price
    // (the 7-day median) is lowered by the 30-day to 7-day drop, on Steam's price too.
    db.prepare(
      `INSERT INTO price_history (market_hash_name, source, version, median_24h, volume_24h,
         median_7d, volume_7d, median_30d, volume_30d, median_90d, volume_90d, updated_at)
       VALUES (?, 'skinport', '', 3200, 2, 3200, 6, 3600, 20, 4000, 60, ?)`,
    ).run("StatTrak™ AK-47 | Output (Field-Tested)", Date.now());
    const falling = loadTierData(db, "Restricted", "stattrak");
    expect(falling.trend(outSkin, "Field-Tested")).toEqual({
      signal: "falling",
      cut: expect.closeTo(1 / 9),
    });
    expect(falling.price(outSkin, "Field-Tested")).toBe(
      Math.round((3200 * 8) / 9),
    );
    expect(
      loadTierData(db, "Restricted", "stattrak", false, true).price(
        outSkin,
        "Field-Tested",
      ),
    ).toBe(Math.round((3500 * 8) / 9));
  });

  it("uses the most recent sales median with enough sales", () => {
    const row = {
      market_hash_name: "x",
      version: "",
      min_cents: 100,
      quantity: 1,
      median_7d: 90,
      volume_7d: 5,
      median_30d: 80,
      volume_30d: 10,
      median_90d: 70,
      volume_90d: 30,
    };
    expect(sellPrice(row)).toBe(90);
    expect(sellPrice({ ...row, volume_7d: 1 })).toBe(80);
    expect(sellPrice({ ...row, volume_7d: 1, volume_30d: 2 })).toBe(70);
    // Two sales at 70 beat a lone listing at 100: the listing may be wishful.
    expect(
      sellPrice({ ...row, volume_7d: 0, volume_30d: 0, volume_90d: 2 }),
    ).toBe(70);
    // A listing below the sparse sales is the real price to beat.
    expect(
      sellPrice({
        ...row,
        min_cents: 50,
        volume_7d: 0,
        volume_30d: 0,
        volume_90d: 2,
      }),
    ).toBe(50);
    // No sales at all: the listing is all there is.
    expect(
      sellPrice({ ...row, volume_7d: 0, volume_30d: 0, volume_90d: 0 }),
    ).toBe(100);
    expect(sellPrice(undefined)).toBeNull();
    // No listing and only a couple of sales: the sparse median beats nothing.
    const rare = {
      ...row,
      min_cents: null,
      median_7d: null,
      volume_7d: 0,
      median_30d: null,
      volume_30d: 0,
      median_90d: 33100,
      volume_90d: 2,
    };
    expect(sellPrice(rare)).toBe(33100);
    expect(sellPrice({ ...rare, median_90d: null, volume_90d: 0 })).toBeNull();
  });

  it("estimates a cautious floor for unpriced rare wears and phases", () => {
    // Prices by phase and wear for one Doppler knife; FN and the gems are missing.
    const known: Record<string, number> = {
      "Phase 1|Minimal Wear": 30000,
      "Phase 2|Minimal Wear": 33000,
      "Phase 2|Factory New": 40000,
    };
    const lookup = (phase: string | undefined, wear: string | null) =>
      known[`${phase}|${wear}`] ?? null;
    // Ruby MW: at least the cheapest normal phase in MW.
    expect(floorEstimate(lookup, "Ruby", "Minimal Wear")).toBe(30000);
    // Ruby FN: the cheapest normal phase in FN.
    expect(floorEstimate(lookup, "Ruby", "Factory New")).toBe(40000);
    // Phase 1 FN: at least Phase 1 in the next worse wear.
    expect(floorEstimate(lookup, "Phase 1", "Factory New")).toBe(30000);
    // Nothing related priced: no guess.
    expect(floorEstimate(lookup, "Phase 3", "Factory New")).toBeNull();
    expect(floorEstimate(() => null, undefined, null)).toBeNull();
    // A plain skin falls back through worse wears.
    const plain = (_: string | undefined, wear: string | null) =>
      wear === "Field-Tested" ? 9000 : null;
    expect(floorEstimate(plain, undefined, "Factory New")).toBe(9000);
  });
});
