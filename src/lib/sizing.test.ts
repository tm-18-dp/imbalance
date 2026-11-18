import { describe, expect, it } from "vitest";
import {
  bankrollShare,
  MAX_TRIES,
  sizingWarning,
  triesText,
  triesToBeAhead,
} from "./sizing";

describe("bankroll sizing", () => {
  it("measures one buy against the bankroll", () => {
    expect(bankrollShare(5000, 100000)).toBe(0.05);
    expect(bankrollShare(5000, null)).toBeNull();
    expect(bankrollShare(5000, 0)).toBeNull();
  });

  it("warns only above 10% of the bankroll", () => {
    expect(sizingWarning(10000, 100000)).toBeNull();
    expect(sizingWarning(25000, 100000)).toMatch(
      /^This is 25% of your bankroll/,
    );
    expect(sizingWarning(150000, 100000)).toBe(
      "This costs more than your whole bankroll.",
    );
    expect(sizingWarning(150000, null)).toBeNull();
  });
});

describe("triesToBeAhead", () => {
  it("needs more tries the bigger the swing is next to the profit", () => {
    // Profit $1 a try, swing $2: (1.2816 * 2 / 1)^2 = 6.57, so 7 tries.
    expect(triesToBeAhead(100, 200)).toBe(7);
    // Same profit, ten times the swing: a hundred times the tries.
    expect(triesToBeAhead(100, 2000)).toBe(657);
  });

  it("handles sure things, losers and hopeless cases", () => {
    expect(triesToBeAhead(100, 0)).toBe(1);
    expect(triesToBeAhead(100, 50)).toBe(1);
    expect(triesToBeAhead(0, 100)).toBeNull();
    expect(triesToBeAhead(-50, 100)).toBeNull();
    expect(triesToBeAhead(1, 10000)).toBe(Infinity);
  });

  it("says it in plain English", () => {
    expect(triesText(7)).toMatch(/about 7 tries/);
    expect(triesText(1)).toMatch(/single try/);
    expect(triesText(null)).toMatch(/Loses money on average/);
    expect(triesText(Infinity)).toMatch(new RegExp(`over ${MAX_TRIES}`));
  });
});
