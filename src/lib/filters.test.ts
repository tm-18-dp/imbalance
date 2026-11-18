import { describe, expect, it } from "vitest";
import { filtersUrl, parseFilters, urlFlag, urlNumber } from "./filters";

describe("filters", () => {
  it("turns an AI reply into a trade-ups URL", () => {
    const f = parseFilters(
      'Sure: {"page":"tradeups","tier":"Restricted","maxCost":20,"stattrak":false}',
    );
    expect(f && filtersUrl(f)).toBe(
      "/tradeups?tier=Restricted&stattrak=0&max=20",
    );
  });

  it("turns an AI reply into a deals URL", () => {
    const f = parseFilters(
      '```json\n{"page":"deals","search":"AK-47","dipsOnly":true,"minSold30d":20}\n```',
    );
    expect(f && filtersUrl(f)).toBe("/deals?q=AK-47&minVolume=20&dips=1");
  });

  it("carries a risk level and rejects unknown ones", () => {
    const f = parseFilters(
      '{"page":"tradeups","tier":"Covert","risk":"aggressive"}',
    );
    expect(f && filtersUrl(f)).toBe("/tradeups?tier=Covert&risk=aggressive");
    expect(parseFilters('{"page":"deals","risk":"yolo"}')).toBeNull();
  });

  it("rejects junk, unknown tiers and non-searches", () => {
    expect(parseFilters("no idea")).toBeNull();
    expect(parseFilters('{"page":"tradeups","tier":"Gold"}')).toBeNull();
    expect(parseFilters("{broken")).toBeNull();
    expect(filtersUrl(parseFilters('{"page":"none"}')!)).toBeNull();
  });

  it("reads filters back from the URL safely", () => {
    const p = new URLSearchParams("max=20.5&dips=1&minVolume=abc");
    expect(urlNumber(p, "max", "")).toBe("20.5");
    expect(urlNumber(p, "minVolume", "10")).toBe("10");
    expect(urlFlag(p, "dips", false)).toBe(true);
    expect(urlFlag(p, "weapons", true)).toBe(true);
  });
});
