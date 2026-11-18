import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import {
  addHolding,
  DAY,
  deleteHolding,
  exportTracker,
  getSettings,
  importTracker,
  listHoldings,
  markSold,
  portfolio,
  recordTradeUp,
  saveSettings,
  settingsPatchSchema,
} from "./tracker";

const buy = (
  db: ReturnType<typeof openDb>,
  name: string,
  costCents: number,
  boughtAt = 1000 * DAY,
) => addHolding(db, { marketHashName: name, costCents, boughtAt, float: 0.2 });

describe("tracker", () => {
  it("locks new items for the trade hold from settings", () => {
    const db = openDb(":memory:");
    expect(getSettings(db)).toEqual({
      holdDays: 7,
      sellMarket: "skinport",
      riskProfile: "safe",
      bankrollCents: null,
    });
    saveSettings(db, { holdDays: 3 });
    const id = buy(db, "AK-47 | Redline (Field-Tested)", 1500);
    expect(listHoldings(db).find((h) => h.id === id)?.tradableAt).toBe(
      1003 * DAY,
    );
  });

  it("changes one setting without resetting the others", () => {
    const db = openDb(":memory:");
    saveSettings(db, { holdDays: 3, bankrollCents: 50000 });
    // What the API does with a request body that only names one setting.
    saveSettings(db, settingsPatchSchema.parse({ riskProfile: "aggressive" }));
    expect(getSettings(db)).toEqual({
      holdDays: 3,
      sellMarket: "skinport",
      riskProfile: "aggressive",
      bankrollCents: 50000,
    });
    saveSettings(db, settingsPatchSchema.parse({ bankrollCents: null }));
    expect(getSettings(db).bankrollCents).toBeNull();
    expect(getSettings(db).holdDays).toBe(3);
  });

  it("records sales after fees and computes the portfolio", () => {
    const db = openDb(":memory:");
    const a = buy(db, "A", 1000);
    buy(db, "B", 500);
    markSold(db, a, 2000, "skinport", 1010 * DAY);
    expect(() => markSold(db, a, 2000, "skinport", 1010 * DAY)).toThrow(
      /still hold/,
    );
    const p = portfolio(listHoldings(db), (h) =>
      h.marketHashName === "B" ? 800 : null,
    );
    expect(p).toEqual({
      investedCents: 500,
      valueCents: 800,
      unrealizedCents: 300,
      realizedCents: 840,
      holding: 1,
    });
  });

  it("records a trade-up: inputs used, output costs their total and keeps the latest lock", () => {
    const db = openDb(":memory:");
    const ids = Array.from({ length: 10 }, (_, i) =>
      buy(db, `In ${i}`, 100, (1000 + i) * DAY),
    );
    const out = recordTradeUp(
      db,
      ids,
      { marketHashName: "Out", float: 0.1 },
      1005 * DAY,
    );
    const all = listHoldings(db);
    const output = all.find((h) => h.id === out)!;
    expect(output).toMatchObject({
      costCents: 1000,
      source: "trade-up",
      status: "holding",
      tradableAt: 1016 * DAY,
    });
    expect(
      all.filter((h) => h.status === "used" && h.usedIn === out),
    ).toHaveLength(10);
    expect(() =>
      recordTradeUp(db, ids, { marketHashName: "Again" }, 1006 * DAY),
    ).toThrow(/already used/);
    expect(() =>
      recordTradeUp(db, ids.slice(0, 3), { marketHashName: "X" }, 1006 * DAY),
    ).toThrow(/10 skins/);
  });

  it("backs up and restores, and rejects bad files without changing anything", () => {
    const db = openDb(":memory:");
    buy(db, "A", 100);
    const backup = JSON.parse(JSON.stringify(exportTracker(db)));
    deleteHolding(db, listHoldings(db)[0].id);
    expect(importTracker(db, backup)).toBe(1);
    expect(listHoldings(db)[0].marketHashName).toBe("A");
    expect(() => importTracker(db, { app: "other" })).toThrow(
      /isn't an Imbalance backup/,
    );
    expect(listHoldings(db)).toHaveLength(1);
  });
});
