import { getDb } from "@/lib/db";
import { findDeals } from "@/lib/deals";
import { isMarketplaceId, MARKETPLACES } from "@/lib/fees";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const market = p.get("market") ?? "skinport";
  if (!isMarketplaceId(market))
    return Response.json({ error: "Pick where you'll sell." }, { status: 400 });
  const num = (k: string) =>
    Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined;
  const max = num("max");
  const min = num("min");
  return Response.json({
    deals: findDeals(getDb(), {
      market: MARKETPLACES[market],
      minDiscount: (num("minDiscount") ?? 10) / 100,
      minVolume30d: num("minVolume") ?? 10,
      maxBuyCents: max ? Math.round(max * 100) : undefined,
      minBuyCents: min ? Math.round(min * 100) : undefined,
      q: p.get("q")?.slice(0, 100) || undefined,
      weaponsOnly: p.get("weapons") !== "0",
      dipsOnly: p.get("dips") === "1",
    }),
  });
}
