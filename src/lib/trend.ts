import type { DatabaseSync } from "node:sqlite";

export type TrendInput = {
  nowCents: number | null;
  median24h: number | null;
  median7d: number | null;
  median30d: number | null;
  median90d: number | null;
};

export type TrendSignal =
  "dip" | "rebounding" | "falling" | "rising" | "stable" | "unknown";

export const TREND_LABELS: Record<TrendSignal, string> = {
  dip: "Dip: cheaper than usual while the long-term price holds, often recovers",
  rebounding: "Bouncing back after a drop",
  falling: "Falling for weeks: not a dip, may keep dropping",
  rising: "Rising",
  stable: "Stable",
  unknown: "Not enough sales history",
};

const below = (a: number, b: number, pct: number) => a < b * (1 - pct);
const above = (a: number, b: number, pct: number) => a > b * (1 + pct);

/**
 * Reads the shape of the price: a dip is a short drop against a steady long-term price
 * (the market tends to correct it), unlike a slide that's been going on for weeks.
 */
export function classifyTrend(t: TrendInput): TrendSignal {
  const { median24h: d1, median7d: d7, median30d: d30, median90d: d90 } = t;
  if (d7 == null || d30 == null) return "unknown";
  const recent = t.nowCents ?? d7;
  const longTermSteady = d90 == null || Math.abs(d30 - d90) <= d90 * 0.1;

  if (d90 != null && below(d7, d90, 0.15) && below(d30, d90, 0.05))
    return "falling";
  if (below(d7, d30, 0.1) && d1 != null && above(d1, d7, 0.05))
    return "rebounding";
  if (below(recent, d30, 0.1) && longTermSteady) return "dip";
  if (above(d7, d30, 0.1)) return "rising";
  return "stable";
}

export type HistoryPoint = { at: number; cents: number };

/** Our own saved snapshots for one item, oldest first. */
export function snapshotSeries(
  db: DatabaseSync,
  marketHashName: string,
  version = "",
): HistoryPoint[] {
  return (
    db
      .prepare(
        `SELECT taken_at AS at, min_cents AS cents FROM price_snapshots
         WHERE source = 'skinport' AND market_hash_name = ? AND version = ? AND min_cents IS NOT NULL
         ORDER BY taken_at`,
      )
      .all(marketHashName, version) as HistoryPoint[]
  ).map((p) => ({ at: Number(p.at), cents: Number(p.cents) }));
}

const DAY = 86_400_000;

/**
 * Thins old snapshots so the database stays small: everything from the last 7 days, one a day
 * up to 90 days, one a week after that.
 */
export function pruneSnapshots(db: DatabaseSync, now = Date.now()): number {
  const thin = (olderThan: number, newerThan: number, bucket: number) =>
    Number(
      db
        .prepare(
          `DELETE FROM price_snapshots WHERE taken_at < ? AND taken_at >= ? AND rowid NOT IN (
             SELECT MIN(rowid) FROM price_snapshots WHERE taken_at < ? AND taken_at >= ?
             GROUP BY market_hash_name, source, version, CAST(taken_at / ? AS INTEGER))`,
        )
        .run(olderThan, newerThan, olderThan, newerThan, bucket).changes,
    );
  return (
    thin(now - 7 * DAY, now - 90 * DAY, DAY) + thin(now - 90 * DAY, 0, 7 * DAY)
  );
}

/** Below this many sales in 30 days the medians are too noisy to read a slide from. */
export const TREND_MIN_SALES_30D = 5;
/** The most a falling trend lowers a sell price. */
export const MAX_TREND_CUT = 0.25;

/**
 * How much to lower the sell price of an item that is falling. A trade-up's result is
 * trade locked for a week and then has to sell, so assume the slide keeps going about as
 * far again: the drop from the 30-day to the 7-day median, capped at `MAX_TREND_CUT`. Only
 * falling items are lowered; nothing is raised for rising ones, since rises are less
 * reliable and a high price is the risky mistake.
 */
export function trendCut(
  signal: TrendSignal,
  t: Pick<TrendInput, "median7d" | "median30d">,
  volume30d: number,
): number {
  if (signal !== "falling" || volume30d < TREND_MIN_SALES_30D) return 0;
  if (t.median7d == null || t.median30d == null || t.median30d <= 0) return 0;
  return Math.min(MAX_TREND_CUT, Math.max(0, 1 - t.median7d / t.median30d));
}
