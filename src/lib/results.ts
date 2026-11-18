import { RISK_PROFILE_IDS, RISK_PROFILES, type RiskProfileId } from "./risk";

/** Where a tracker entry came from, so results can be compared per strategy. */
export const STRATEGIES = [
  "deal",
  "trade-up",
  "float-snipe",
  "cross-market",
  "other",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABELS: Record<Strategy, string> = {
  deal: "Deal (flip)",
  "trade-up": "Trade-up",
  "float-snipe": "Float snipe",
  "cross-market": "Cross-market",
  other: "Other",
};

export const isStrategy = (v: unknown): v is Strategy =>
  typeof v === "string" && (STRATEGIES as readonly string[]).includes(v);

export const UNTAGGED = "untagged";
export type ResultGroup = "strategy" | "risk";

/** Label for a group key: a strategy, a risk level or untagged. */
export function groupLabel(key: string): string {
  if (key === UNTAGGED) return "Untagged";
  if (isStrategy(key)) return STRATEGY_LABELS[key];
  return RISK_PROFILES[key as RiskProfileId]?.label ?? key;
}

export type ResultHolding = {
  status: "holding" | "used" | "sold";
  costCents: number;
  soldNetCents: number | null;
  soldAt: number | null;
  strategy: string | null;
  risk: string | null;
  /** What it would fetch now after the sell fee, null when there's no price. */
  valueCents: number | null;
};

export type ResultRow = {
  key: string;
  /** Items sold, what they cost and the profit after fees. */
  sold: number;
  soldCostCents: number;
  realizedCents: number;
  /** Profit from sales as a share of what the sold items cost. */
  roi: number | null;
  /** Items still held, what they cost and their profit if sold now. */
  held: number;
  investedCents: number;
  unrealizedCents: number;
};

const keyOf = (h: ResultHolding, by: ResultGroup) => h[by] ?? UNTAGGED;

/** Fixed order: the known tags first, untagged last, then anything unexpected. */
function order(by: ResultGroup): string[] {
  return [...(by === "strategy" ? STRATEGIES : RISK_PROFILE_IDS), UNTAGGED];
}
const sortKeys = (keys: Iterable<string>, by: ResultGroup) => {
  const known = order(by);
  const rank = (k: string) =>
    known.includes(k) ? known.indexOf(k) : known.length;
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

/**
 * Real results per strategy or per risk level. Items used up in a trade-up are left out:
 * their cost is carried by the trade-up's result, which is counted when it sells.
 */
export function resultsBy(
  holdings: readonly ResultHolding[],
  by: ResultGroup,
): ResultRow[] {
  const rows = new Map<string, ResultRow>();
  for (const h of holdings) {
    if (h.status === "used") continue;
    const key = keyOf(h, by);
    const r = rows.get(key) ?? {
      key,
      sold: 0,
      soldCostCents: 0,
      realizedCents: 0,
      roi: null,
      held: 0,
      investedCents: 0,
      unrealizedCents: 0,
    };
    if (h.status === "sold") {
      r.sold++;
      r.soldCostCents += h.costCents;
      r.realizedCents += (h.soldNetCents ?? 0) - h.costCents;
    } else {
      r.held++;
      r.investedCents += h.costCents;
      r.unrealizedCents += (h.valueCents ?? h.costCents) - h.costCents;
    }
    rows.set(key, r);
  }
  return sortKeys(rows.keys(), by).map((k) => {
    const r = rows.get(k)!;
    return {
      ...r,
      roi: r.soldCostCents > 0 ? r.realizedCents / r.soldCostCents : null,
    };
  });
}

export type MonthRow = { month: string; byKey: Record<string, number> };

/** Profit from sales per calendar month (UTC), oldest first, split by strategy or risk. */
export function monthlyRealized(
  holdings: readonly ResultHolding[],
  by: ResultGroup,
): { keys: string[]; months: MonthRow[] } {
  const months = new Map<string, Record<string, number>>();
  const keys = new Set<string>();
  for (const h of holdings) {
    if (h.status !== "sold" || h.soldAt == null) continue;
    const month = new Date(h.soldAt).toISOString().slice(0, 7);
    const key = keyOf(h, by);
    keys.add(key);
    const row = months.get(month) ?? {};
    row[key] = (row[key] ?? 0) + (h.soldNetCents ?? 0) - h.costCents;
    months.set(month, row);
  }
  return {
    keys: sortKeys(keys, by),
    months: [...months.keys()]
      .sort()
      .map((month) => ({ month, byKey: months.get(month)! })),
  };
}
