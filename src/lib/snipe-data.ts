import type { DatabaseSync } from "node:sqlite";
import { baseSkinName } from "./deals";
import { priceLookup } from "./tradeup-data";

export type SnipeCandidate = {
  marketHashName: string;
  minFloat: number;
  maxFloat: number;
  /** Usual sale price on Skinport, the "ordinary float" reference. */
  normalCents: number | null;
  volume30d: number;
};

const HAS_WEAR =
  / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

/**
 * Items worth checking for float snipes: weapon skins with a wear (floats only matter
 * there) that sell often on Skinport, so a snipe can be resold. Most traded first.
 * Doppler phases are left out: CSFloat names don't say the phase.
 */
export function snipeCandidates(
  db: DatabaseSync,
  opts: {
    q?: string;
    maxCents?: number;
    /** Skip cheap items: a special float on a 5-cent skin isn't worth the trouble. */
    minCents?: number;
    limit?: number;
    minVolume30d?: number;
  },
): SnipeCandidate[] {
  const rows = db
    .prepare(
      `SELECT p.market_hash_name, h.volume_30d
       FROM prices p JOIN price_history h
         ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
       WHERE p.source = 'skinport' AND p.version = '' AND p.quantity > 0 AND p.min_cents > 0
         AND h.volume_30d >= ?
         AND (? IS NULL OR p.min_cents <= ?)
         AND p.min_cents >= ?
         AND (? IS NULL OR p.market_hash_name LIKE ?)
       ORDER BY h.volume_30d DESC`,
    )
    .all(
      opts.minVolume30d ?? 10,
      opts.maxCents ?? null,
      opts.maxCents ?? null,
      opts.minCents ?? 0,
      opts.q ? 1 : null,
      `%${opts.q ?? ""}%`,
    ) as { market_hash_name: string; volume_30d: number }[];

  const ranges = new Map(
    (
      db
        .prepare(
          "SELECT name, min_float, max_float FROM skins WHERE min_float IS NOT NULL AND max_float IS NOT NULL",
        )
        .all() as { name: string; min_float: number; max_float: number }[]
    ).map((r) => [r.name, r]),
  );
  const price = priceLookup(db);
  const out: SnipeCandidate[] = [];
  for (const r of rows) {
    if (!HAS_WEAR.test(r.market_hash_name)) continue;
    const range = ranges.get(baseSkinName(r.market_hash_name));
    if (!range) continue;
    out.push({
      marketHashName: r.market_hash_name,
      minFloat: range.min_float,
      maxFloat: range.max_float,
      normalCents: price(r.market_hash_name).sellCents,
      volume30d: r.volume_30d,
    });
    if (out.length >= (opts.limit ?? 10)) break;
  }
  return out;
}
