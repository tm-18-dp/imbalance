import type { DatabaseSync } from "node:sqlite";
import { baseSkinName } from "./deals";
import type { Expectation } from "./expectation";
import { MARKETPLACES, type MarketplaceId } from "./fees";
import type { Holding } from "./tracker";
import {
  evaluateContract,
  isTier,
  type ContractInput,
  type Tier,
} from "./tradeup";
import { loadTierData } from "./tradeup-data";
import { marketHashName, WEARS, type WearName } from "./wear";

const WEAR_RE =
  /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

type SkinRow = {
  id: string;
  rarity_name: string;
  min_float: number | null;
  max_float: number | null;
  collection_id: string | null;
};

/**
 * What the app expects from a trade-up made of these held items, at today's prices, after
 * the fee of `market`. Logged floats are used; a missing one counts as the worst float of
 * its wear, like the Trade-ups page assumes. Null with a reason when the items can't make
 * a contract the app knows (unknown skins, mixed rarities, StatTrak mixed with normal).
 */
export function expectTradeUp(
  db: DatabaseSync,
  inputs: readonly Pick<Holding, "marketHashName" | "float" | "costCents">[],
  market: MarketplaceId,
): { expectation: Expectation } | { reason: string } {
  const skin = db.prepare(
    `SELECT s.id, s.rarity_name, s.min_float, s.max_float, MIN(sc.collection_id) collection_id
     FROM skins s LEFT JOIN skin_collections sc ON sc.skin_id = s.id
     WHERE s.name = ? GROUP BY s.id`,
  );
  const stattrak = new Set(
    inputs.map((i) => i.marketHashName.includes("StatTrak™")),
  );
  if (stattrak.size > 1)
    return {
      reason: "StatTrak and normal skins can't be mixed in one trade-up.",
    };
  const variant = stattrak.has(true) ? "stattrak" : "normal";

  const tiers = new Set<string>();
  let floatsEstimated = false;
  const contract: ContractInput[] = [];
  for (const i of inputs) {
    const row = skin.get(baseSkinName(i.marketHashName)) as SkinRow | undefined;
    if (
      !row ||
      row.min_float == null ||
      row.max_float == null ||
      !row.collection_id
    )
      return { reason: `${i.marketHashName} isn't in the skin list.` };
    tiers.add(row.rarity_name);
    let float = i.float ?? null;
    if (float == null) {
      const wear = WEAR_RE.exec(i.marketHashName)?.[1] as WearName | undefined;
      const w = WEARS.findIndex((x) => x.name === wear);
      if (w < 0) return { reason: `${i.marketHashName} has no wear or float.` };
      float = Math.max(
        row.min_float,
        Math.min(row.max_float, WEARS[w].max - 1e-6),
      );
      floatsEstimated = true;
    }
    contract.push({
      collectionId: row.collection_id,
      float: Math.min(row.max_float, Math.max(row.min_float, float)),
      minFloat: row.min_float,
      maxFloat: row.max_float,
      costCents: i.costCents,
    });
  }
  const tier = [...tiers][0];
  if (tiers.size !== 1 || !isTier(tier))
    return { reason: "The skins aren't all the same rarity." };

  try {
    const data = loadTierData(
      db,
      tier as Tier,
      variant,
      false,
      market === "steam",
    );
    const r = evaluateContract(
      tier as Tier,
      contract,
      data.outcomes,
      data.price,
      MARKETPLACES[market],
    );
    return {
      expectation: {
        v: 1,
        market,
        costCents: r.costCents,
        evCents: r.evCents,
        sdCents: r.spread.stdDevCents,
        floatsEstimated,
        missingPrices: r.missingPrices,
        outcomes: r.outcomes.map((o) => ({
          name: marketHashName(o.skin.name, o.wear, variant),
          probability: o.probability,
          netCents: o.netCents,
        })),
      },
    };
  } catch (err) {
    return {
      reason: err instanceof Error ? err.message : "Couldn't work it out.",
    };
  }
}
