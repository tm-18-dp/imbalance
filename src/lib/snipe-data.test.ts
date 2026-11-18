import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { saveCatalog } from "./catalog";
import { saveSkinport } from "./prices/skinport";
import { snipeCandidates } from "./snipe-data";

const win = (median: number | null, volume: number) => ({ median, volume });
const hist = (name: string, median: number, volume: number) => ({
  market_hash_name: name,
  last_24_hours: win(null, 0),
  last_7_days: win(median, volume),
  last_30_days: win(median, volume),
  last_90_days: win(median, volume),
});

describe("snipeCandidates", () => {
  const db = openDb(":memory:");
  saveCatalog(db, {
    skins: [
      {
        id: "ak",
        name: "AK-47 | Redline",
        rarity: { id: "r", name: "Classified" },
        min_float: 0.1,
        max_float: 0.7,
        stattrak: true,
        wears: [{ id: "a", name: "Field-Tested" }],
        collections: [{ id: "C", name: "C" }],
      },
      {
        id: "p",
        name: "P250 | Sand Dune",
        rarity: { id: "r", name: "Consumer Grade" },
        min_float: 0,
        max_float: 0.8,
        stattrak: false,
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
        market_hash_name: "AK-47 | Redline (Field-Tested)",
        min_price: 15,
        quantity: 40,
      },
      {
        market_hash_name: "StatTrak™ AK-47 | Redline (Field-Tested)",
        min_price: 40,
        quantity: 5,
      },
      {
        market_hash_name: "P250 | Sand Dune (Field-Tested)",
        min_price: 0.05,
        quantity: 900,
      },
      { market_hash_name: "Sticker | Cheap", min_price: 0.1, quantity: 500 },
    ],
    history: [
      hist("AK-47 | Redline (Field-Tested)", 16, 300),
      hist("StatTrak™ AK-47 | Redline (Field-Tested)", 42, 20),
      hist("P250 | Sand Dune (Field-Tested)", 0.05, 2000),
      hist("Sticker | Cheap", 0.1, 5000),
    ],
  });

  it("picks traded weapon skins with a wear, most traded first, with float ranges", () => {
    const c = snipeCandidates(db, {});
    expect(c.map((x) => x.marketHashName)).toEqual([
      "P250 | Sand Dune (Field-Tested)",
      "AK-47 | Redline (Field-Tested)",
      "StatTrak™ AK-47 | Redline (Field-Tested)",
    ]);
    expect(c[1]).toMatchObject({
      minFloat: 0.1,
      maxFloat: 0.7,
      normalCents: 1600,
    });
  });

  it("filters by name, max price and limit", () => {
    expect(
      snipeCandidates(db, { q: "Redline", maxCents: 2000 }).map(
        (x) => x.marketHashName,
      ),
    ).toEqual(["AK-47 | Redline (Field-Tested)"]);
    expect(snipeCandidates(db, { limit: 1 })).toHaveLength(1);
    expect(
      snipeCandidates(db, { minCents: 100 }).map((x) => x.marketHashName),
    ).not.toContain("P250 | Sand Dune (Field-Tested)");
  });
});
