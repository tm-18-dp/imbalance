import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { transaction } from "../db";
import { fetchJson } from "../http";
import type { DailyPoint } from "../recovery";

// Public, no key needed (checked 2026-11-19): one row per day back to 2020, newest first.
// avg_price is in cents. Doppler phases share one series (CSFloat groups by market name).
const URL = "https://csfloat.com/api/v1/history/";
const SOURCE = "csfloat";
export const HISTORY_FRESH_MS = 12 * 60 * 60_000;

export const graphSchema = z.array(
  z.object({
    count: z.number().int().nonnegative(),
    day: z.string().datetime({ offset: true }),
    avg_price: z.number().nonnegative(),
  }),
);

export function savedDaily(db: DatabaseSync, name: string): DailyPoint[] {
  return (
    db
      .prepare(
        "SELECT day, avg_cents cents, sales FROM daily_history WHERE market_hash_name = ? AND source = ? ORDER BY day",
      )
      .all(name, SOURCE) as DailyPoint[]
  ).map((p) => ({ day: p.day, cents: p.cents, sales: p.sales }));
}

/**
 * Daily sales history for one item. Reuses the saved copy for 12 hours; if CSFloat can't be
 * reached, returns the saved copy with the error so the chart still shows something.
 */
export async function dailyHistory(
  db: DatabaseSync,
  name: string,
  apiKey?: string,
  now = Date.now(),
): Promise<{ points: DailyPoint[]; fetchedAt: number | null; error?: string }> {
  const fetched = db
    .prepare(
      "SELECT fetched_at FROM daily_history_fetch WHERE market_hash_name = ? AND source = ?",
    )
    .get(name, SOURCE) as { fetched_at: number } | undefined;
  if (fetched && now - fetched.fetched_at < HISTORY_FRESH_MS)
    return { points: savedDaily(db, name), fetchedAt: fetched.fetched_at };
  try {
    const rows = await fetchJson(
      `${URL}${encodeURIComponent(name)}/graph`,
      graphSchema,
      apiKey ? { headers: { Authorization: apiKey } } : {},
      20_000,
    );
    transaction(db, () => {
      db.prepare(
        "DELETE FROM daily_history WHERE market_hash_name = ? AND source = ?",
      ).run(name, SOURCE);
      const ins = db.prepare(
        "INSERT OR REPLACE INTO daily_history (market_hash_name, source, day, avg_cents, sales) VALUES (?, ?, ?, ?, ?)",
      );
      for (const r of rows)
        ins.run(
          name,
          SOURCE,
          Date.parse(r.day),
          Math.round(r.avg_price),
          r.count,
        );
      db.prepare(
        "INSERT OR REPLACE INTO daily_history_fetch (market_hash_name, source, fetched_at) VALUES (?, ?, ?)",
      ).run(name, SOURCE, now);
    });
    return { points: savedDaily(db, name), fetchedAt: now };
  } catch (err) {
    return {
      points: savedDaily(db, name),
      fetchedAt: fetched?.fetched_at ?? null,
      error: err instanceof Error ? err.message : "CSFloat didn't answer.",
    };
  }
}
