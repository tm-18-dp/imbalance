import { describe, expect, it } from "vitest";
import {
  groupLabel,
  monthlyRealized,
  resultsBy,
  type ResultHolding,
} from "./results";

const NOV = Date.UTC(2026, 10, 10);
const DEC = Date.UTC(2026, 11, 3);
const h = (o: Partial<ResultHolding>): ResultHolding => ({
  status: "sold",
  costCents: 1000,
  soldNetCents: null,
  soldAt: null,
  strategy: null,
  risk: null,
  valueCents: null,
  ...o,
});

const holdings: ResultHolding[] = [
  // Two trade-up results at Aggressive: +500 and -200.
  h({
    strategy: "trade-up",
    risk: "aggressive",
    soldNetCents: 1500,
    soldAt: NOV,
  }),
  h({
    strategy: "trade-up",
    risk: "aggressive",
    soldNetCents: 800,
    soldAt: DEC,
  }),
  // Its inputs: used up, so left out.
  h({
    status: "used",
    strategy: "trade-up",
    risk: "aggressive",
    costCents: 100,
  }),
  // A Safe deal still held, worth 1100 now.
  h({ status: "holding", strategy: "deal", risk: "safe", valueCents: 1100 }),
  // An old untagged sale: +50.
  h({ soldNetCents: 1050, soldAt: NOV }),
];

describe("strategy results", () => {
  it("sums sold and held items per strategy, in a fixed order", () => {
    const rows = resultsBy(holdings, "strategy");
    expect(rows.map((r) => r.key)).toEqual(["deal", "trade-up", "untagged"]);
    expect(rows[1]).toMatchObject({
      sold: 2,
      soldCostCents: 2000,
      realizedCents: 300,
      roi: 0.15,
      held: 0,
    });
    expect(rows[0]).toMatchObject({
      sold: 0,
      roi: null,
      held: 1,
      investedCents: 1000,
      unrealizedCents: 100,
    });
  });

  it("groups by risk level too", () => {
    const rows = resultsBy(holdings, "risk");
    expect(rows.map((r) => r.key)).toEqual(["safe", "aggressive", "untagged"]);
    expect(rows[1].realizedCents).toBe(300);
  });

  it("splits profit from sales by month", () => {
    expect(monthlyRealized(holdings, "strategy")).toEqual({
      keys: ["trade-up", "untagged"],
      months: [
        { month: "2026-11", byKey: { "trade-up": 500, untagged: 50 } },
        { month: "2026-12", byKey: { "trade-up": -200 } },
      ],
    });
  });

  it("labels groups", () => {
    expect(groupLabel("float-snipe")).toBe("Float snipe");
    expect(groupLabel("balanced")).toBe("Balanced");
    expect(groupLabel("untagged")).toBe("Untagged");
  });
});
