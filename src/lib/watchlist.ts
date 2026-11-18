import type { DatabaseSync } from "node:sqlite";
import { baseSkinName } from "./deals";
import { classifyTrend, type TrendSignal } from "./trend";

/** Enough to keep an eye on; the Dashboard lists them all. */
export const MAX_WATCHED = 100;

export type WatchedItem = {
  marketHashName: string;
  version: string;
  /**
   * The phase whose prices are shown when the item was starred without one but Skinport
   * only lists it by phase (Doppler knives): the cheapest, like the Skins page shows.
   */
  pricedVersion: string | null;
  image: string | null;
  addedAt: number;
  /** Lowest Skinport listing when starred, to show the change since. */
  addedCents: number | null;
  /** Lowest Skinport listing now. */
  nowCents: number | null;
  listed: number;
  median7d: number | null;
  median30d: number | null;
  volume30d: number;
  trend: TrendSignal;
};

type PriceRow = {
  version: string;
  min_cents: number | null;
  quantity: number | null;
  median_24h: number | null;
  median_7d: number | null;
  median_30d: number | null;
  median_90d: number | null;
  volume_30d: number | null;
};

/**
 * Skinport's prices for an item. Some items (Doppler knives) are only listed by phase,
 * so a star without a phase falls back to the cheapest listed phase, as the Skins page does.
 */
function priceRow(
  db: DatabaseSync,
  name: string,
  version: string,
): PriceRow | undefined {
  const rows = db
    .prepare(
      `SELECT p.version, p.min_cents, p.quantity, h.median_24h, h.median_7d, h.median_30d,
              h.median_90d, h.volume_30d
       FROM prices p LEFT JOIN price_history h
         ON h.source = p.source AND h.market_hash_name = p.market_hash_name AND h.version = p.version
       WHERE p.source = 'skinport' AND p.market_hash_name = ?
         AND (p.version = ? OR ? = '')
       ORDER BY p.version = ? DESC, p.min_cents IS NULL, p.min_cents`,
    )
    .all(name, version, version, version) as PriceRow[];
  return rows[0];
}

/** Stars an item. Starring it again keeps the original date and price. */
export function addWatch(
  db: DatabaseSync,
  marketHashName: string,
  version = "",
  now = Date.now(),
): void {
  const count = Number(
    (db.prepare("SELECT COUNT(*) n FROM watchlist").get() as { n: number }).n,
  );
  const exists = db
    .prepare(
      "SELECT 1 FROM watchlist WHERE market_hash_name = ? AND version = ?",
    )
    .get(marketHashName, version);
  if (exists) return;
  if (count >= MAX_WATCHED)
    throw new Error(
      `Your watchlist is full (${MAX_WATCHED}). Unstar something first.`,
    );
  db.prepare(
    "INSERT INTO watchlist (market_hash_name, version, added_at, added_cents) VALUES (?, ?, ?, ?)",
  ).run(
    marketHashName,
    version,
    now,
    priceRow(db, marketHashName, version)?.min_cents ?? null,
  );
}

export function removeWatch(
  db: DatabaseSync,
  marketHashName: string,
  version = "",
): void {
  db.prepare(
    "DELETE FROM watchlist WHERE market_hash_name = ? AND version = ?",
  ).run(marketHashName, version);
}

/** Starred items with today's Skinport prices and trend, newest star first. */
export function listWatch(db: DatabaseSync): WatchedItem[] {
  const stars = db
    .prepare(
      "SELECT market_hash_name, version, added_at, added_cents FROM watchlist ORDER BY added_at DESC",
    )
    .all() as {
    market_hash_name: string;
    version: string;
    added_at: number;
    added_cents: number | null;
  }[];
  const image = db.prepare("SELECT image FROM skins WHERE name = ? LIMIT 1");
  return stars.map((w) => {
    const r = priceRow(db, w.market_hash_name, w.version);
    return {
      marketHashName: w.market_hash_name,
      version: w.version,
      pricedVersion: r && r.version !== w.version ? r.version : null,
      image:
        (
          image.get(baseSkinName(w.market_hash_name)) as
            { image: string | null } | undefined
        )?.image ?? null,
      addedAt: Number(w.added_at),
      addedCents: w.added_cents,
      nowCents: r?.min_cents ?? null,
      listed: r?.quantity ?? 0,
      median7d: r?.median_7d ?? null,
      median30d: r?.median_30d ?? null,
      volume30d: r?.volume_30d ?? 0,
      trend: classifyTrend({
        nowCents: r?.min_cents ?? null,
        median24h: r?.median_24h ?? null,
        median7d: r?.median_7d ?? null,
        median30d: r?.median_30d ?? null,
        median90d: r?.median_90d ?? null,
      }),
    };
  });
}
