import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta } from "./db";

/**
 * Saved searches that tell you when they find something new. Each one is a Trade-ups or
 * Deals search (its API query) plus a bar results must clear. The server remembers which
 * results it has already reported, so several open tabs never report the same one twice.
 */
export const ALERT_KINDS = ["tradeups", "deals"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Each alert reruns a search after every price update; keep the work bounded. */
export const MAX_ALERTS = 10;
/** Results remembered per alert, newest kept. */
const MAX_SEEN = 500;

/** Query keys each search accepts; anything else is dropped. */
const QUERY_KEYS: Record<AlertKind, readonly string[]> = {
  tradeups: [
    "tier",
    "market",
    "stattrak",
    "hideRisky",
    "risk",
    "sort",
    "budget",
    "owned",
  ],
  deals: ["market", "minDiscount", "minVolume", "max", "q", "weapons", "dips"],
};

export function cleanQuery(kind: AlertKind, query: string): string {
  const p = new URLSearchParams(query);
  const out = new URLSearchParams();
  for (const k of QUERY_KEYS[kind]) {
    const v = p.get(k);
    if (v != null && v !== "") out.set(k, v.slice(0, 100));
  }
  return out.toString();
}

const lastHit = z.object({
  at: z.number().int(),
  count: z.number().int().min(1),
  /** The best new result, e.g. "3x MP9 | Old Roots + 7x AUG | Condemned". */
  label: z.string().max(300),
  profitCents: z.number().int(),
  roiPercent: z.number(),
});

export const alertSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(ALERT_KINDS),
  name: z.string().trim().min(1).max(80),
  query: z.string().max(1000),
  /** Only results at or above these count. Null means no bar. */
  minRoiPercent: z.number().min(-100).max(100000).nullable(),
  minProfitCents: z.number().int().min(0).max(1e10).nullable(),
  createdAt: z.number().int(),
  /** Keys of results already reported (or there when the alert was made). */
  seen: z.array(z.string().max(400)).max(MAX_SEEN),
  lastHit: lastHit.nullable(),
});
export type Alert = z.infer<typeof alertSchema>;

export const newAlertSchema = alertSchema.pick({
  kind: true,
  name: true,
  query: true,
  minRoiPercent: true,
  minProfitCents: true,
});

export function listAlerts(db: DatabaseSync): Alert[] {
  const raw = getMeta(db, "alerts");
  if (!raw) return [];
  try {
    const parsed = z.array(alertSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveAlerts(db: DatabaseSync, alerts: Alert[]): void {
  setMeta(db, "alerts", JSON.stringify(alerts));
}

/** One search result, as alerts see it. */
export type AlertItem = {
  key: string;
  label: string;
  profitCents: number;
  roiPercent: number;
};

export const passes = (a: Alert, i: AlertItem) =>
  (a.minRoiPercent == null || i.roiPercent >= a.minRoiPercent) &&
  (a.minProfitCents == null || i.profitCents >= a.minProfitCents);

/**
 * Results that clear the alert's bar and haven't been reported before, best first, and the
 * alert with them remembered. A result that drops out and comes back later isn't new.
 */
export function newHits(
  alert: Alert,
  items: readonly AlertItem[],
  now: number,
): { hits: AlertItem[]; alert: Alert } {
  const seen = new Set(alert.seen);
  const hits = items
    .filter((i) => passes(alert, i) && !seen.has(i.key))
    .sort((a, b) => b.profitCents - a.profitCents);
  if (!hits.length) return { hits, alert };
  const remembered = [...alert.seen, ...hits.map((h) => h.key)].slice(
    -MAX_SEEN,
  );
  return {
    hits,
    alert: {
      ...alert,
      seen: remembered,
      lastHit: {
        at: now,
        count: hits.length,
        label: hits[0].label.slice(0, 300),
        profitCents: hits[0].profitCents,
        roiPercent: hits[0].roiPercent,
      },
    },
  };
}

/**
 * The page a result came from, with the same search filled in. The pages read `max` in
 * the currency the user sees, but alerts save US dollars, so the limit goes as `maxUsd`
 * for the page to convert. (Passed as `max`, a $100 limit opened as 100 AED.)
 */
export function alertUrl(a: Pick<Alert, "kind" | "query">): string {
  const p = new URLSearchParams(a.query);
  const usd = p.get(a.kind === "deals" ? "max" : "budget");
  p.delete("max");
  p.delete("budget");
  p.delete("sort");
  p.delete("owned");
  if (usd) p.set("maxUsd", usd);
  return `/${a.kind}?${p}`;
}
