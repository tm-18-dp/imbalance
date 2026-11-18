import { thinness } from "./liquidity";

export const DAY = 86_400_000;

/** The slowest a sale is assumed to take, and what an item that never sold counts as. */
export const MAX_SELL_DAYS = 90;

/**
 * Rough days to sell at the usual price, from how often it sold in 30 days. Listing at the
 * usual price puts you in a queue with other sellers, so allow for 3 sales to go by first.
 * For thin items the queue grows towards a quarter of everything listed: with few buyers,
 * other sellers' copies go first. Not half or all, because many listings are stale asking
 * prices above yours, and a thin item's sell price already leans towards the cheapest
 * listing. Null when it hasn't sold at all: it may not sell at that price.
 */
export function daysToSell(volume30d: number, listed = 0): number | null {
  if (volume30d <= 0) return null;
  const ahead = 3 + thinness(volume30d) * Math.max(0, listed / 4 - 3);
  return Math.min(MAX_SELL_DAYS, Math.max(0.5, (30 / volume30d) * ahead));
}

export type ContractTimeline = {
  /** Days until the output can be traded or sold (trade protection). */
  holdDays: number;
  /** Expected days to sell the output once tradable (unsellable outcomes count as `MAX_SELL_DAYS`). */
  sellDays: number;
  totalDays: number;
};

export function contractTimeline(
  holdDays: number,
  outcomes: readonly {
    probability: number;
    volume30d: number;
    /** Copies listed for sale right now. */
    listed?: number;
  }[],
): ContractTimeline {
  const sellDays = outcomes.reduce(
    (s, o) =>
      s + o.probability * (daysToSell(o.volume30d, o.listed) ?? MAX_SELL_DAYS),
    0,
  );
  return { holdDays, sellDays, totalDays: holdDays + sellDays };
}

export type StepHolding = {
  id: number;
  marketHashName: string;
  tradableAt: number;
  status: string;
  costCents: number;
  valueCents: number | null;
};

export type NextStep = {
  id: number;
  kind: "sell" | "wait" | "hold";
  marketHashName: string;
  at: number;
  gainCents: number | null;
};

const RANK: Record<NextStep["kind"], number> = { sell: 0, hold: 1, wait: 2 };

/**
 * What to do next with each item you hold: sell (tradable and worth more than you paid),
 * hold (tradable but selling now loses money), or wait (still trade-locked). Plus the date to
 * come back: when the next locked item unlocks.
 */
export function nextSteps(
  holdings: readonly StepHolding[],
  now: number,
): { steps: NextStep[]; comeBackAt: number | null } {
  const steps = holdings
    .filter((h) => h.status === "holding")
    .map((h): NextStep => {
      const gainCents =
        h.valueCents == null ? null : h.valueCents - h.costCents;
      if (h.tradableAt > now)
        return {
          id: h.id,
          kind: "wait",
          marketHashName: h.marketHashName,
          at: h.tradableAt,
          gainCents,
        };
      return {
        id: h.id,
        kind: gainCents != null && gainCents > 0 ? "sell" : "hold",
        marketHashName: h.marketHashName,
        at: h.tradableAt,
        gainCents,
      };
    })
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.at - b.at);
  const locked = steps.filter((s) => s.kind === "wait").map((s) => s.at);
  return { steps, comeBackAt: locked.length ? Math.min(...locked) : null };
}
