import { getDb } from "@/lib/db";
import { getKey } from "@/lib/keys";
import { gapCandidates, missingSteam, savedQuotes } from "@/lib/gap-data";
import { findGaps } from "@/lib/gaps";

const MAX_ITEMS = 30;

/**
 * Cross-market gaps for the most traded items (or a search), from saved prices only. The
 * page looks up Steam prices for `missingSteam` first (Steam allows about 20 a minute),
 * then asks again. CSFloat joins when its listings were saved recently.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const num = (k: string) =>
    Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined;
  const min = num("min");
  const max = num("max");
  const db = getDb();
  const candidates = gapCandidates(db, {
    q: p.get("q")?.slice(0, 100) || undefined,
    minCents: min ? Math.round(min * 100) : 100,
    maxCents: max ? Math.round(max * 100) : undefined,
    limit: Math.min(MAX_ITEMS, Math.round(num("items") ?? 10)),
  });
  const names = candidates.map((c) => c.marketHashName);
  const quotes = savedQuotes(db, names);
  const opts = {
    includeSteamSell: p.get("steamSell") === "1",
    walletValue: (num("walletValue") ?? 100) / 100,
  };
  const items = candidates.map((c) => ({
    ...c,
    quotes: quotes.get(c.marketHashName) ?? [],
    gaps: findGaps(quotes.get(c.marketHashName) ?? [], opts),
  }));
  return Response.json({
    items,
    missingSteam: missingSteam(db, names),
    csfloatKey: Boolean(getKey("CSFLOAT_API_KEY")),
  });
}
