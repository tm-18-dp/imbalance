import { getDb } from "@/lib/db";
import { getKey } from "@/lib/keys";
import {
  fetchFloatListings,
  savedListings,
  saveListings,
} from "@/lib/prices/csfloat";
import { snipeCandidates } from "@/lib/snipe-data";
import { DEFAULT_MAX_OVER, findSnipes, type Snipe } from "@/lib/snipes";

/** Pause between CSFloat calls for items not already saved, to stay well inside its limits. */
const GAP_MS = 400;
const MAX_ITEMS = 20;

/**
 * Float snipes: for the most traded skins (or ones matching a search), CSFloat listings
 * with a special float priced close to an ordinary one. Needs a CSFloat key. Each item not
 * checked in the last 10 minutes costs two CSFloat requests, so the item count is capped.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const key = getKey("CSFLOAT_API_KEY");
  if (!key)
    return Response.json(
      {
        error:
          "Add a free CSFloat key (API keys, top right) to find float snipes.",
        needsKey: true,
      },
      { status: 400 },
    );
  const num = (k: string) =>
    Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined;
  const max = num("max");
  const min = num("min");
  const limit = Math.min(MAX_ITEMS, Math.round(num("items") ?? 10));
  const maxOver = (num("maxOver") ?? DEFAULT_MAX_OVER * 100) / 100;

  const db = getDb();
  const candidates = snipeCandidates(db, {
    q: p.get("q")?.slice(0, 100) || undefined,
    maxCents: max ? Math.round(max * 100) : undefined,
    minCents: min ? Math.round(min * 100) : 100,
    limit,
  });

  const snipes: (Snipe & { volume30d: number })[] = [];
  let checked = 0;
  let stopped: string | undefined;
  for (const c of candidates) {
    const saved = savedListings(db, c.marketHashName);
    let listings = saved.listings;
    if (!saved.fresh) {
      if (checked > 0) await new Promise((r) => setTimeout(r, GAP_MS));
      try {
        listings = await fetchFloatListings(key, c.marketHashName);
        saveListings(db, c.marketHashName, listings);
      } catch (err) {
        // Most likely a rate limit or a key problem: keep what was found so far.
        stopped =
          err instanceof Error ? err.message : "CSFloat stopped answering.";
        break;
      }
    }
    checked++;
    const withFloats = listings.flatMap((l) =>
      l.float == null ? [] : [{ ...l, float: l.float }],
    );
    for (const s of findSnipes(withFloats, c, c.normalCents, maxOver))
      snipes.push({ ...s, volume30d: c.volume30d });
  }

  snipes.sort(
    (a, b) =>
      Number(b.rare) - Number(a.rare) || a.overReference - b.overReference,
  );
  return Response.json({
    snipes: snipes.slice(0, 100),
    checked,
    candidates: candidates.length,
    stopped,
  });
}
