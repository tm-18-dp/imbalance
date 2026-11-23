import { getDb } from "@/lib/db";
import {
  searchSkins,
  skinFacets,
  SKIN_SORTS,
  type SkinSort,
} from "@/lib/queries";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const db = getDb();
  if (p.get("facets") === "1") return Response.json(skinFacets(db));
  const page = Number(p.get("page") ?? 1);
  const str = (k: string) => p.get(k)?.slice(0, 100) || undefined;
  // Amounts arrive in USD from the page, which converts from the shown currency.
  const cents = (k: string) =>
    Number(p.get(k)) > 0 ? Math.round(Number(p.get(k)) * 100) : undefined;
  const sort = p.get("sort");
  return Response.json(
    searchSkins(db, {
      q: str("q"),
      rarity: str("rarity"),
      category: str("category"),
      weapon: str("weapon"),
      collection: str("collection"),
      minCents: cents("min"),
      maxCents: cents("max"),
      stattrak: p.get("stattrak") === "1",
      sort: SKIN_SORTS.includes(sort as SkinSort) ? (sort as SkinSort) : "name",
      page: Number.isInteger(page) && page > 0 ? page : 1,
    }),
  );
}
