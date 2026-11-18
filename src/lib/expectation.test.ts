import { describe, expect, it } from "vitest";
import { saveCatalog } from "./catalog";
import { openDb } from "./db";
import {
  chanceOfResult,
  expectedVsActual,
  readExpectation,
  type ContractCheck,
  type Expectation,
} from "./expectation";
import { saveSkinport } from "./prices/skinport";
import {
  addHolding,
  DAY,
  exportTracker,
  importTracker,
  listHoldings,
  recordTradeUp,
} from "./tracker";
import { expectTradeUp } from "./tradeup-expect";

const check = (o: Partial<ContractCheck>): ContractCheck => ({
  id: 1,
  marketHashName: "x",
  costCents: 1000,
  expectedCents: 1200,
  sdCents: 600,
  actualCents: 1200,
  sold: true,
  chance: 0.5,
  floatsEstimated: false,
  ...o,
});

describe("expected vs actual", () => {
  it("says nothing with no results and too little with a few", () => {
    expect(expectedVsActual([]).verdict).toBe("none");
    const few = expectedVsActual([check({ actualCents: 300 })]);
    expect(few).toMatchObject({
      counted: 1,
      expectedCents: 1200,
      actualCents: 300,
      verdict: "too-few",
    });
    expect(few.z).toBeCloseTo(-1.5);
  });

  it("judges 20 or more against the luck expected over that many", () => {
    // 20 contracts, each 100 under: total -2000 against sd 600 * sqrt(20) = 2683.
    const close = Array.from({ length: 20 }, () =>
      check({ actualCents: 1100 }),
    );
    expect(expectedVsActual(close).verdict).toBe("as-expected");
    // Each 300 under: -6000 is 2.2 sd below.
    const low = Array.from({ length: 20 }, () => check({ actualCents: 900 }));
    expect(expectedVsActual(low).verdict).toBe("below");
    const high = Array.from({ length: 20 }, () => check({ actualCents: 1500 }));
    expect(expectedVsActual(high).verdict).toBe("above");
  });

  it("leaves out results with no price and counts unpredicted ones", () => {
    const r = expectedVsActual([
      check({ actualCents: null }),
      check({ chance: null }),
    ]);
    expect(r.counted).toBe(1);
    expect(r.unexpected).toBe(1);
  });

  it("reads saved expectations and sums the chance over phases", () => {
    const e: Expectation = {
      v: 1,
      market: "skinport",
      costCents: 100,
      evCents: 120,
      sdCents: 10,
      floatsEstimated: false,
      missingPrices: 0,
      outcomes: [
        {
          name: "★ Karambit | Doppler (Factory New)",
          probability: 0.1,
          netCents: 1,
        },
        {
          name: "★ Karambit | Doppler (Factory New)",
          probability: 0.05,
          netCents: 2,
        },
      ],
    };
    expect(readExpectation(JSON.stringify(e))).toEqual(e);
    expect(readExpectation("not json")).toBeNull();
    expect(readExpectation({ v: 2 })).toBeNull();
    expect(chanceOfResult(e, "★ Karambit | Doppler (Factory New)")).toBeCloseTo(
      0.15,
    );
    expect(chanceOfResult(e, "AK-47 | Redline (Field-Tested)")).toBeNull();
  });
});

describe("expectation of a recorded trade-up", () => {
  function setup() {
    const db = openDb(":memory:");
    const skin = (id: string, name: string, rarity: string, col: string) => ({
      id,
      name,
      rarity: { id: rarity, name: rarity },
      min_float: 0,
      max_float: 1,
      stattrak: true,
      wears: [
        { id: "a", name: "Field-Tested" },
        { id: "b", name: "Minimal Wear" },
      ],
      collections: [{ id: col, name: col }],
    });
    saveCatalog(db, {
      skins: [
        skin("in", "P250 | Input", "Restricted", "A"),
        skin("in2", "MP9 | Other", "Restricted", "B"),
        skin("outA", "AK-47 | Prize", "Classified", "A"),
        skin("outB", "M4A4 | Dud", "Classified", "B"),
      ],
      collections: [
        { id: "A", name: "A" },
        { id: "B", name: "B" },
      ],
      crates: [],
    });
    saveSkinport(db, {
      items: [
        {
          market_hash_name: "AK-47 | Prize (Field-Tested)",
          min_price: 50,
          quantity: 3,
        },
        {
          market_hash_name: "M4A4 | Dud (Field-Tested)",
          min_price: 2,
          quantity: 3,
        },
      ],
      history: [],
    });
    return db;
  }
  const buy = (
    db: ReturnType<typeof openDb>,
    name: string,
    float: number | null,
  ) =>
    addHolding(db, {
      marketHashName: name,
      costCents: 100,
      boughtAt: 1000 * DAY,
      float,
    });

  it("works out the contract from the inputs that went in", () => {
    const db = setup();
    const inputs = [
      ...Array.from({ length: 5 }, () => ({
        marketHashName: "P250 | Input (Field-Tested)",
        float: 0.3,
        costCents: 100,
      })),
      ...Array.from({ length: 5 }, () => ({
        marketHashName: "MP9 | Other (Field-Tested)",
        float: null,
        costCents: 100,
      })),
    ];
    const r = expectTradeUp(db, inputs, "skinport");
    if (!("expectation" in r)) throw new Error(r.reason);
    const e = r.expectation;
    expect(e).toMatchObject({ costCents: 1000, floatsEstimated: true });
    // Half the chance each; both land Field-Tested. $50 and $2 after Skinport's 8%.
    expect(e.outcomes).toEqual([
      {
        name: "AK-47 | Prize (Field-Tested)",
        probability: 0.5,
        netCents: 4600,
      },
      { name: "M4A4 | Dud (Field-Tested)", probability: 0.5, netCents: 184 },
    ]);
    expect(e.evCents).toBe(2392);
    expect(e.sdCents).toBe(2208);
  });

  it("explains when the inputs can't make a contract", () => {
    const db = setup();
    const mixed = [
      {
        marketHashName: "StatTrak™ P250 | Input (Field-Tested)",
        float: 0.3,
        costCents: 1,
      },
      {
        marketHashName: "P250 | Input (Field-Tested)",
        float: 0.3,
        costCents: 1,
      },
    ];
    expect(expectTradeUp(db, mixed, "skinport")).toHaveProperty("reason");
    const unknown = [
      {
        marketHashName: "Nope | Nothing (Field-Tested)",
        float: 0.3,
        costCents: 1,
      },
    ];
    expect(expectTradeUp(db, unknown, "skinport")).toEqual({
      reason: "Nope | Nothing (Field-Tested) isn't in the skin list.",
    });
  });

  it("saves the expectation on the result and keeps it in backups", () => {
    const db = setup();
    const ids = Array.from({ length: 10 }, () =>
      buy(db, "P250 | Input (Field-Tested)", 0.3),
    );
    const out = recordTradeUp(
      db,
      ids,
      { marketHashName: "AK-47 | Prize (Field-Tested)" },
      1001 * DAY,
      (inputs) => {
        const r = expectTradeUp(db, inputs, "skinport");
        return "expectation" in r ? r.expectation : null;
      },
    );
    const saved = listHoldings(db).find((h) => h.id === out)!.expected!;
    expect(saved.evCents).toBe(4600);
    expect(chanceOfResult(saved, "AK-47 | Prize (Field-Tested)")).toBe(1);

    const copy = openDb(":memory:");
    importTracker(copy, JSON.parse(JSON.stringify(exportTracker(db))));
    expect(listHoldings(copy).find((h) => h.id === out)!.expected).toEqual(
      saved,
    );
  });
});
