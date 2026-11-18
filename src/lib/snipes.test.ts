import { describe, expect, it } from "vitest";
import { findSnipes, type SnipeListing } from "./snipes";

let n = 0;
const l = (float: number, priceCents: number): SnipeListing => ({
  id: `S${n++}`,
  marketHashName: "AK-47 | Redline (Field-Tested)",
  priceCents,
  float,
  url: "",
});
// Redline: floats 0.10 to 0.70.
const redline = { minFloat: 0.1, maxFloat: 0.7 };

describe("findSnipes", () => {
  it("finds special floats priced like ordinary ones", () => {
    const snipes = findSnipes(
      [
        l(0.25, 1000), // ordinary
        l(0.3, 1050), // ordinary
        l(0.152, 1040), // best FT, 4% over
        l(0.1004, 1100), // lowest possible, 10% over
        l(0.151, 2500), // best FT but priced like a collector item: skip
      ],
      redline,
      1200,
    );
    expect(snipes.map((s) => s.listing.float)).toEqual([0.1004, 0.152]);
    expect(snipes[0].rare).toBe(true);
    expect(snipes[0].flags.map((f) => f.label)).toContain("Lowest possible");
    // Reference is the cheaper of Skinport (1200) and CSFloat's cheapest ordinary (1000).
    expect(snipes[1].referenceCents).toBe(1000);
    expect(snipes[1].overReference).toBeCloseTo(0.04);
  });

  it("works with only one reference price, and with none returns nothing", () => {
    const special = l(0.1503, 900);
    expect(findSnipes([special], redline, 1000)[0].overReference).toBeCloseTo(
      -0.1,
    );
    expect(findSnipes([special, l(0.3, 950)], redline, null)).toHaveLength(1);
    expect(findSnipes([special], redline, null)).toEqual([]);
  });

  it("respects the allowed premium", () => {
    const listings = [l(0.3, 1000), l(0.152, 1100)];
    expect(findSnipes(listings, redline, null, 0.05)).toEqual([]);
    expect(findSnipes(listings, redline, null, 0.1)).toHaveLength(1);
  });
});
