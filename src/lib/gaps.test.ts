import { describe, expect, it } from "vitest";
import { findGaps, type Quote } from "./gaps";

const q = (
  market: Quote["market"],
  buyCents: number | null,
  sellCents: number | null,
  sellIsEstimate = false,
): Quote => ({ market, buyCents, sellCents, sellIsEstimate });

describe("findGaps", () => {
  it("finds buy-here sell-there profits after the selling fee", () => {
    const gaps = findGaps([
      q("skinport", 1000, 1050),
      q("csfloat", 1100, 1200, true),
    ]);
    // Buy on Skinport for 1000, sell on CSFloat for 1200: 2% fee leaves 1176.
    expect(gaps).toEqual([
      {
        buyOn: "skinport",
        sellOn: "csfloat",
        buyCents: 1000,
        sellCents: 1200,
        netCents: 1176,
        profitCents: 176,
        margin: 0.176,
        paidInWallet: false,
        sellIsEstimate: true,
      },
    ]);
  });

  it("leaves out selling on Steam unless asked, then values the wallet money", () => {
    const quotes = [q("skinport", 1000, 1000), q("steam", 1400, 1400)];
    expect(findGaps(quotes)).toEqual([]);
    const full = findGaps(quotes, { includeSteamSell: true });
    // Steam takes about 13% from a 14.00 sale: the seller gets 12.19.
    expect(full[0]).toMatchObject({
      sellOn: "steam",
      netCents: 1219,
      profitCents: 219,
      paidInWallet: true,
    });
    // Valuing wallet money at 80% of cash: 975, a loss, so no gap.
    expect(
      findGaps(quotes, { includeSteamSell: true, walletValue: 0.8 }),
    ).toEqual([]);
  });

  it("skips missing prices and money-losing pairs", () => {
    expect(
      // Skinport can't be bought, CSFloat can't be sold; the one pair left
      // (buy CSFloat 9.00, sell Skinport 9.50, 8% fee: 8.74) loses money.
      findGaps([q("skinport", null, 950), q("csfloat", 900, null)]),
    ).toEqual([]);
    expect(
      findGaps([q("skinport", 1000, 1000), q("csfloat", 1000, 1010)]),
    ).toEqual([]);
  });
});
