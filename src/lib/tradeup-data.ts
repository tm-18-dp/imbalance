import type { DatabaseSync } from "node:sqlite";
import type { InputOption } from "./finder";
import {
  GEM_PHASES,
  nextTier,
  type OutcomeSkin,
  type PriceFn,
  type Tier,
} from "./tradeup";
import { marketHashName, WEARS, type WearName } from "./wear";
import { listHoldings } from "./tracker";
import { liquidSellPrice } from "./liquidity";
import { classifyTrend, trendCut, type TrendSignal } from "./trend";

export type Variant = "normal" | "stattrak";
/** "estimate" is a cautious floor from a related item, see `floorEstimate`. */
export type PriceSource = "steam" | "skinport" | "estimate";

const NORMAL_PHASES = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];

/**
 * A cautious "worth at least" price for an outcome nobody has listed or sold lately:
 * - a rare phase (Ruby, Sapphire, Black Pearl, Emerald) is worth at least the cheapest
 *   normal phase of the same knife and wear;
 * - a better wear is worth at least the nearest worse wear of the same skin and phase.
 * `lookup` returns a real price (no estimates) or null. Null when nothing related is priced.
 */
export function floorEstimate(
  lookup: (phase: string | undefined, wear: WearName | null) => number | null,
  phase: string | undefined,
  wear: WearName | null,
): number | null {
  if (phase && GEM_PHASES.includes(phase)) {
    const normals = NORMAL_PHASES.map((p) => lookup(p, wear)).filter(
      (c): c is number => c != null,
    );
    if (normals.length) return Math.min(...normals);
  }
  if (!wear) return null;
  const idx = WEARS.findIndex((w) => w.name === wear);
  for (let j = idx + 1; j < WEARS.length; j++) {
    const c =
      lookup(phase, WEARS[j].name) ??
      (phase && GEM_PHASES.includes(phase)
        ? floorEstimate(lookup, phase, WEARS[j].name)
        : null);
    if (c != null) return c;
  }
  return null;
}

/** Steam prices saved by "Steam check" are trusted for a week when selling on Steam. */
export const STEAM_PRICE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/** Saved Steam sell prices (median, else lowest listing) keyed by market name. */
export function loadSteamPrices(
  db: DatabaseSync,
  now = Date.now(),
): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT market_hash_name, COALESCE(median_cents, min_cents) cents FROM prices
       WHERE source = 'steam' AND version = '' AND updated_at >= ?
         AND COALESCE(median_cents, min_cents) IS NOT NULL`,
    )
    .all(now - STEAM_PRICE_MAX_AGE_MS) as {
    market_hash_name: string;
    cents: number;
  }[];
  return new Map(rows.map((r) => [r.market_hash_name, r.cents]));
}

type PriceRow = {
  market_hash_name: string;
  version: string;
  min_cents: number | null;
  quantity: number;
  median_24h?: number | null;
  median_7d: number | null;
  volume_7d: number | null;
  median_30d: number | null;
  volume_30d: number | null;
  median_90d: number | null;
  volume_90d: number | null;
};

/** Skinport prices keyed by "name|version". */
function loadPrices(db: DatabaseSync) {
  const rows = db
    .prepare(
      `SELECT p.market_hash_name, p.version, p.min_cents, p.quantity, h.median_24h, h.median_7d, h.volume_7d,
              h.median_30d, h.volume_30d, h.median_90d, h.volume_90d
       FROM prices p LEFT JOIN price_history h
         ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
       WHERE p.source = 'skinport'`,
    )
    .all() as PriceRow[];
  return new Map(rows.map((r) => [`${r.market_hash_name}|${r.version}`, r]));
}

/**
 * What a skin usually sells for: the most recent sales median with at least 3 sales
 * (7, then 30, then 90 days). Sales beat hopeful listings.
 * Without that, the lower of the lowest listing and the most recent median from even 1 or
 * 2 sales. A lone listing can be a wishful asking price many times the real value (seen:
 * a $6,113 listing on a knife that sells for far less), and you'd have to undercut it to
 * sell anyway. Rare items (old knives in Factory New, rare phases) often sell only a couple
 * of times in 90 days; their 30-day volume stays low, so the risk checks still treat them
 * as thin markets.
 */
export function salesPrice(r: PriceRow | undefined): number | null {
  if (!r) return null;
  if (r.median_7d != null && (r.volume_7d ?? 0) >= 3) return r.median_7d;
  if (r.median_30d != null && (r.volume_30d ?? 0) >= 3) return r.median_30d;
  if (r.median_90d != null && (r.volume_90d ?? 0) >= 3) return r.median_90d;
  const sparse =
    (r.volume_7d ?? 0) > 0 && r.median_7d != null
      ? r.median_7d
      : (r.volume_30d ?? 0) > 0 && r.median_30d != null
        ? r.median_30d
        : (r.volume_90d ?? 0) > 0
          ? r.median_90d
          : null;
  if (r.min_cents != null && sparse != null)
    return Math.min(r.min_cents, sparse);
  return r.min_cents ?? sparse;
}

/**
 * What you can expect to sell a skin for: `salesPrice`, leaning towards a cheaper listing
 * when the item sells rarely (see `liquidSellPrice`).
 */
export function sellPrice(r: PriceRow | undefined): number | null {
  const sales = salesPrice(r);
  if (sales == null || !r) return sales;
  return liquidSellPrice(sales, r.min_cents, r.volume_30d ?? 0);
}

type SkinRow = {
  id: string;
  name: string;
  image: string | null;
  min_float: number | null;
  max_float: number | null;
  wears: string;
  collection_id: string;
};

/** Everything the finder needs for one tier: input options, outcome pools and a price lookup. */
export function loadTierData(
  db: DatabaseSync,
  tier: Tier,
  variant: Variant,
  includeOwned = false,
  sellOnSteam = false,
) {
  const prices = loadPrices(db);
  // Steam names have no Doppler phase, so phased outcomes always use Skinport.
  const steam = sellOnSteam ? loadSteamPrices(db) : new Map<string, number>();
  const st = variant === "stattrak" ? " AND s.stattrak = 1" : "";
  const next = nextTier(tier);

  const outcomes = new Map<string, OutcomeSkin[]>();
  const addOutcome = (o: OutcomeSkin) => {
    const list = outcomes.get(o.collectionId) ?? [];
    list.push(o);
    outcomes.set(o.collectionId, list);
  };
  if (next === "Rare") {
    const rows = db
      .prepare(
        `SELECT r.collection_id, r.skin_id, r.name, r.phase, COALESCE(r.image, s.image) image,
                s.min_float, s.max_float, s.wears
         FROM rare_pool r LEFT JOIN skins s ON s.id = r.skin_id`,
      )
      .all() as {
      collection_id: string;
      skin_id: string;
      name: string;
      phase: string;
      image: string | null;
      min_float: number | null;
      max_float: number | null;
      wears: string | null;
    }[];
    for (const r of rows) {
      const hasWear = r.wears != null && JSON.parse(r.wears).length > 0;
      addOutcome({
        id: r.phase ? `${r.skin_id}|${r.phase}` : r.skin_id,
        name: r.name,
        collectionId: r.collection_id,
        minFloat: r.min_float ?? 0,
        maxFloat: r.max_float ?? 1,
        hasWear,
        phase: r.phase || undefined,
        image: r.image,
      });
    }
  } else {
    const rows = db
      .prepare(
        `SELECT s.id, s.name, s.image, s.min_float, s.max_float, s.wears, sc.collection_id
         FROM skins s JOIN skin_collections sc ON sc.skin_id = s.id
         WHERE s.rarity_name = ?${st}`,
      )
      .all(next) as SkinRow[];
    for (const r of rows) {
      addOutcome({
        id: r.id,
        name: r.name,
        collectionId: r.collection_id,
        minFloat: r.min_float ?? 0,
        maxFloat: r.max_float ?? 1,
        hasWear: JSON.parse(r.wears).length > 0,
        image: r.image,
      });
    }
  }

  const priceRow = (skin: OutcomeSkin, wear: WearName | null) =>
    prices.get(
      `${marketHashName(skin.name, wear, variant)}|${skin.phase ?? ""}`,
    );
  const steamCents = (skin: OutcomeSkin, wear: WearName | null) =>
    skin.phase
      ? undefined
      : steam.get(marketHashName(skin.name, wear, variant));
  /** Skinport's price shape for an outcome, and how much a falling price lowers it. */
  const trend = (
    skin: OutcomeSkin,
    wear: WearName | null,
  ): { signal: TrendSignal; cut: number } => {
    const r = priceRow(skin, wear);
    if (!r) return { signal: "unknown", cut: 0 };
    const input = {
      nowCents: r.min_cents,
      median24h: r.median_24h ?? null,
      median7d: r.median_7d,
      median30d: r.median_30d,
      median90d: r.median_90d,
    };
    const signal = classifyTrend(input);
    return { signal, cut: trendCut(signal, input, r.volume_30d ?? 0) };
  };
  /**
   * A real price: Steam (when selling there) or Skinport, lowered when the item has been
   * falling for weeks (the slide is market wide, so it applies to Steam's price too).
   */
  const realPrice = (skin: OutcomeSkin, wear: WearName | null) => {
    const cents = steamCents(skin, wear) ?? sellPrice(priceRow(skin, wear));
    if (cents == null) return null;
    const { cut } = trend(skin, wear);
    return cut > 0 ? Math.round(cents * (1 - cut)) : cents;
  };
  const estimate = (skin: OutcomeSkin, wear: WearName | null) =>
    floorEstimate(
      (phase, w) => realPrice({ ...skin, phase }, w),
      skin.phase,
      wear,
    );
  const price: PriceFn = (skin, wear) =>
    realPrice(skin, wear) ?? estimate(skin, wear);
  /** Where an outcome's sell price came from, or null when there is none. */
  const priceSource = (
    skin: OutcomeSkin,
    wear: WearName | null,
  ): PriceSource | null =>
    steamCents(skin, wear) != null
      ? "steam"
      : sellPrice(priceRow(skin, wear)) != null
        ? "skinport"
        : estimate(skin, wear) != null
          ? "estimate"
          : null;
  /** Market name of an outcome, for looking up its Steam price. */
  const outcomeName = (skin: OutcomeSkin, wear: WearName | null) =>
    marketHashName(skin.name, wear, variant);
  /** Copies listed on Skinport right now: the queue a thin item sells behind. */
  const listed = (skin: OutcomeSkin, wear: WearName | null) =>
    priceRow(skin, wear)?.quantity ?? 0;
  /** Sales in the last 30 days: low numbers mean the price may be fake or hard to sell at. */
  const volume30d = (skin: OutcomeSkin, wear: WearName | null) =>
    priceRow(skin, wear)?.volume_30d ?? 0;

  const inputRows = db
    .prepare(
      `SELECT s.id, s.name, s.image, s.min_float, s.max_float, s.wears, sc.collection_id
       FROM skins s JOIN skin_collections sc ON sc.skin_id = s.id
       WHERE s.rarity_name = ?${st}`,
    )
    .all(tier) as SkinRow[];
  const options: InputOption[] = [];
  for (const r of inputRows) {
    if (
      !outcomes.has(r.collection_id) ||
      r.min_float == null ||
      r.max_float == null
    )
      continue;
    for (const wear of JSON.parse(r.wears) as WearName[]) {
      const name = marketHashName(r.name, wear, variant);
      const p = prices.get(`${name}|`);
      if (!p || p.min_cents == null || p.quantity === 0) continue;
      const w = WEARS.findIndex((x) => x.name === wear);
      // Worst float inside this wear for this skin (wear upper bounds are exclusive).
      const worst = Math.min(r.max_float, WEARS[w].max - 1e-6);
      options.push({
        skinId: r.id,
        skinName: r.name,
        image: r.image,
        collectionId: r.collection_id,
        wear,
        marketHashName: name,
        float: Math.max(r.min_float, worst),
        minFloat: r.min_float,
        maxFloat: r.max_float,
        costCents: p.min_cents,
        // Only one copy is at the lowest listing; the others cost about what it sells for.
        // The usual sales price, not the thin-market sell price: buying isn't cheaper.
        nextCostCents: Math.max(p.min_cents, salesPrice(p) ?? p.min_cents),
        quantity: p.quantity,
      });
    }
  }

  const owned = includeOwned
    ? ownedOptions(db, inputRows, variant, prices)
    : [];
  return {
    options: [...cheapestPerCollectionWear(options), ...owned],
    outcomes,
    price,
    priceSource,
    outcomeName,
    volume30d,
    listed,
    trend,
  };
}

/**
 * Keeps only the cheapest skins per collection and wear: the others never win. "Cheapest"
 * has two meanings: the lowest single listing (best for one copy) and the lowest going price
 * (best for many copies), so up to two options survive per collection and wear.
 */
function cheapestPerCollectionWear(options: InputOption[]): InputOption[] {
  const single = new Map<string, InputOption>();
  const bulk = new Map<string, InputOption>();
  const bulkCost = (o: InputOption) => o.nextCostCents ?? o.costCents;
  for (const o of options) {
    const k = `${o.collectionId}|${o.wear}`;
    const s = single.get(k);
    if (!s || o.costCents < s.costCents) single.set(k, o);
    const b = bulk.get(k);
    if (!b || bulkCost(o) < bulkCost(b)) bulk.set(k, o);
  }
  return [...new Set([...single.values(), ...bulk.values()])];
}

/**
 * Skins the user holds (tracker) as finder options, grouped by market name. They count at
 * today's market price, since using them means not selling them.
 */
function ownedOptions(
  db: DatabaseSync,
  skins: SkinRow[],
  variant: Variant,
  prices: Map<string, PriceRow>,
): InputOption[] {
  const groups = new Map<string, number[]>();
  const costs = new Map<string, number[]>();
  for (const h of listHoldings(db)) {
    if (h.status !== "holding") continue;
    groups.set(h.marketHashName, [
      ...(groups.get(h.marketHashName) ?? []),
      h.float ?? -1,
    ]);
    costs.set(h.marketHashName, [
      ...(costs.get(h.marketHashName) ?? []),
      h.costCents,
    ]);
  }
  const options: InputOption[] = [];
  for (const r of skins) {
    if (r.min_float == null || r.max_float == null) continue;
    for (const wear of JSON.parse(r.wears) as WearName[]) {
      const name = marketHashName(r.name, wear, variant);
      const floats = groups.get(name);
      if (!floats) continue;
      const w = WEARS.findIndex((x) => x.name === wear);
      const worstOfWear = Math.max(
        r.min_float,
        Math.min(r.max_float, WEARS[w].max - 1e-6),
      );
      // Unknown floats (-1) count as the worst the wear allows.
      const worst = Math.max(...floats.map((f) => (f < 0 ? worstOfWear : f)));
      const paid = costs.get(name)!;
      options.push({
        skinId: r.id,
        skinName: r.name,
        image: r.image,
        collectionId: r.collection_id,
        wear,
        marketHashName: name,
        float: Math.min(Math.max(worst, r.min_float), r.max_float),
        minFloat: r.min_float,
        maxFloat: r.max_float,
        costCents:
          prices.get(`${name}|`)?.min_cents ??
          Math.round(paid.reduce((a, b) => a + b, 0) / paid.length),
        quantity: floats.length,
        owned: true,
      });
    }
  }
  return options;
}

/** Current sell price and 30-day sales for any market item, for the tracker. */
export function priceLookup(db: DatabaseSync) {
  const prices = loadPrices(db);
  return (marketHashName: string, version = "") => {
    const r = prices.get(`${marketHashName}|${version}`);
    return { sellCents: sellPrice(r), volume30d: r?.volume_30d ?? 0 };
  };
}
