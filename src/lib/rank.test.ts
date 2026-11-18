import { describe, expect, it } from "vitest";
import {
  CONTRACT_SORTS,
  isContractSort,
  profitPerDay,
  rankContracts,
  sortValue,
} from "./rank";

const contract = (
  name: string,
  profitCents: number,
  totalDays: number,
  extra: Partial<{
    roiPercent: number;
    oddsToProfit: number;
    bestCents: number;
    chanceDouble: number;
  }> = {},
) => ({
  name,
  result: {
    profitCents,
    roiPercent: extra.roiPercent ?? 0,
    oddsToProfit: extra.oddsToProfit ?? 0,
    spread: {
      bestCents: extra.bestCents ?? profitCents,
      chanceDouble: extra.chanceDouble ?? 0,
    },
  },
  timeline: { totalDays },
});

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe("rankContracts", () => {
  const slowBig = contract("slow big", 1000, 50, { bestCents: 3000 });
  const quickSmall = contract("quick small", 300, 6, { oddsToProfit: 0.9 });
  const lottery = contract("lottery", -200, 10, {
    bestCents: 90000,
    chanceDouble: 0.05,
    oddsToProfit: 0.05,
  });
  const steadyLoser = contract("steady loser", -50, 8, { oddsToProfit: 0.95 });
  const all = [slowBig, quickSmall, lottery, steadyLoser];

  it("ranks quick small wins above slow big ones per day", () => {
    expect(profitPerDay(slowBig)).toBe(20);
    expect(profitPerDay(quickSmall)).toBe(50);
    expect(names(rankContracts(all, "perDay"))).toEqual([
      "quick small",
      "slow big",
    ]);
  });

  it("keeps money-losing contracts out of every sort except expected profit", () => {
    expect(names(rankContracts(all, "best"))).toEqual([
      "slow big",
      "quick small",
    ]);
    expect(names(rankContracts(all, "odds"))).toEqual([
      "quick small",
      "slow big",
    ]);
    expect(names(rankContracts(all, "profit"))).toEqual([
      "slow big",
      "quick small",
      "steady loser",
      "lottery",
    ]);
  });

  it("breaks ties on expected profit and treats zero days as one", () => {
    const a = contract("a", 100, 0, { chanceDouble: 0.1 });
    const b = contract("b", 200, 0, { chanceDouble: 0.1 });
    expect(names(rankContracts([a, b], "double"))).toEqual(["b", "a"]);
    expect(profitPerDay(a)).toBe(100);
  });

  it("has a value for every sort and recognises sort names", () => {
    for (const key of CONTRACT_SORTS)
      expect(Number.isFinite(sortValue(slowBig, key))).toBe(true);
    expect(isContractSort("perDay")).toBe(true);
    expect(isContractSort("vibes")).toBe(false);
  });
});
