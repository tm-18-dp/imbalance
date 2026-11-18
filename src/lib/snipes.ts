import { floatFlags, type FloatFlag } from "./special-float";

/**
 * Float sniping: CSFloat listings with a float collectors pay extra for (0.00x, best of a
 * wear, the skin's lowest or highest possible), priced about the same as an ordinary float
 * of the same item. Imbalance doesn't price the premium itself (that needs sales at that
 * exact float): it shows how little extra you pay over an ordinary one.
 */

export type SnipeListing = {
  id: string;
  marketHashName: string;
  priceCents: number;
  float: number;
  url: string;
  paintSeed?: number | null;
};

export type Snipe = {
  listing: SnipeListing;
  flags: FloatFlag[];
  /** At least one flag is the rarer kind (0.000x, lowest or highest possible). */
  rare: boolean;
  /** What an ordinary float costs: the lower of Skinport's sale price and CSFloat's cheapest ordinary listing. */
  referenceCents: number;
  /** Price over the reference, e.g. 0.05 for 5% more. Can be negative. */
  overReference: number;
};

/** Default: show special floats costing at most this much over an ordinary one. */
export const DEFAULT_MAX_OVER = 0.15;

/**
 * Special-float listings of one item priced within `maxOver` of an ordinary float.
 * `normalCents` is the item's usual sale price (Skinport); the cheapest ordinary listing in
 * `listings` is the other reference, and the lower of the two is used. Rarest first, then
 * the smallest premium paid.
 */
export function findSnipes(
  listings: readonly SnipeListing[],
  skin: { minFloat: number; maxFloat: number },
  normalCents: number | null,
  maxOver = DEFAULT_MAX_OVER,
): Snipe[] {
  const flagged = listings.map((l) => ({
    l,
    flags: floatFlags(l.float, skin.minFloat, skin.maxFloat),
  }));
  const ordinary = flagged
    .filter((x) => x.flags.length === 0)
    .map((x) => x.l.priceCents);
  const cheapestOrdinary = ordinary.length ? Math.min(...ordinary) : null;
  const refs = [normalCents, cheapestOrdinary].filter(
    (c): c is number => c != null && c > 0,
  );
  if (!refs.length) return [];
  const referenceCents = Math.min(...refs);

  return flagged
    .filter((x) => x.flags.length > 0)
    .map(({ l, flags }) => ({
      listing: l,
      flags,
      rare: flags.some((f) => f.rare),
      referenceCents,
      overReference: l.priceCents / referenceCents - 1,
    }))
    .filter((s) => s.overReference <= maxOver + 1e-9)
    .sort(
      (a, b) =>
        Number(b.rare) - Number(a.rare) || a.overReference - b.overReference,
    );
}
