import { describe, expect, it } from "vitest";
import { inputCost, searchLinks, shoppingListText } from "./shopping-list";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const fowl = {
  count: 2,
  marketHashName: "Five-SeveN | Fowl Play (Well-Worn)",
  maxFloat: 0.449999,
  firstCents: 1534,
  nextCents: 1583,
  listed: 34,
};

describe("shopping list", () => {
  it("links to each marketplace's search, CSFloat filtered by float", () => {
    expect(searchLinks("AK-47 | Redline (Field-Tested)", 0.38)).toEqual({
      skinport:
        "https://skinport.com/market?search=AK-47%20%7C%20Redline%20(Field-Tested)",
      csfloat:
        "https://csfloat.com/search?market_hash_name=AK-47+%7C+Redline+%28Field-Tested%29&max_float=0.380",
      steam:
        "https://steamcommunity.com/market/search?appid=730&q=AK-47%20%7C%20Redline%20(Field-Tested)",
    });
  });

  it("prices the first copy at the cheapest listing and the rest at the going price", () => {
    expect(inputCost(fowl)).toBe(1534 + 1583);
    expect(inputCost({ ...fowl, nextCents: null })).toBe(2 * 1534);
    expect(inputCost({ ...fowl, owned: true })).toBe(0);
  });

  it("writes one tick box per item, then the exact-float plan", () => {
    const text = shoppingListText({
      title: "Classified trade-up",
      inputs: [
        fowl,
        {
          count: 8,
          marketHashName: "MP9 | Old Roots (Field-Tested)",
          maxFloat: 0.38,
          firstCents: 64,
          nextCents: 64,
          listed: 120,
          owned: true,
        },
      ],
      costCents: 3629,
      evCents: 5000,
      profitCents: 1371,
      roiPercent: 37.8,
      money,
      pricesFrom: "the scan at noon",
      exact: {
        costCents: 3800,
        profitCents: 1900,
        buys: [
          {
            marketHashName: "Five-SeveN | Fowl Play (Well-Worn)",
            float: 0.381234,
            priceCents: 1700,
            url: "https://csfloat.com/item/1",
          },
        ],
      },
    });
    expect(text.split("\n")).toEqual([
      "Imbalance shopping list: Classified trade-up",
      "Cost about $36.29, expected back $50.00 after fees, profit $13.71 (38%) on average.",
      "",
      "[ ] 2x Five-SeveN | Fowl Play (Well-Worn): cheapest $15.34, then about $15.83 each ($31.17 in all).",
      // 0.449999 rounds down: 0.450 would already be Battle-Scarred.
      "    Float 0.449 or lower. 34 listed on Skinport.",
      `    Skinport: ${searchLinks(fowl.marketHashName).skinport}`,
      `    CSFloat:  ${searchLinks(fowl.marketHashName, fowl.maxFloat).csfloat}`,
      `    Steam:    ${searchLinks(fowl.marketHashName).steam}`,
      "",
      "[x] 8x MP9 | Old Roots (Field-Tested): you own these already.",
      "",
      "Exact-float plan instead (CSFloat listings): cost $38.00, profit $19.00 on average.",
      "[ ] Five-SeveN | Fowl Play (Well-Worn), float 0.38123, $17.00: https://csfloat.com/item/1",
      "",
      "Prices from the scan at noon. Listings change fast: check each price and float before buying. Bought items are usually trade locked for about a week.",
    ]);
  });
});
