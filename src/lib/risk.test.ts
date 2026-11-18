import { describe, expect, it } from "vitest";
import {
  isRiskProfileId,
  RISK_PROFILE_IDS,
  RISK_PROFILES,
  riskNotes,
  thinShare,
  withinProfile,
} from "./risk";

const o = (
  probability: number,
  netCents: number,
  volume30d: number,
  priceCents: number | null = netCents,
) => ({ probability, netCents, volume30d, priceCents });

describe("riskNotes", () => {
  it("flags value that rests on thin markets, even at low odds", () => {
    // Two 9% outcomes with no sales carry almost all the value.
    const notes = riskNotes(
      [o(0.09, 30000, 0), o(0.09, 17000, 1), o(0.82, 90, 60)],
      4300,
    );
    expect(notes[0]).toMatch(/^98% of the expected value/);
  });
  it("passes contracts whose value comes from liquid skins", () => {
    expect(riskNotes([o(0.5, 1000, 50), o(0.5, 100, 0)], 550)).toEqual([]);
  });
  it("flags missing prices", () => {
    expect(riskNotes([o(1, 0, 10, null)], 0)).toEqual([
      "1 outcome(s) have no price, counted as 0",
    ]);
  });
});

describe("risk profiles", () => {
  // 30% of the value from a skin that sold twice, the rest from a liquid one.
  const twoSales = [o(0.5, 600, 2), o(0.5, 1400, 50)];
  const ev = 1000;

  it("gets looser from Safe to Aggressive", () => {
    const [safe, balanced, aggressive] = RISK_PROFILE_IDS.map(
      (id) => RISK_PROFILES[id],
    );
    expect(safe.thinMarket).toBeGreaterThanOrEqual(balanced.thinMarket);
    expect(balanced.thinMarket).toBeGreaterThanOrEqual(aggressive.thinMarket);
    expect(safe.maxThinShare).toBeLessThan(balanced.maxThinShare);
    expect(balanced.maxThinShare).toBeLessThan(aggressive.maxThinShare);
    expect(safe.dealMinVolume30d).toBeGreaterThan(aggressive.dealMinVolume30d);
  });

  it("measures the share of value from thin markets", () => {
    expect(thinShare(twoSales, ev, 3)).toBeCloseTo(0.3);
    expect(thinShare(twoSales, ev, 2)).toBe(0);
    expect(thinShare(twoSales, 0, 3)).toBe(0);
  });

  it("lets Balanced and Aggressive through where Safe says no", () => {
    expect(withinProfile(twoSales, ev, RISK_PROFILES.safe)).toBe(false);
    expect(withinProfile(twoSales, ev, RISK_PROFILES.balanced)).toBe(true);
    expect(withinProfile(twoSales, ev, RISK_PROFILES.aggressive)).toBe(true);
  });

  it("allows unpriced outcomes only in Aggressive", () => {
    const unpriced = [o(0.1, 0, 0, null), o(0.9, 1000, 50)];
    expect(withinProfile(unpriced, 900, RISK_PROFILES.balanced)).toBe(false);
    expect(withinProfile(unpriced, 900, RISK_PROFILES.aggressive)).toBe(true);
  });

  it("keeps warning by the Safe rules whatever the profile", () => {
    expect(riskNotes(twoSales, ev)).toEqual([
      "30% of the expected value comes from skins that sold under 3 times in 30 days",
    ]);
  });

  it("recognises profile ids", () => {
    expect(isRiskProfileId("balanced")).toBe(true);
    expect(isRiskProfileId("yolo")).toBe(false);
  });
});
