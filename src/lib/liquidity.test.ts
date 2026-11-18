import { describe, expect, it } from "vitest";
import { liquidSellPrice, thinness } from "./liquidity";

describe("liquidity", () => {
  it("rates thinness from 30-day sales", () => {
    expect(thinness(0)).toBe(1);
    expect(thinness(5)).toBe(0.5);
    expect(thinness(10)).toBe(0);
    expect(thinness(500)).toBe(0);
  });

  it("leans a thin item's price towards a cheaper listing", () => {
    // Sells often: the median stands even with a cheaper listing.
    expect(liquidSellPrice(1000, 800, 40)).toBe(1000);
    // 5 sales a month: halfway to the listing.
    expect(liquidSellPrice(1000, 800, 5)).toBe(900);
    // Never sold in 30 days: the listing is the price to beat.
    expect(liquidSellPrice(1000, 800, 0)).toBe(800);
  });

  it("ignores listings above the median and missing ones", () => {
    expect(liquidSellPrice(1000, 1500, 1)).toBe(1000);
    expect(liquidSellPrice(1000, null, 1)).toBe(1000);
  });
});
