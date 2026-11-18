/** Ways to rank trade-up contracts. Shared by the API (before the top-50 cut) and the page. */
export const CONTRACT_SORTS = [
  "profit",
  "roi",
  "odds",
  "perDay",
  "best",
  "double",
] as const;
export type ContractSort = (typeof CONTRACT_SORTS)[number];

export const SORT_LABELS: Record<ContractSort, string> = {
  profit: "Expected profit",
  roi: "Return (ROI)",
  odds: "Chance to profit",
  perDay: "Profit per day",
  best: "Best case",
  double: "Chance to double",
};

export const isContractSort = (v: unknown): v is ContractSort =>
  typeof v === "string" && (CONTRACT_SORTS as readonly string[]).includes(v);

export type Rankable = {
  result: {
    profitCents: number;
    roiPercent: number;
    oddsToProfit: number;
    spread: { bestCents: number; chanceDouble: number };
  };
  timeline: { totalDays: number };
};

/** Expected profit for each day the money is tied up (trade hold plus time to sell). */
export const profitPerDay = (c: Rankable) =>
  c.result.profitCents / Math.max(1, c.timeline.totalDays);

export function sortValue(c: Rankable, key: ContractSort): number {
  switch (key) {
    case "profit":
      return c.result.profitCents;
    case "roi":
      return c.result.roiPercent;
    case "odds":
      return c.result.oddsToProfit;
    case "perDay":
      return profitPerDay(c);
    case "best":
      return c.result.spread.bestCents;
    case "double":
      return c.result.spread.chanceDouble;
  }
}

/**
 * Contracts best first. Every sort except expected profit keeps only contracts that make
 * money on average: otherwise "best case" and "chance to double" would rank lottery
 * tickets that lose money over many tries, and "chance to profit" would rank contracts
 * that win small often but lose big. Ties go to the higher expected profit.
 */
export function rankContracts<T extends Rankable>(
  list: readonly T[],
  key: ContractSort,
): T[] {
  return list
    .filter((c) => key === "profit" || c.result.profitCents > 0)
    .sort(
      (a, b) =>
        sortValue(b, key) - sortValue(a, key) ||
        b.result.profitCents - a.result.profitCents,
    );
}
