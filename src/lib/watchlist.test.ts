import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { saveSkinport } from "./prices/skinport";
import { addWatch, listWatch, MAX_WATCHED, removeWatch } from "./watchlist";

const win = (median: number | null, volume: number) => ({ median, volume });
const AK = "AK-47 | Redline (Field-Tested)";

function seeded(listing: number) {
  const db = openDb(":memory:");
  saveSkinport(db, {
    items: [{ market_hash_name: AK, min_price: listing, quantity: 12 }],
    history: [
      {
        market_hash_name: AK,
        last_24_hours: win(null, 0),
        last_7_days: win(16, 30),
        last_30_days: win(20, 90),
        last_90_days: win(22, 250),
      },
    ],
  });
  return db;
}

describe("watchlist", () => {
  it("stars an item with its price then, and lists today's prices and trend", () => {
    const db = seeded(15);
    addWatch(db, AK, "", 100);
    // Starring again keeps the first date and price.
    addWatch(db, AK, "", 200);
    expect(listWatch(db)).toEqual([
      {
        marketHashName: AK,
        version: "",
        pricedVersion: null,
        image: null,
        addedAt: 100,
        addedCents: 1500,
        nowCents: 1500,
        listed: 12,
        median7d: 1600,
        median30d: 2000,
        volume30d: 90,
        // 7-day median 27% under the 90-day one: a slide, not a dip.
        trend: "falling",
      },
    ]);
  });

  it("keeps items with no Skinport price, and unstars", () => {
    const db = seeded(15);
    addWatch(db, "Nothing | Listed (Factory New)", "", 1);
    expect(listWatch(db)[0]).toMatchObject({
      nowCents: null,
      addedCents: null,
      listed: 0,
      trend: "unknown",
    });
    removeWatch(db, "Nothing | Listed (Factory New)");
    expect(listWatch(db)).toEqual([]);
  });

  it("stops at the limit", () => {
    const db = seeded(15);
    for (let i = 0; i < MAX_WATCHED; i++) addWatch(db, `Item ${i}`);
    expect(() => addWatch(db, "One more")).toThrow(/full/);
    // Starring one already there is still fine.
    expect(() => addWatch(db, "Item 0")).not.toThrow();
  });

  it("shows the cheapest phase for an item Skinport only lists by phase", () => {
    // Doppler knives have no price without a phase; the Skins page stars them that way.
    const db = openDb(":memory:");
    const KNIFE = "★ Karambit | Doppler (Factory New)";
    saveSkinport(db, {
      items: [
        {
          market_hash_name: KNIFE,
          version: "Ruby",
          min_price: 7300,
          quantity: 2,
        },
        {
          market_hash_name: KNIFE,
          version: "Phase 3",
          min_price: 1047,
          quantity: 9,
        },
        {
          market_hash_name: KNIFE,
          version: "Black Pearl",
          min_price: null,
          quantity: 0,
        },
      ],
      history: [],
    });
    addWatch(db, KNIFE, "", 1);
    expect(listWatch(db)[0]).toMatchObject({
      version: "",
      pricedVersion: "Phase 3",
      addedCents: 104700,
      nowCents: 104700,
      listed: 9,
    });
    // A star on one phase keeps that phase's prices.
    addWatch(db, KNIFE, "Ruby", 2);
    expect(listWatch(db)[0]).toMatchObject({
      version: "Ruby",
      pricedVersion: null,
      nowCents: 730000,
    });
  });
});
