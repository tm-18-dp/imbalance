import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { saveSkinport } from "./prices/skinport";
import { botSummary, pickOutcome, type SimPosition } from "./sim";
import {
  createBot,
  deleteBot,
  getBot,
  listBots,
  listPositions,
  listSnapshots,
  runBot,
  type SimContract,
} from "./sim-data";

const DAY = 86_400_000;
const T0 = 1000 * DAY;
const win = (median: number | null, volume: number) => ({ median, volume });
const AK = "AK-47 | Redline (Field-Tested)";

/** One deal: listed at $15, usually sells for $20, 90 sales a month. */
function seeded() {
  const db = openDb(":memory:");
  saveSkinport(db, {
    items: [{ market_hash_name: AK, min_price: 15, quantity: 4 }],
    history: [
      {
        market_hash_name: AK,
        last_24_hours: win(null, 0),
        last_7_days: win(20, 30),
        last_30_days: win(20, 90),
        last_90_days: win(20, 250),
      },
    ],
  });
  return db;
}
const noTradeups = async () => [];

describe("practice bots", () => {
  it("rolls trade-up results with the app's odds", () => {
    const outcomes = [
      { name: "a", probability: 0.15 },
      { name: "b", probability: 0.85 },
    ];
    expect(pickOutcome(outcomes, 0).name).toBe("a");
    expect(pickOutcome(outcomes, 0.1499).name).toBe("a");
    expect(pickOutcome(outcomes, 0.15).name).toBe("b");
    expect(pickOutcome(outcomes, 0.9999).name).toBe("b");
    // Over many rolls each comes up about as often as its chance.
    let a = 0;
    for (let i = 0; i < 10000; i++)
      if (pickOutcome(outcomes, (i + 0.5) / 10000).name === "a") a++;
    expect(a).toBe(1500);
  });

  it("sums value, profit and win rate", () => {
    const p = (o: Partial<SimPosition>): SimPosition => ({
      id: 1,
      botId: 1,
      marketHashName: "x",
      version: "",
      costCents: 1000,
      boughtAt: 0,
      tradableAt: 0,
      sellAfter: 0,
      status: "holding",
      soldNetCents: null,
      soldAt: null,
      detail: null,
      ...o,
    });
    const s = botSummary(
      { cashCents: 5000, startCents: 10000 },
      [
        p({ status: "sold", soldNetCents: 1500 }),
        p({ status: "sold", soldNetCents: 800 }),
        p({ marketHashName: "priced" }),
        p({ marketHashName: "unpriced" }),
      ],
      (x) => (x.marketHashName === "priced" ? 1200 : null),
    );
    expect(s).toEqual({
      valueCents: 5000 + 1200 + 1000,
      returnPct: -28,
      realizedCents: 300,
      unrealizedCents: 200,
      holding: 2,
      sold: 2,
      winRate: 0.5,
      unpriced: 1,
    });
  });

  it("buys a deal at the lowest listing, waits out the hold and sells at the usual price", async () => {
    const db = seeded();
    const id = createBot(
      db,
      {
        name: "Deal bot",
        strategy: "deals",
        risk: "safe",
        market: "skinport",
        startCents: 10000,
        maxBuyShare: 0.5,
      },
      T0,
    );
    const first = await runBot(db, id, {
      now: T0,
      random: () => 0,
      searchTradeups: noTradeups,
    });
    expect(first.bought.map((b) => [b.name, b.costCents])).toEqual([
      [AK, 1500],
    ]);
    expect(getBot(db, id).cashCents).toBe(8500);
    // It doesn't buy the same item twice.
    expect(
      (
        await runBot(db, id, {
          now: T0 + DAY,
          random: () => 0,
          searchTradeups: noTradeups,
        })
      ).bought,
    ).toEqual([]);

    // 7-day hold, then about 1 day to sell (90 a month, 3 sales ahead).
    const [pos] = listPositions(db, id);
    expect(pos.tradableAt).toBe(T0 + 7 * DAY);
    expect(pos.sellAfter).toBe(T0 + 8 * DAY);
    const early = await runBot(db, id, {
      now: T0 + 7 * DAY,
      random: () => 0,
      searchTradeups: noTradeups,
    });
    expect(early.sold).toEqual([]);
    const done = await runBot(db, id, {
      now: T0 + 8 * DAY,
      random: () => 0,
      searchTradeups: noTradeups,
    });
    // Sold at the $20 sales median, minus Skinport's 8%: $18.40, $3.40 profit.
    expect(done.sold).toEqual([{ name: AK, netCents: 1840, profitCents: 340 }]);
    // Bought again in the same run: still a deal at $15.
    expect(done.bought).toHaveLength(1);
    expect(getBot(db, id).cashCents).toBe(8500 + 1840 - 1500);
    expect(listSnapshots(db, id).length).toBeGreaterThan(1);
  });

  it("does the best affordable trade-up and rolls its result", async () => {
    const db = seeded();
    const id = createBot(
      db,
      {
        name: "Trade-up bot",
        strategy: "tradeups",
        risk: "balanced",
        tier: "Restricted",
        market: "skinport",
        startCents: 10000,
        maxBuyShare: 0.25,
      },
      T0,
    );
    const queries: string[] = [];
    const contract = (cost: number, profit: number): SimContract => ({
      inputs: [
        {
          option: {
            skinName: "P250 | Sand Dune",
            marketHashName: "P250 | Sand Dune (Field-Tested)",
          },
          count: 10,
        },
      ],
      result: {
        costCents: cost,
        evCents: cost + profit,
        profitCents: profit,
        outcomes: [
          {
            skin: { name: "AK-47 | Prize" },
            wear: "Field-Tested",
            probability: 0.2,
            netCents: 9000,
            volume30d: 30,
          },
          {
            skin: { name: "M4A4 | Dud" },
            wear: "Field-Tested",
            probability: 0.8,
            netCents: 500,
            volume30d: 30,
          },
        ],
      },
    });
    const report = await runBot(db, id, {
      now: T0,
      random: () => 0.1, // lands in the first 20%
      searchTradeups: async (q) => {
        queries.push(q);
        // Too expensive for a 25% limit ($25), then a losing one, then one that fits.
        return [contract(5000, 900), contract(1000, -50), contract(2000, 300)];
      },
    });
    expect(new URLSearchParams(queries[0]).get("budget")).toBe("25");
    expect(report.bought).toEqual([
      {
        name: "AK-47 | Prize (Field-Tested)",
        costCents: 2000,
        detail: {
          kind: "tradeup",
          inputs: "10x P250 | Sand Dune",
          evCents: 2300,
          chance: 0.2,
          rolledNetCents: 9000,
          inputItems: [
            { count: 10, marketHashName: "P250 | Sand Dune (Field-Tested)" },
          ],
        },
      },
    ]);
    expect(getBot(db, id).cashCents).toBe(8000);
  });

  it("deletes a bot with everything it owns", async () => {
    const db = seeded();
    const id = createBot(
      db,
      {
        name: "x",
        strategy: "deals",
        risk: "safe",
        market: "skinport",
        startCents: 10000,
        maxBuyShare: 0.5,
      },
      T0,
    );
    await runBot(db, id, {
      now: T0,
      random: () => 0,
      searchTradeups: noTradeups,
    });
    deleteBot(db, id);
    expect(listBots(db)).toEqual([]);
    expect(listPositions(db, id)).toEqual([]);
    expect(listSnapshots(db, id)).toEqual([]);
  });
});
