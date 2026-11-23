import { describe, expect, it } from "vitest";
import {
  filtersUrl,
  parseFilters,
  shownAmount,
  urlFlag,
  urlNumber,
} from "./filters";

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

describe("money limits from links", () => {
  const p = (q: string) => new URLSearchParams(q);
  it("converts a US dollar limit from an alert link into the shown currency", () => {
    // $99.93 at 3.6725 AED per dollar.
    expect(shownAmount(null, p("maxUsd=99.93"), 3.6725)).toBe("366.99");
    expect(shownAmount(null, p("maxUsd=50"), 1)).toBe("50");
  });

  it("keeps a limit already in the shown currency, and what the user typed", () => {
    expect(shownAmount(null, p("max=20"), 3.6725)).toBe("20");
    expect(shownAmount("12", p("maxUsd=50"), 3.6725)).toBe("12");
    expect(shownAmount("", p("maxUsd=50"), 1)).toBe("");
    expect(shownAmount(null, p("maxUsd=abc"), 1)).toBe("");
    expect(shownAmount(null, p("minUsd=10"), 3.6725, "min")).toBe("36.73");
    expect(shownAmount(null, p("maxUsd=10"), 3.6725, "min")).toBe("");
  });
});
