import { getDb } from "@/lib/db";
import { getKey } from "@/lib/keys";
import { dailyHistory } from "@/lib/prices/csfloat-history";
import { recoveryOdds } from "@/lib/recovery";
import { classifyTrend, snapshotSeries } from "@/lib/trend";

/**
 * Chart data for one item: CSFloat's daily sales back to 2020, our own Skinport snapshots,
 * Skinport's sales medians, a trend signal, and how often past drops like today's came back.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const name = p.get("name")?.slice(0, 200);
  const version = p.get("version")?.slice(0, 50) ?? "";
  if (!name)
    return Response.json({ error: "Pick an item first." }, { status: 400 });
  const db = getDb();
  // Doppler knives are only listed by phase: asked without one (Skins page, watchlist),
  // use the cheapest listed phase, as those pages show.
  const row = db
    .prepare(
      `SELECT p.version, p.min_cents, h.median_24h, h.median_7d, h.median_30d, h.median_90d,
              h.volume_24h, h.volume_7d, h.volume_30d, h.volume_90d
       FROM prices p LEFT JOIN price_history h
         ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
       WHERE p.source = 'skinport' AND p.market_hash_name = ? AND (p.version = ? OR ? = '')
       ORDER BY p.version = ? DESC, p.min_cents IS NULL, p.min_cents LIMIT 1`,
    )
    .get(name, version, version, version) as
    (Record<string, number | null> & { version: string }) | undefined;
  const pricedVersion = row?.version ?? version;
  const medians = {
    median24h: row?.median_24h ?? null,
    median7d: row?.median_7d ?? null,
    median30d: row?.median_30d ?? null,
    median90d: row?.median_90d ?? null,
  };
  const daily = await dailyHistory(db, name, getKey("CSFLOAT_API_KEY"));
  const nowCents = row?.min_cents ?? null;
  // Skinport's own drop (now vs its 30-day median), checked against CSFloat's long history.
  const drop =
    nowCents != null && medians.median30d
      ? 1 - nowCents / medians.median30d
      : undefined;
  return Response.json({
    daily: daily.points,
    dailyError: daily.error ?? null,
    recovery: recoveryOdds(daily.points, nowCents, drop),
    points: snapshotSeries(db, name, pricedVersion),
    pricedVersion: pricedVersion !== version ? pricedVersion : null,
    nowCents: row?.min_cents ?? null,
    ...medians,
    volumes: {
      d1: row?.volume_24h ?? 0,
      d7: row?.volume_7d ?? 0,
      d30: row?.volume_30d ?? 0,
      d90: row?.volume_90d ?? 0,
    },
    trend: classifyTrend({ nowCents: row?.min_cents ?? null, ...medians }),
  });
}
