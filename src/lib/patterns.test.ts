import { describe, expect, it } from "vitest";
import { patternFinish, patternFlag, skinOf } from "./patterns";

describe("pattern flags", () => {
  it("strips wear, StatTrak and Souvenir from names", () => {
    expect(skinOf("StatTrak™ AK-47 | Case Hardened (Field-Tested)")).toBe(
      "AK-47 | Case Hardened",
    );
    expect(skinOf("★ Karambit | Fade (Factory New)")).toBe("★ Karambit | Fade");
  });

  it("knows which finishes depend on the pattern", () => {
    expect(patternFinish("AK-47 | Case Hardened (Well-Worn)")?.finish).toBe(
      "Case Hardened",
    );
    expect(
      patternFinish("★ Karambit | Marble Fade (Factory New)")?.finish,
    ).toBe("Marble Fade");
    expect(patternFinish("★ Karambit | Fade (Factory New)")?.finish).toBe(
      "Fade",
    );
    expect(
      patternFinish("★ Bayonet | Gamma Doppler (Factory New)")?.finish,
    ).toBe("Doppler");
    // "Amber Fade" is a different finish whose pattern hardly matters.
    expect(patternFinish("P2000 | Amber Fade (Field-Tested)")).toBeNull();
    expect(patternFinish("AK-47 | Redline (Field-Tested)")).toBeNull();
  });

  it("recognises built-in and user premium patterns, yours first", () => {
    const ak = "AK-47 | Case Hardened (Field-Tested)";
    expect(patternFlag(ak, 661).known).toEqual({
      label: "Blue gem",
      source: "built-in",
    });
    expect(patternFlag(ak, 662).known).toBeNull();
    expect(patternFlag(ak, 662).sensitive?.finish).toBe("Case Hardened");
    const mine = [
      { skin: "AK-47 | Case Hardened", seeds: [662], label: "Tier 2" },
    ];
    expect(patternFlag(ak, 662, mine).known).toEqual({
      label: "Tier 2",
      source: "yours",
    });
    expect(patternFlag(ak, null).known).toBeNull();
  });
});
