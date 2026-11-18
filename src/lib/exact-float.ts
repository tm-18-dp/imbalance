import type { Marketplace } from "./fees";
import {
  evaluateContract,
  normalizeFloat,
  type ContractInput,
  type ContractResult,
  type OutcomeSkin,
  type PriceFn,
  type Tier,
} from "./tradeup";
import { WEARS } from "./wear";

/**
 * Exact-float trade-ups: instead of assuming the worst float each wear allows, pick real
 * listings (with known floats) so the average float lands under a better-wear threshold,
 * for the lowest total price. All money in integer USD cents.
 */

export type FloatListing = {
  id: string;
  marketHashName: string;
  priceCents: number;
  float: number;
  url: string;
};

/** One input slot of a contract: how many to buy of one skin, and the listings to pick from. */
export type InputGroup = {
  skinName: string;
  collectionId: string;
  count: number;
  minFloat: number;
  maxFloat: number;
  listings: FloatListing[];
};

/** Normalized floats are rounded up to this grid, so a plan never overshoots its target. */
const UNITS = 1000;
/**
 * Kept below each threshold, in normalized-average terms. The game stores floats in 32 bits,
 * so an average exactly on a boundary may round the wrong way.
 */
export const SAFETY_MARGIN = 0.001;

export type Pick = { group: number; listing: FloatListing };

/** Normalized float of a listing in its group, rounded up to the grid. */
const units = (g: InputGroup, l: FloatListing) =>
  Math.ceil(normalizeFloat(l.float, g.minFloat, g.maxFloat) * UNITS - 1e-9);

/**
 * For one group: cheapest cost of exactly `count` distinct listings for each rounded float
 * sum, and a way to get those listings back. Null when there aren't enough listings.
 */
function groupTable(g: InputGroup) {
  const usable = g.listings.filter(
    (l) => l.float >= g.minFloat && l.float <= g.maxFloat,
  );
  if (usable.length < g.count) return null;
  const k = g.count;
  const width = k * UNITS + 1;
  // dp[c * width + s]: cheapest cost of c listings with rounded sum s, over listings so far.
  let dp = new Float64Array((k + 1) * width).fill(Infinity);
  dp[0] = 0;
  const took: Uint8Array[] = [];
  for (const l of usable) {
    const u = units(g, l);
    const next = dp.slice();
    const t = new Uint8Array((k + 1) * width);
    for (let c = 1; c <= k; c++)
      for (let s = u; s < width; s++) {
        const prev = dp[(c - 1) * width + s - u];
        if (prev === Infinity) continue;
        const v = prev + l.priceCents;
        if (v < next[c * width + s]) {
          next[c * width + s] = v;
          t[c * width + s] = 1;
        }
      }
    took.push(t);
    dp = next;
  }
  return {
    costByUnits: dp.slice(k * width, (k + 1) * width),
    recover(sum: number): FloatListing[] {
      const out: FloatListing[] = [];
      let c = k;
      let s = sum;
      for (let i = usable.length - 1; i >= 0 && c > 0; i--) {
        if (took[i][c * width + s]) {
          out.push(usable[i]);
          s -= units(g, usable[i]);
          c--;
        }
      }
      return out;
    },
  };
}

/**
 * Builds the cheapest-cost table for a whole contract once; `cheapestUnder(maxNormSum)`
 * then answers any threshold: the cheapest way to fill every group with its exact count of
 * distinct listings so the sum of normalized floats stays at or under `maxNormSum`.
 * Each normalized float is rounded up, so the real sum is never higher than promised.
 * Null when the groups can't be filled at all.
 */
export function floatSolver(groups: readonly InputGroup[]) {
  const tables = groups.map(groupTable);
  if (tables.some((t) => t == null)) return null;
  const cap = groups.reduce((s, g) => s + g.count, 0) * UNITS;

  // best[s]: cheapest cost with combined rounded sum exactly s; choice[g][s]: group g's part.
  let best = new Float64Array(cap + 1).fill(Infinity);
  best[0] = 0;
  const choice: Int32Array[] = [];
  for (const t of tables) {
    const row = t!.costByUnits;
    const next = new Float64Array(cap + 1).fill(Infinity);
    const part = new Int32Array(cap + 1).fill(-1);
    for (let s = 0; s <= cap; s++) {
      if (best[s] === Infinity) continue;
      for (let u = 0; u < row.length && s + u <= cap; u++) {
        if (row[u] === Infinity) continue;
        const c = best[s] + row[u];
        if (c < next[s + u]) {
          next[s + u] = c;
          part[s + u] = u;
        }
      }
    }
    choice.push(part);
    best = next;
  }
  // bestAtMost[s]: the cheapest total with rounded sum at most s.
  const bestAtMost = new Int32Array(cap + 1).fill(-1);
  for (let s = 0; s <= cap; s++) {
    const prev = s > 0 ? bestAtMost[s - 1] : -1;
    bestAtMost[s] =
      best[s] !== Infinity && (prev < 0 || best[s] < best[prev]) ? s : prev;
  }

  return {
    cheapestUnder(
      maxNormSum: number,
    ): { picks: Pick[]; costCents: number } | null {
      if (maxNormSum < 0) return null;
      const limit = Math.min(cap, Math.floor(maxNormSum * UNITS + 1e-9));
      const total = bestAtMost[limit];
      if (total < 0) return null;
      const picks: Pick[] = [];
      let s = total;
      for (let gi = groups.length - 1; gi >= 0; gi--) {
        const u = choice[gi][s];
        for (const listing of tables[gi]!.recover(u))
          picks.push({ group: gi, listing });
        s -= u;
      }
      return { picks: picks.reverse(), costCents: Math.round(best[total]) };
    },
  };
}

/** Average normalized input floats below which this outcome lands in a better wear. */
export function betterWearThresholds(skin: OutcomeSkin): number[] {
  if (!skin.hasWear || skin.maxFloat <= skin.minFloat) return [];
  return WEARS.slice(0, -1)
    .map((w) => w.max)
    .filter((b) => b > skin.minFloat && b < skin.maxFloat)
    .map((b) => normalizeFloat(b, skin.minFloat, skin.maxFloat));
}

export type FloatPlan = {
  /** Average normalized float the plan stays under, or null for "cheapest, any float". */
  target: number | null;
  picks: Pick[];
  result: ContractResult;
};

/**
 * Tries "cheapest listings, any float" and every better-wear threshold the outcomes have.
 * For each, buys the cheapest listings that fit and prices the contract with their real
 * floats. Plans come back best profit first; identical sets of listings are dropped.
 */
export function planExactFloats(
  tier: Tier,
  groups: readonly InputGroup[],
  outcomesByCollection: ReadonlyMap<string, readonly OutcomeSkin[]>,
  price: PriceFn,
  market: Marketplace,
): FloatPlan[] {
  const solver = floatSolver(groups);
  if (!solver) return [];
  const n = groups.reduce((s, g) => s + g.count, 0);
  const evaluate = (picks: Pick[]) =>
    evaluateContract(
      tier,
      picks.map(({ group, listing }): ContractInput => ({
        collectionId: groups[group].collectionId,
        float: listing.float,
        minFloat: groups[group].minFloat,
        maxFloat: groups[group].maxFloat,
        costCents: listing.priceCents,
      })),
      outcomesByCollection,
      price,
      market,
    );

  const plans: FloatPlan[] = [];
  const seen = new Set<string>();
  const add = (target: number | null, picks: Pick[]) => {
    const key = picks
      .map((p) => p.listing.id)
      .sort()
      .join(",");
    if (seen.has(key)) return;
    seen.add(key);
    plans.push({ target, picks, result: evaluate(picks) });
  };

  const cheapest = solver.cheapestUnder(n);
  if (!cheapest) return [];
  add(null, cheapest.picks);

  const thresholds = new Set<number>();
  for (const c of new Set(groups.map((g) => g.collectionId)))
    for (const skin of outcomesByCollection.get(c) ?? [])
      for (const t of betterWearThresholds(skin)) thresholds.add(t);
  for (const t of [...thresholds].sort((a, b) => b - a)) {
    const target = t - SAFETY_MARGIN;
    if (target <= 0) continue;
    const fit = solver.cheapestUnder(target * n);
    if (fit) add(target, fit.picks);
  }
  return plans.sort((a, b) => b.result.profitCents - a.result.profitCents);
}
