import { describe, expect, it } from "vitest";
import { MARKETPLACES } from "./fees";
import { findContracts, optionCost, type InputOption } from "./finder";
import { openDb } from "./db";
import { saveCatalog } from "./catalog";
import { saveSkinport } from "./prices/skinport";
import { loadTierData, sellPrice } from "./tradeup-data";
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
    expect(
      sellPrice({ ...row, volume_7d: 0, volume_30d: 0, volume_90d: 2 }),
    ).toBe(100);
    expect(sellPrice(undefined)).toBeNull();
  });
});
