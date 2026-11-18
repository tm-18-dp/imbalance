import { MARKETPLACES, type MarketplaceId } from "./fees";

/**
 * Cross-market gaps: buy an item on one marketplace and sell it on another. All money in
 * integer USD cents.
 */

/** What one marketplace offers for one item. */
export type Quote = {
  market: MarketplaceId;
  /** What you'd pay to buy it now (its lowest listing), or null. */
  buyCents: number | null;
  /** What you can expect to sell it for there (before the fee), or null. */
  sellCents: number | null;
  /** True when the sell price is a guess (for example, just under the lowest listing). */
  sellIsEstimate?: boolean;
};

export type Gap = {
  buyOn: MarketplaceId;
  sellOn: MarketplaceId;
  buyCents: number;
  sellCents: number;
  /** What the sale brings in after the fee, valued in cash (Steam wallet scaled). */
  netCents: number;
  profitCents: number;
  /** Profit as a share of what you pay. */
  margin: number;
  /** Selling on Steam pays Steam wallet money, which can't be withdrawn. */
  paidInWallet: boolean;
  sellIsEstimate: boolean;
};

export type GapOptions = {
  /** Include selling on the Steam Market, which pays in Steam wallet money. */
  includeSteamSell?: boolean;
  /** What a dollar of Steam wallet money is worth to you in cash, 0 to 1. */
  walletValue?: number;
};

/**
 * Every buy-here, sell-there pair for one item, best profit first. Only pairs that make
 * money after the selling marketplace's fee are returned.
 */
export function findGaps(
  quotes: readonly Quote[],
  opts: GapOptions = {},
): Gap[] {
  const walletValue = Math.min(1, Math.max(0, opts.walletValue ?? 1));
  const gaps: Gap[] = [];
  for (const buy of quotes) {
    if (buy.buyCents == null || buy.buyCents <= 0) continue;
    for (const sell of quotes) {
      if (sell.market === buy.market || sell.sellCents == null) continue;
      const paidInWallet = sell.market === "steam";
      if (paidInWallet && !opts.includeSteamSell) continue;
      const fee = MARKETPLACES[sell.market].net(sell.sellCents);
      const netCents = paidInWallet ? Math.floor(fee * walletValue) : fee;
      const profitCents = netCents - buy.buyCents;
      if (profitCents <= 0) continue;
      gaps.push({
        buyOn: buy.market,
        sellOn: sell.market,
        buyCents: buy.buyCents,
        sellCents: sell.sellCents,
        netCents,
        profitCents,
        margin: profitCents / buy.buyCents,
        paidInWallet,
        sellIsEstimate: Boolean(sell.sellIsEstimate),
      });
    }
  }
  return gaps.sort((a, b) => b.profitCents - a.profitCents);
}
