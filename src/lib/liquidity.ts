/**
 * How easily an item sells. Below `LIQUID_SALES_30D` sales a month the sales median is a
 * weak guide: buyers are few, and the cheapest listing is the price you'd have to beat.
 */
export const LIQUID_SALES_30D = 10;

/** 0 for an item that sells often, rising to 1 for one that never sold in 30 days. */
export function thinness(volume30d: number): number {
  return Math.min(1, Math.max(0, 1 - volume30d / LIQUID_SALES_30D));
}

/**
 * Sell price for an item from its sales median and lowest listing. When someone already
 * lists it below the median, a thin item has to compete with that listing to sell at all,
 * so the price leans towards it: halfway at 5 sales a month, all the way at none. Items
 * that sell often keep the median. A listing above the median changes nothing.
 */
export function liquidSellPrice(
  medianCents: number,
  listingCents: number | null,
  volume30d: number,
): number {
  if (listingCents == null || listingCents >= medianCents) return medianCents;
  return Math.round(
    medianCents - thinness(volume30d) * (medianCents - listingCents),
  );
}
