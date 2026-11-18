import type { DatabaseSync } from "node:sqlite";
import type { Quote } from "./gaps";
import { priceLookup } from "./tradeup-data";

/** Steam and CSFloat prices older than this are too stale to trade on. */
export const QUOTE_MAX_AGE_MS = 60 * 60_000;

export type GapCandidate = { marketHashName: string; volume30d: number };

/**
 * Items worth comparing across marketplaces: anything that sells often on Skinport (so a
 * buy can be resold), most traded first. Doppler phases are left out: Steam and CSFloat
 * names don't say the phase.
 */
export function gapCandidates(
  db: DatabaseSync,
  opts: {
    q?: string;
    minCents?: number;
    maxCents?: number;
    limit?: number;
    minVolume30d?: number;
  },
): GapCandidate[] {
  const rows = db
    .prepare(
      `SELECT p.market_hash_name, h.volume_30d
       FROM prices p JOIN price_history h
         ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
       WHERE p.source = 'skinport' AND p.version = '' AND p.quantity > 0
         AND p.min_cents >= ? AND (? IS NULL OR p.min_cents <= ?)
         AND h.volume_30d >= ?
         AND (? IS NULL OR p.market_hash_name LIKE ?)
       ORDER BY h.volume_30d DESC
       LIMIT ?`,
    )
    .all(
      opts.minCents ?? 100,
      opts.maxCents ?? null,
      opts.maxCents ?? null,
      opts.minVolume30d ?? 10,
      opts.q ? 1 : null,
      `%${opts.q ?? ""}%`,
      opts.limit ?? 10,
    ) as { market_hash_name: string; volume_30d: number }[];
  return rows.map((r) => ({
    marketHashName: r.market_hash_name,
    volume30d: r.volume_30d,
  }));
}

/**
 * What each marketplace offers for these items, from saved prices only:
 * - Skinport: buy at the lowest listing, sell at the recent sales price;
 * - Steam (when looked up in the last hour): buy at the lowest listing, sell at the 24-hour
 *   median (or the lowest listing, marked as an estimate);
 * - CSFloat (when listings were saved in the last hour): buy at the cheapest listing, sell
 *   a cent under it, marked as an estimate since nobody may buy at that price.
 */
export function savedQuotes(
  db: DatabaseSync,
  names: readonly string[],
  now = Date.now(),
): Map<string, Quote[]> {
  const skinport = priceLookup(db);
  const spMin = db.prepare(
    "SELECT min_cents, quantity FROM prices WHERE source = 'skinport' AND version = '' AND market_hash_name = ?",
  );
  const steam = db.prepare(
    "SELECT min_cents, median_cents FROM prices WHERE source = 'steam' AND version = '' AND market_hash_name = ? AND updated_at >= ?",
  );
  const csfloat = db.prepare(
    "SELECT MIN(price_cents) cents FROM listings WHERE source = 'csfloat' AND market_hash_name = ? AND fetched_at >= ?",
  );
  const since = now - QUOTE_MAX_AGE_MS;
  const out = new Map<string, Quote[]>();
  for (const name of names) {
    const quotes: Quote[] = [];
    const sp = spMin.get(name) as
      { min_cents: number | null; quantity: number } | undefined;
    quotes.push({
      market: "skinport",
      buyCents: sp && sp.quantity > 0 ? sp.min_cents : null,
      sellCents: skinport(name).sellCents,
    });
    const st = steam.get(name, since) as
      { min_cents: number | null; median_cents: number | null } | undefined;
    if (st)
      quotes.push({
        market: "steam",
        buyCents: st.min_cents,
        sellCents: st.median_cents ?? st.min_cents,
        sellIsEstimate: st.median_cents == null,
      });
    const cf = csfloat.get(name, since) as { cents: number | null } | undefined;
    if (cf?.cents != null)
      quotes.push({
        market: "csfloat",
        buyCents: cf.cents,
        sellCents: Math.max(1, cf.cents - 1),
        sellIsEstimate: true,
      });
    out.set(name, quotes);
  }
  return out;
}

/** Items with no Steam price from the last hour: the page looks these up first. */
export function missingSteam(
  db: DatabaseSync,
  names: readonly string[],
  now = Date.now(),
): string[] {
  const st = db.prepare(
    "SELECT 1 FROM prices WHERE source = 'steam' AND version = '' AND market_hash_name = ? AND updated_at >= ?",
  );
  return names.filter((n) => !st.get(n, now - QUOTE_MAX_AGE_MS));
}
