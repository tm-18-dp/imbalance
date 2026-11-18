import type { DatabaseSync } from "node:sqlite";
import type { Marketplace } from "./fees";
import { classifyTrend, type TrendSignal } from "./trend";

export type Deal = {
  marketHashName: string;
  version: string;
  image: string | null;
  buyCents: number;
  usualCents: number;
  /** What it should resell for: the lowest of the recent sales medians, so a slide counts. */
  resaleCents: number;
  discount: number;
  quantity: number;
  volume30d: number;
  netResaleCents: number;
  flipProfitCents: number;
  trend: TrendSignal;
};

export type DealOptions = {
  market: Marketplace;
  minVolume30d?: number;
  minDiscount?: number;
  maxBuyCents?: number;
  q?: string;
  weaponsOnly?: boolean;
  /** Only short drops against a steady long-term price, the ones that tend to correct. */
  dipsOnly?: boolean;
  limit?: number;
};

type Row = {
  market_hash_name: string;
  version: string;
  min_cents: number;
  quantity: number;
  median_24h: number | null;
  volume_24h: number;
  median_7d: number | null;
  volume_7d: number;
  median_30d: number;
  volume_30d: number;
  median_90d: number | null;
};

const NOT_WEAPON =
  /^(Sticker|Patch|Sealed Graffiti|Charm|Music Kit|Souvenir Charm|StatTrak™ Music Kit)|Case$|Capsule$|Package$|Pin$/;

/** Base skin name for image lookup: "StatTrak™ AK-47 | Redline (Field-Tested)" -> "AK-47 | Redline". */
export function baseSkinName(marketHashName: string): string {
  return marketHashName
    .replace(
      / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/,
      "",
    )
    .replace("StatTrak™ ", "")
    .replace(/^Souvenir /, "");
}

/** Sales in a window below this don't move the resale estimate. */
const MIN_SALES = 3;

/**
 * Cautious resale price: the 30-day median, pulled down by the 7-day and 24-hour medians
 * when they are lower and backed by enough sales. A price that is sliding shouldn't be
 * expected to bounce back to last month's level by the time the item can be resold.
 */
export function resalePrice(r: {
  median_24h: number | null;
  volume_24h: number;
  median_7d: number | null;
  volume_7d: number;
  median_30d: number;
}): number {
  let p = r.median_30d;
  if (r.median_7d != null && r.volume_7d >= MIN_SALES)
    p = Math.min(p, r.median_7d);
  if (r.median_24h != null && r.volume_24h >= MIN_SALES)
    p = Math.min(p, r.median_24h);
  return p;
}

/**
 * Items listed below what they usually sell for (30-day median), that sell often enough to
 * flip, ranked by profit after the chosen marketplace's fee.
 */
export function findDeals(db: DatabaseSync, opts: DealOptions): Deal[] {
  const rows = db
    .prepare(
      `SELECT p.market_hash_name, p.version, p.min_cents, p.quantity,
              h.median_24h, h.volume_24h, h.median_7d, h.volume_7d, h.median_30d, h.volume_30d, h.median_90d
       FROM prices p JOIN price_history h
         ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
       WHERE p.source = 'skinport' AND p.min_cents > 0 AND p.quantity > 0
         AND h.median_30d IS NOT NULL AND h.volume_30d >= ?
         AND p.min_cents < h.median_30d * (1 - ?)
         AND (? IS NULL OR p.min_cents <= ?)
         AND (? IS NULL OR p.market_hash_name LIKE ?)`,
    )
    .all(
      opts.minVolume30d ?? 10,
      opts.minDiscount ?? 0.1,
      opts.maxBuyCents ?? null,
      opts.maxBuyCents ?? null,
      opts.q ? 1 : null,
      `%${opts.q ?? ""}%`,
    ) as Row[];

  const images = new Map(
    (
      db.prepare("SELECT name, image FROM skins").all() as {
        name: string;
        image: string | null;
      }[]
    ).map((r) => [r.name, r.image]),
  );

  // A weapon skin is one in the skin list (weapons, knives, gloves). Name patterns alone
  // let 286 others through (case keys, agents, viewer passes). Before the first skin list
  // update there is no list, so the patterns are all there is.
  const isWeapon = (name: string) =>
    images.size
      ? images.has(baseSkinName(name)) || name.startsWith("★ ")
      : !NOT_WEAPON.test(name);

  return rows
    .filter((r) => !opts.weaponsOnly || isWeapon(r.market_hash_name))
    .map((r) => {
      const resaleCents = resalePrice(r);
      const netResaleCents = opts.market.net(resaleCents);
      return {
        marketHashName: r.market_hash_name,
        version: r.version,
        image: images.get(baseSkinName(r.market_hash_name)) ?? null,
        buyCents: r.min_cents,
        usualCents: r.median_30d,
        resaleCents,
        discount: 1 - r.min_cents / r.median_30d,
        quantity: r.quantity,
        volume30d: r.volume_30d,
        netResaleCents,
        flipProfitCents: netResaleCents - r.min_cents,
        trend: classifyTrend({
          nowCents: r.min_cents,
          median24h: r.median_24h,
          median7d: r.median_7d,
          median30d: r.median_30d,
          median90d: r.median_90d,
        }),
      };
    })
    .filter(
      (d) =>
        d.flipProfitCents > 0 &&
        (!opts.dipsOnly || d.trend === "dip" || d.trend === "rebounding"),
    )
    .sort((a, b) => b.flipProfitCents - a.flipProfitCents)
    .slice(0, opts.limit ?? 100);
}
