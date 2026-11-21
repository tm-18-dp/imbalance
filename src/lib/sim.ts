/**
 * Practice bots ("paper trading"): they follow the app's own picks with pretend money at
 * real prices, so you can see how a strategy would really have done before using money.
 * Pure parts only; the database side is in sim-data.ts.
 */
import { z } from "zod";
import { MARKETPLACE_IDS } from "./fees";
import { RISK_PROFILE_IDS } from "./risk";
import { TIERS } from "./tradeup";

export const SIM_STRATEGIES = ["tradeups", "deals"] as const;
export type SimStrategy = (typeof SIM_STRATEGIES)[number];

/** Bots run at most this often (prices update every 10 minutes). */
export const SIM_RUN_EVERY_MS = 9 * 60_000;
/** Deals bought per run, so one run doesn't spend everything on one price update. */
export const MAX_DEAL_BUYS_PER_RUN = 3;
/** Value history: at most one point per hour. */
export const SNAPSHOT_EVERY_MS = 60 * 60_000;
export const MAX_BOTS = 10;

export const newBotSchema = z.object({
  name: z.string().trim().min(1).max(60),
  strategy: z.enum(SIM_STRATEGIES),
  risk: z.enum(RISK_PROFILE_IDS),
  /** Rarity a trade-up bot puts in. */
  tier: z.enum(TIERS).nullish(),
  market: z.enum(MARKETPLACE_IDS).default("skinport"),
  startCents: z.number().int().min(100).max(1e9),
  /** Most of the bot's value one buy may use, e.g. 0.25. */
  maxBuyShare: z.number().min(0.01).max(1),
});
export type NewBot = z.infer<typeof newBotSchema>;

export type SimBot = {
  id: number;
  name: string;
  strategy: SimStrategy;
  risk: (typeof RISK_PROFILE_IDS)[number];
  tier: string | null;
  market: (typeof MARKETPLACE_IDS)[number];
  startCents: number;
  cashCents: number;
  maxBuyShare: number;
  active: boolean;
  createdAt: number;
  lastRunAt: number | null;
};

/** What the bot bought and why, kept with each position. */
export type PositionDetail =
  | {
      kind: "deal";
      /** What the app expected to get back after the fee. */
      expectedNetCents: number;
      discount: number;
    }
  | {
      kind: "tradeup";
      /** "2x Five-SeveN | Fowl Play + 7x ..." */
      inputs: string;
      /** The contract's expected value after the fee: the average over many tries. */
      evCents: number;
      /** The chance the app gave the result the bot rolled. */
      chance: number;
      /** What that result was worth after the fee when rolled. */
      rolledNetCents: number;
      /** The exact items that went in, for marketplace links. Missing on older buys. */
      inputItems?: { count: number; marketHashName: string }[];
    };

export type SimPosition = {
  id: number;
  botId: number;
  marketHashName: string;
  version: string;
  costCents: number;
  boughtAt: number;
  tradableAt: number;
  /** When it would likely have sold at the usual price: the hold plus the time to sell. */
  sellAfter: number;
  status: "holding" | "sold";
  soldNetCents: number | null;
  soldAt: number | null;
  detail: PositionDetail | null;
};

/**
 * Rolls a trade-up result with the app's odds. `r` is a random number in [0, 1); the
 * chances are summed in order, so an outcome with 15% wins 15% of rolls.
 */
export function pickOutcome<T extends { probability: number }>(
  outcomes: readonly T[],
  r: number,
): T {
  const total = outcomes.reduce((s, o) => s + o.probability, 0);
  let left = r * total;
  for (const o of outcomes) {
    left -= o.probability;
    if (left < 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

export type BotSummary = {
  valueCents: number;
  /** Value now against the starting money. */
  returnPct: number;
  realizedCents: number;
  unrealizedCents: number;
  holding: number;
  sold: number;
  /** Share of sales that made money; null before the first sale. */
  winRate: number | null;
  /** Holdings with no price now, counted at what they cost. */
  unpriced: number;
};

/** Where the bot stands now. `netValue` is a holding's price now after the fee, or null. */
export function botSummary(
  bot: Pick<SimBot, "cashCents" | "startCents">,
  positions: readonly SimPosition[],
  netValue: (p: SimPosition) => number | null,
): BotSummary {
  const held = positions.filter((p) => p.status === "holding");
  const sold = positions.filter((p) => p.status === "sold");
  let unpriced = 0;
  const heldValue = held.reduce((s, p) => {
    const v = netValue(p);
    if (v == null) unpriced++;
    return s + (v ?? p.costCents);
  }, 0);
  const valueCents = bot.cashCents + heldValue;
  return {
    valueCents,
    returnPct:
      bot.startCents > 0
        ? ((valueCents - bot.startCents) * 100) / bot.startCents
        : 0,
    realizedCents: sold.reduce(
      (s, p) => s + (p.soldNetCents ?? 0) - p.costCents,
      0,
    ),
    unrealizedCents: heldValue - held.reduce((s, p) => s + p.costCents, 0),
    holding: held.length,
    sold: sold.length,
    winRate: sold.length
      ? sold.filter((p) => (p.soldNetCents ?? 0) > p.costCents).length /
        sold.length
      : null,
    unpriced,
  };
}
