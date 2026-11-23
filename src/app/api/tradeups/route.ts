import { getSettings } from "@/lib/tracker";
import { contractTimeline } from "@/lib/timeline";
import { getDb } from "@/lib/db";
import { isMarketplaceId, MARKETPLACES } from "@/lib/fees";
import { findContracts } from "@/lib/finder";
import { isTier } from "@/lib/tradeup";
import { loadTierData } from "@/lib/tradeup-data";
import { isContractSort, rankContracts } from "@/lib/rank";
import {
  isRiskProfileId,
  RISK_PROFILES,
  riskNotes,
  withinProfile,
} from "@/lib/risk";

/** The search (swap search included) stops by this, leaving time to prepare the answer. */
const SEARCH_BUDGET_MS = 2500;

/** Scans one tier for the most profitable contracts, in about 3 seconds at most. */
export async function GET(req: Request) {
  const started = Date.now();
  const p = new URL(req.url).searchParams;
  const tier = p.get("tier");
  const market = p.get("market") ?? "skinport";
  const variant = p.get("stattrak") === "1" ? "stattrak" : "normal";
  const budget = Number(p.get("budget"));
  // Skip contracts cheaper than this (USD), for looking at bigger ones.
  const minBudget = Number(p.get("minBudget"));
  const minCents = minBudget > 0 ? Math.round(minBudget * 100) : 0;
  if (!isTier(tier))
    return Response.json(
      { error: "Pick a rarity to trade up." },
      { status: 400 },
    );
  if (!isMarketplaceId(market))
    return Response.json({ error: "Pick where you'll sell." }, { status: 400 });

  const hideRisky = p.get("hideRisky") === "1";
  const db = getDb();
  const settings = getSettings(db);
  const { holdDays } = settings;
  const riskParam = p.get("risk");
  const profile =
    RISK_PROFILES[
      isRiskProfileId(riskParam) ? riskParam : settings.riskProfile
    ];
  const data = loadTierData(
    db,
    tier,
    variant,
    p.get("owned") !== "0",
    market === "steam",
  );
  const sortParam = p.get("sort");
  const sort = isContractSort(sortParam) ? sortParam : profile.contractSort;
  const found = findContracts(data.options, data.outcomes, data.price, {
    tier,
    market: MARKETPLACES[market],
    budgetCents: budget > 0 ? Math.round(budget * 100) : undefined,
    limit: 2000,
    // The swap search gets whatever time is left after loading and the simple search.
    deadline: started + SEARCH_BUDGET_MS,
    // Hidden contracts must not crowd out the ones shown: the risk level and the minimum
    // cost are checked inside the search, before it keeps its best 2000. (Filtered after,
    // a minimum of $5 found nothing in Restricted: cheap mixes filled every place.)
    accept:
      hideRisky || minCents
        ? (r) =>
            r.costCents >= minCents &&
            (!hideRisky ||
              withinProfile(
                r.outcomes.map((o) => ({
                  ...o,
                  volume30d: data.volume30d(o.skin, o.wear),
                })),
                r.evCents,
                profile,
              ))
        : undefined,
  })
    .map((c) => {
      const outcomes = c.result.outcomes.map((o) => ({
        ...o,
        volume30d: data.volume30d(o.skin, o.wear),
        listed: data.listed(o.skin, o.wear),
        priceSource: data.priceSource(o.skin, o.wear),
        trend: data.trend(o.skin, o.wear),
        marketHashName: o.skin.phase ? null : data.outcomeName(o.skin, o.wear),
      }));
      // Warnings always use the Safe rules; the profile only decides what is hidden.
      const risky = riskNotes(outcomes, c.result.evCents).length > 0;
      const allowed = withinProfile(outcomes, c.result.evCents, profile);
      const timeline = contractTimeline(holdDays, outcomes);
      return {
        ...c,
        risky,
        allowed,
        timeline,
        result: { ...c.result, outcomes },
      };
    })
    .filter((c) => (!hideRisky || c.allowed) && c.result.costCents >= minCents);
  // Rank every candidate, not just the most profitable 50, so each sort finds its own best.
  const contracts = rankContracts(found, sort).slice(0, 50);
  return Response.json({
    tier,
    variant,
    market,
    risk: profile.id,
    sort,
    options: data.options.length,
    contracts,
  });
}
