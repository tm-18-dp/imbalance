import type { DatabaseSync } from "node:sqlite";
import { baseSkinName } from "./deals";
import { classifyTrend, type TrendSignal } from "./trend";

/** Enough to keep an eye on; the Dashboard lists them all. */
export const MAX_WATCHED = 100;

export type WatchedItem = {
  marketHashName: string;
  version: string;
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

type Row = {
  market_hash_name: string;
  version: string;
  added_at: number;
  added_cents: number | null;
  min_cents: number | null;
  quantity: number | null;
  median_24h: number | null;
  median_7d: number | null;
  median_30d: number | null;
  median_90d: number | null;
  volume_30d: number | null;
};

const lowestListing = (db: DatabaseSync, name: string, version: string) =>
  (
    db
      .prepare(
        "SELECT min_cents FROM prices WHERE source = 'skinport' AND market_hash_name = ? AND version = ?",
      )
      .get(name, version) as { min_cents: number | null } | undefined
  )?.min_cents ?? null;

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
    lowestListing(db, marketHashName, version),
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
  const rows = db
    .prepare(
      `SELECT w.market_hash_name, w.version, w.added_at, w.added_cents, p.min_cents, p.quantity,
              h.median_24h, h.median_7d, h.median_30d, h.median_90d, h.volume_30d
       FROM watchlist w
       LEFT JOIN prices p ON p.source = 'skinport' AND p.market_hash_name = w.market_hash_name
         AND p.version = w.version
       LEFT JOIN price_history h ON h.source = 'skinport' AND h.market_hash_name = w.market_hash_name
         AND h.version = w.version
       ORDER BY w.added_at DESC`,
    )
    .all() as Row[];
  const image = db.prepare("SELECT image FROM skins WHERE name = ? LIMIT 1");
  return rows.map((r) => ({
    marketHashName: r.market_hash_name,
    version: r.version,
    image:
      (
        image.get(baseSkinName(r.market_hash_name)) as
          { image: string | null } | undefined
      )?.image ?? null,
    addedAt: Number(r.added_at),
    addedCents: r.added_cents,
    nowCents: r.min_cents,
    listed: r.quantity ?? 0,
    median7d: r.median_7d,
    median30d: r.median_30d,
    volume30d: r.volume_30d ?? 0,
    trend: classifyTrend({
      nowCents: r.min_cents,
      median24h: r.median_24h,
      median7d: r.median_7d,
      median30d: r.median_30d,
      median90d: r.median_90d,
    }),
  }));
}
