/**
 * A trade-up's shopping list as plain text, to copy into notes or a chat: what to buy, how
 * many, the most each float can be, the price to expect and where to search. Pure, so the
 * page can build it; money is formatted by the caller in the user's currency.
 */

export type ShoppingInput = {
  count: number;
  marketHashName: string;
  /** Highest float that still keeps the contract as scanned. */
  maxFloat: number;
  /** The cheapest copy, then the going price for the rest. */
  firstCents: number;
  nextCents: number | null;
  listed: number;
  /** Skins you already own: nothing to buy. */
  owned?: boolean;
};

export type ExactBuy = {
  marketHashName: string;
  float: number;
  priceCents: number;
  url: string;
};

/** Rounded down, never up: 0.449999 must not read 0.450, where the next wear starts. */
export const floorFloat = (f: number) =>
  (Math.floor(f * 1000 + 1e-9) / 1000).toFixed(3);

/**
 * Marketplace searches for one item. CSFloat's is filtered to floats that still work.
 * Steam gets its search page: item pages by name (/market/listings/730/...) redirect to
 * Steam's new-style address and failed with a server error when checked (Nov 2026).
 */
export function searchLinks(marketHashName: string, maxFloat?: number) {
  const name = encodeURIComponent(marketHashName);
  const csfloat = new URLSearchParams({ market_hash_name: marketHashName });
  if (maxFloat != null) csfloat.set("max_float", floorFloat(maxFloat));
  return {
    skinport: `https://skinport.com/market?search=${name}`,
    csfloat: `https://csfloat.com/search?${csfloat}`,
    steam: `https://steamcommunity.com/market/search?appid=730&q=${name}`,
  };
}

export const inputCost = (i: ShoppingInput) =>
  i.owned ? 0 : i.firstCents + (i.count - 1) * (i.nextCents ?? i.firstCents);

export function shoppingListText(opts: {
  title: string;
  inputs: readonly ShoppingInput[];
  costCents: number;
  evCents: number;
  profitCents: number;
  roiPercent: number;
  money: (cents: number) => string;
  /** When prices were last updated, already formatted. */
  pricesFrom: string;
  /** The exact-float plan's CSFloat listings, when one was picked. */
  exact?: { buys: readonly ExactBuy[]; costCents: number; profitCents: number };
}): string {
  const { money } = opts;
  const lines = [
    `Imbalance shopping list: ${opts.title}`,
    `Cost about ${money(opts.costCents)}, expected back ${money(opts.evCents)} after fees, profit ${money(opts.profitCents)} (${opts.roiPercent.toFixed(0)}%) on average.`,
    "",
  ];
  for (const i of opts.inputs) {
    if (i.owned) {
      lines.push(
        `[x] ${i.count}x ${i.marketHashName}: you own these already.`,
        "",
      );
      continue;
    }
    const price =
      i.count > 1 && i.nextCents != null && i.nextCents > i.firstCents
        ? `cheapest ${money(i.firstCents)}, then about ${money(i.nextCents)} each`
        : `about ${money(i.firstCents)} each`;
    const links = searchLinks(i.marketHashName, i.maxFloat);
    lines.push(
      `[ ] ${i.count}x ${i.marketHashName}: ${price} (${money(inputCost(i))} in all).`,
      `    Float ${floorFloat(i.maxFloat)} or lower. ${i.listed} listed on Skinport.`,
      `    Skinport: ${links.skinport}`,
      `    CSFloat:  ${links.csfloat}`,
      `    Steam:    ${links.steam}`,
      "",
    );
  }
  if (opts.exact?.buys.length) {
    lines.push(
      `Exact-float plan instead (CSFloat listings): cost ${money(opts.exact.costCents)}, profit ${money(opts.exact.profitCents)} on average.`,
    );
    for (const b of opts.exact.buys)
      lines.push(
        `[ ] ${b.marketHashName}, float ${b.float.toFixed(5)}, ${money(b.priceCents)}: ${b.url}`,
      );
    lines.push("");
  }
  lines.push(
    `Prices from ${opts.pricesFrom}. Listings change fast: check each price and float before buying. Bought items are usually trade locked for about a week.`,
  );
  return lines.join("\n");
}
