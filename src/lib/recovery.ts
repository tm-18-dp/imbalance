/** One day of sales: average sale price and how many sold. */
export type DailyPoint = { day: number; cents: number; sales: number };

export type Recovery =
  | { status: "no-data"; reason: string }
  | { status: "not-below"; usualCents: number; dropPct: number }
  | {
      status: "estimate";
      usualCents: number;
      /** How far today's price sits under the usual price, 0..1. */
      dropPct: number;
      /** Past drops at least this deep that we could follow for 90 days. */
      episodes: number;
      /** Share of those that got back to the usual price within 7, 30 and 90 days. */
      within: { d7: number; d30: number; d90: number };
      /** Median days to get back, over the ones that did. Null when none did. */
      medianDays: number | null;
      /** Three in four of the ones that came back did so within this many days. */
      p75Days: number | null;
    };

const DAY = 86_400_000;
const WINDOW = 30;
const HORIZON_DAYS = 90;
/** Back within 2% of the old usual price counts as recovered. */
const BACK = 0.98;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

/** 3-day rolling median: one odd sale (a rare pattern, a misclick) can't fake a dip. */
export function smooth(points: readonly DailyPoint[]): number[] {
  return points.map((_, i) =>
    median(points.slice(Math.max(0, i - 1), i + 2).map((p) => p.cents)),
  );
}

/**
 * How often this item's price came back after past drops as deep as today's, and how fast.
 * Code only: it counts what happened before, it does not predict. Few episodes = weak signal.
 */
export function recoveryOdds(
  points: readonly DailyPoint[],
  nowCents: number | null,
  /** Drop measured on another market (Skinport now vs its own usual), used instead. */
  dropOverride?: number,
): Recovery {
  if (points.length < WINDOW + 20)
    return { status: "no-data", reason: "Not enough sales history yet." };
  if (nowCents == null || nowCents <= 0)
    return { status: "no-data", reason: "No current price." };
  const s = smooth(points);
  const usualCents = Math.round(median(s.slice(-WINDOW)));
  const dropPct = dropOverride ?? 1 - nowCents / usualCents;
  if (dropPct < 0.03) return { status: "not-below", usualCents, dropPct };

  const depth = Math.max(0.03, dropPct * 0.7);
  const last = points[points.length - 1].day;
  const days: (number | null)[] = [];
  for (let i = WINDOW; i < points.length; i++) {
    const usual = median(s.slice(i - WINDOW, i));
    if (s[i] > usual * (1 - depth)) continue;
    // Skip drops we can't follow for the whole horizon yet: they'd look like failures.
    if (last - points[i].day < HORIZON_DAYS * DAY) break;
    let back: number | null = null;
    let j = i + 1;
    for (; j < points.length; j++) {
      const d = (points[j].day - points[i].day) / DAY;
      if (d > HORIZON_DAYS) break;
      if (s[j] >= usual * BACK) {
        back = d;
        break;
      }
    }
    days.push(back);
    // Jump past this episode so one long dip isn't counted many times.
    i = j;
  }

  if (days.length === 0)
    return {
      status: "no-data",
      reason:
        "It never dropped this far before, so there is nothing to compare.",
    };
  const ok = days.filter((d): d is number => d != null);
  const share = (n: number) => ok.filter((d) => d <= n).length / days.length;
  return {
    status: "estimate",
    usualCents,
    dropPct,
    episodes: days.length,
    within: { d7: share(7), d30: share(30), d90: share(90) },
    medianDays: ok.length ? Math.round(median(ok)) : null,
    p75Days: ok.length ? Math.round(quantile(ok, 0.75)) : null,
  };
}
