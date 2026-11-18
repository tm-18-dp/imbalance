import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { saveSkinport } from "./prices/skinport";
import { saveListings } from "./prices/csfloat";
import { gapCandidates, missingSteam, savedQuotes } from "./gap-data";

const win = (median: number | null, volume: number) => ({ median, volume });
const hist = (name: string, median: number, volume: number) => ({
  market_hash_name: name,
  last_24_hours: win(null, 0),
  last_7_days: win(median, volume),
  last_30_days: win(median, volume),
  last_90_days: win(median, volume),
});
const NOW = 1_800_000_000_000;

function seeded() {
  const db = openDb(":memory:");
  saveSkinport(db, {
    items: [
      {
        market_hash_name: "AK-47 | Redline (Field-Tested)",
        min_price: 15,
        quantity: 40,
      },
      { market_hash_name: "Revolution Case", min_price: 1.2, quantity: 900 },
      { market_hash_name: "Cheap Thing", min_price: 0.05, quantity: 900 },
    ],
    history: [
      hist("AK-47 | Redline (Field-Tested)", 16, 300),
      hist("Revolution Case", 1.25, 5000),
      hist("Cheap Thing", 0.05, 9000),
    ],
  });
  const steam = db.prepare(
    "INSERT INTO prices (market_hash_name, source, version, min_cents, median_cents, quantity, updated_at) VALUES (?, 'steam', '', ?, ?, 10, ?)",
  );
  steam.run("AK-47 | Redline (Field-Tested)", 1900, 1850, NOW - 5 * 60_000);
  steam.run("Revolution Case", 160, null, NOW - 3 * 60 * 60_000); // too old
  saveListings(
    db,
    "AK-47 | Redline (Field-Tested)",
    [
      {
        id: "1",
        marketHashName: "AK-47 | Redline (Field-Tested)",
        priceCents: 1450,
        float: 0.2,
        paintSeed: null,
        url: "",
      },
      {
        id: "2",
        marketHashName: "AK-47 | Redline (Field-Tested)",
        priceCents: 1600,
        float: 0.3,
        paintSeed: null,
        url: "",
      },
    ],
    NOW - 60_000,
  );
  return db;
}

describe("gap data", () => {
  it("picks traded items of any kind over the minimum price, most traded first", () => {
    expect(gapCandidates(seeded(), {}).map((c) => c.marketHashName)).toEqual([
      "Revolution Case",
      "AK-47 | Redline (Field-Tested)",
    ]);
    expect(gapCandidates(seeded(), { q: "Redline" })).toHaveLength(1);
  });

  it("builds quotes from fresh saved prices only", () => {
    const quotes = savedQuotes(
      seeded(),
      ["AK-47 | Redline (Field-Tested)", "Revolution Case"],
      NOW,
    );
    expect(quotes.get("AK-47 | Redline (Field-Tested)")).toEqual([
      { market: "skinport", buyCents: 1500, sellCents: 1600 },
      {
        market: "steam",
        buyCents: 1900,
        sellCents: 1850,
        sellIsEstimate: false,
      },
      {
        market: "csfloat",
        buyCents: 1450,
        sellCents: 1449,
        sellIsEstimate: true,
      },
    ]);
    // The Steam price is three hours old: left out.
    expect(quotes.get("Revolution Case")).toEqual([
      { market: "skinport", buyCents: 120, sellCents: 125 },
    ]);
  });

  it("says which items need a Steam lookup", () => {
    expect(
      missingSteam(
        seeded(),
        ["AK-47 | Redline (Field-Tested)", "Revolution Case"],
        NOW,
      ),
    ).toEqual(["Revolution Case"]);
  });
});
