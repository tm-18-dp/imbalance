import { z } from "zod";
import { getDb } from "@/lib/db";
import { getKey } from "@/lib/keys";
import { isMarketplaceId, MARKETPLACES } from "@/lib/fees";
import { isTier } from "@/lib/tradeup";
import { loadTierData } from "@/lib/tradeup-data";
import {
  planExactFloats,
  type FloatListing,
  type InputGroup,
} from "@/lib/exact-float";
import {
  fetchFloatListings,
  savedListings,
  saveListings,
} from "@/lib/prices/csfloat";
import { marketHashName, WEARS, type WearName } from "@/lib/wear";
import { errorResponse } from "../../errors";

const inputsSchema = z
  .array(
    z.object({
      skinId: z.string().min(1).max(100),
      wear: z.enum(WEARS.map((w) => w.name) as [WearName, ...WearName[]]),
      count: z.number().int().min(1).max(10),
    }),
  )
  .min(1)
  .max(10);

/**
 * Exact-float plans for one contract: real CSFloat listings (cheapest and lowest-float, in
 * the input's wear and the next better one) picked so the average float lands under each
 * better-wear threshold, priced with their real floats. Needs a CSFloat key.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const tier = p.get("tier");
  const market = p.get("market") ?? "skinport";
  const variant = p.get("stattrak") === "1" ? "stattrak" : "normal";
  if (!isTier(tier) || !isMarketplaceId(market))
    return Response.json({ error: "Scan a contract first." }, { status: 400 });
  let inputs: z.infer<typeof inputsSchema>;
  try {
    inputs = inputsSchema.parse(JSON.parse(p.get("inputs") ?? ""));
  } catch {
    return Response.json({ error: "Scan a contract first." }, { status: 400 });
  }
  const key = getKey("CSFLOAT_API_KEY");
  if (!key)
    return Response.json(
      {
        error:
          "Add a free CSFloat key (API keys, top right) to pick exact floats.",
        needsKey: true,
      },
      { status: 400 },
    );

  const db = getDb();
  const data = loadTierData(db, tier, variant, false, market === "steam");

  /** Listings for one market name, reusing ones saved in the last 10 minutes. */
  async function listingsFor(name: string): Promise<FloatListing[]> {
    const saved = savedListings(db, name);
    const all = saved.fresh
      ? saved.listings
      : await fetchFloatListings(key!, name).then((l) => {
          saveListings(db, name, l);
          return l;
        });
    return all.flatMap((l) =>
      l.float == null
        ? []
        : [
            {
              id: l.id,
              marketHashName: l.marketHashName,
              priceCents: l.priceCents,
              float: l.float,
              url: l.url,
            },
          ],
    );
  }

  try {
    const groups: InputGroup[] = [];
    for (const i of inputs) {
      const option = data.options.find(
        (o) => o.skinId === i.skinId && o.wear === i.wear,
      );
      if (!option)
        return Response.json(
          { error: "Prices changed since the scan. Scan again." },
          { status: 409 },
        );
      // The input's own wear, plus the next better wear if this skin comes in it.
      const w = WEARS.findIndex((x) => x.name === i.wear);
      const names = [option.marketHashName];
      if (w > 0 && WEARS[w - 1].max > option.minFloat)
        names.push(marketHashName(option.skinName, WEARS[w - 1].name, variant));
      const listings: FloatListing[] = [];
      for (const name of names) listings.push(...(await listingsFor(name)));
      groups.push({
        skinName: option.skinName,
        collectionId: option.collectionId,
        count: i.count,
        minFloat: option.minFloat,
        maxFloat: option.maxFloat,
        listings,
      });
    }

    const short = groups.find(
      (g) => new Set(g.listings.map((l) => l.id)).size < g.count,
    );
    if (short)
      return Response.json({
        plans: [],
        note: `CSFloat has fewer than ${short.count} ${short.skinName} listings right now.`,
      });

    const plans = planExactFloats(
      tier,
      groups,
      data.outcomes,
      data.price,
      MARKETPLACES[market],
    )
      .slice(0, 5)
      .map((plan) => ({
        target: plan.target,
        costCents: plan.result.costCents,
        evCents: plan.result.evCents,
        profitCents: plan.result.profitCents,
        roiPercent: plan.result.roiPercent,
        oddsToProfit: plan.result.oddsToProfit,
        avgNormFloat: plan.result.avgNormFloat,
        spread: plan.result.spread,
        buys: plan.picks.map(({ group, listing }) => ({
          skinName: groups[group].skinName,
          ...listing,
        })),
        outcomes: plan.result.outcomes.map((o) => ({
          name: o.skin.name,
          phase: o.skin.phase ?? null,
          wear: o.wear,
          float: o.float,
          probability: o.probability,
          priceCents: o.priceCents,
        })),
      }));
    return Response.json({ plans });
  } catch (err) {
    return errorResponse(err, 502);
  }
}
