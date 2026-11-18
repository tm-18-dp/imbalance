import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "./db";
import { saveSkinport } from "./prices/skinport";
import { saveCatalog } from "./catalog";
import { baseSkinName, findDeals, resalePrice } from "./deals";
import { MARKETPLACES } from "./fees";
import { overviewSchema, steamPrice } from "./prices/steam";

const win = (median: number | null, volume: number) => ({ median, volume });
function seeded() {
  const db = openDb(":memory:");
  const hist = (
    name: string,
    m7: number,
    m30: number,
    m90: number,
    vol: number,
  ) => ({
    market_hash_name: name,
    last_24_hours: win(null, 0),
    last_7_days: win(m7, vol),
    last_30_days: win(m30, vol),
    last_90_days: win(m90, vol),
  });
  saveSkinport(db, {
    items: [
      {
        market_hash_name: "AK-47 | Redline (Field-Tested)",
        min_price: 15,
        quantity: 4,
      },
      {
        market_hash_name: "AWP | Asiimov (Field-Tested)",
        min_price: 99,
        quantity: 9,
      },
      {
        market_hash_name: "Rare Thing (Factory New)",
        min_price: 1,
        quantity: 1,
      },
      { market_hash_name: "Sticker | Cheap", min_price: 1, quantity: 50 },
    ],
    history: [
      hist("AK-47 | Redline (Field-Tested)", 17, 20, 22, 50), // 25% under usual, falling
      hist("AWP | Asiimov (Field-Tested)", 100, 100, 100, 50), // only 1% under
      hist("Rare Thing (Factory New)", 50, 50, 50, 2), // cheap but never sells
      hist("Sticker | Cheap", 2, 2, 2, 100),
    ],
  });
  return db;
}

afterEach(() => vi.unstubAllGlobals());

describe("resalePrice", () => {
  const base = {
    median_24h: null,
    volume_24h: 0,
    median_7d: null,
    volume_7d: 0,
    median_30d: 1000,
  };
  it("uses the 30-day median when nothing recent is lower", () => {
    expect(resalePrice({ ...base, median_7d: 1100, volume_7d: 20 })).toBe(1000);
  });
  it("follows a recent slide backed by enough sales", () => {
    expect(
      resalePrice({
        ...base,
        median_7d: 900,
        volume_7d: 20,
        median_24h: 850,
        volume_24h: 5,
      }),
    ).toBe(850);
  });
  it("ignores recent medians from too few sales", () => {
    expect(resalePrice({ ...base, median_24h: 500, volume_24h: 1 })).toBe(1000);
  });
});

describe("findDeals", () => {
  it("finds liquid items under their usual price that flip for profit after fees", () => {
    const deals = findDeals(seeded(), {
      market: MARKETPLACES.skinport,
      weaponsOnly: true,
    });
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      marketHashName: "AK-47 | Redline (Field-Tested)",
      buyCents: 1500,
      usualCents: 2000,
      // Falling: the 7-day median (17) is the realistic resale, not the 30-day (20).
      resaleCents: 1700,
      netResaleCents: 1564,
      flipProfitCents: 64,
      trend: "falling",
    });
    expect(deals[0].discount).toBeCloseTo(0.25);
  });

  it("includes stickers unless weapons only, and respects max price", () => {
    const db = seeded();
    expect(
      findDeals(db, { market: MARKETPLACES.skinport }).map(
        (d) => d.marketHashName,
      ),
    ).toContain("Sticker | Cheap");
    expect(
      findDeals(db, { market: MARKETPLACES.skinport, maxBuyCents: 1000 }).map(
        (d) => d.marketHashName,
      ),
    ).toEqual(["Sticker | Cheap"]);
  });

  it("strips wear and prefixes for image lookup", () => {
    expect(baseSkinName("StatTrak™ AK-47 | Redline (Field-Tested)")).toBe(
      "AK-47 | Redline",
    );
    expect(baseSkinName("★ StatTrak™ Karambit | Fade (Factory New)")).toBe(
      "★ Karambit | Fade",
    );
  });
});

describe("steamPrice", () => {
  it("parses Steam's text prices and caches for 10 minutes", async () => {
    expect(
      overviewSchema.parse({
        success: true,
        lowest_price: "$1,030.72",
        volume: "1,052",
      }),
    ).toMatchObject({
      lowest_price: 103072,
      volume: 1052,
    });
    const db = openDb(":memory:");
    const fetchMock = vi.fn(async () =>
      Response.json({
        success: true,
        lowest_price: "$30.72",
        median_price: "$30.38",
        volume: "52",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await steamPrice(db, "x", 1000)).toMatchObject({
      lowestCents: 3072,
      medianCents: 3038,
      volume24h: 52,
    });
    await steamPrice(db, "x", 1000 + 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("weapon skins only", () => {
  it("keeps items in the skin list and knives, and drops keys, agents and passes", () => {
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
      ],
      collections: [{ id: "C", name: "C" }],
      crates: [],
    });
    const names = [
      "AK-47 | Redline (Field-Tested)",
      "StatTrak™ AK-47 | Redline (Field-Tested)",
      "★ Bayonet",
      "Operation Breakout Case Key",
      "'The Doctor' Romanov | Sabre",
      "Cologne 2015 Viewer Pass",
    ];
    const hist = (name: string) => ({
      market_hash_name: name,
      last_24_hours: win(null, 0),
      last_7_days: win(20, 50),
      last_30_days: win(20, 50),
      last_90_days: win(20, 50),
    });
    saveSkinport(db, {
      items: names.map((n) => ({
        market_hash_name: n,
        min_price: 15,
        quantity: 5,
      })),
      history: names.map(hist),
    });
    const found = (weaponsOnly: boolean) =>
      findDeals(db, { market: MARKETPLACES.skinport, weaponsOnly })
        .map((d) => d.marketHashName)
        .sort();
    expect(found(true)).toEqual([
      "AK-47 | Redline (Field-Tested)",
      "StatTrak™ AK-47 | Redline (Field-Tested)",
      "★ Bayonet",
    ]);
    expect(found(false)).toHaveLength(names.length);
  });
});
