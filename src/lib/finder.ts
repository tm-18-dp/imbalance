import type { Marketplace } from "./fees";
import {
  ContractError,
  evaluateContract,
  inputCount,
  type ContractResult,
  type OutcomeSkin,
  type PriceFn,
  type Tier,
} from "./tradeup";
import type { WearName } from "./wear";

/** One way to buy an input: a skin at a wear, priced, with the worst float that wear allows. */
export type InputOption = {
  skinId: string;
  skinName: string;
  image: string | null;
  collectionId: string;
  wear: WearName;
  marketHashName: string;
  /** Worst-case float when buying "any" listing at this wear. */
  float: number;
  minFloat: number;
  maxFloat: number;
  /** Price of the cheapest listing. */
  costCents: number;
  /**
   * Expected price of each further copy. Only the cheapest listing sells at `costCents`; the
   * rest usually cost about the recent sales price. Missing means every copy costs `costCents`.
   */
  nextCostCents?: number;
  quantity: number;
  /**
   * True for skins the user already owns (from the tracker). Their cost is today's market
   * price: using them gives up selling them. Float is the worst one they own.
   */
  owned?: boolean;
};

/** What `count` copies of an option really cost: the cheapest listing, then the going price. */
export function optionCost(option: InputOption, count: number): number {
  if (count <= 0) return 0;
  return (
    option.costCents + (count - 1) * (option.nextCostCents ?? option.costCents)
  );
}

/** Per-copy costs for `count` copies, cheapest first. */
function copyCosts(option: InputOption, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? option.costCents : (option.nextCostCents ?? option.costCents),
  );
}

export type FoundContract = {
  key: string;
  inputs: { option: InputOption; count: number }[];
  result: ContractResult;
};

export type FinderOptions = {
  tier: Tier;
  market: Marketplace;
  budgetCents?: number;
  /** How many of the cheapest options to try as fillers. */
  fillerPool?: number;
  limit?: number;
};

/**
 * Tries k target inputs (1..N) with N-k filler inputs for every target option and the
 * cheapest filler options. Fillers can be any collection with outcomes, and low-float
 * fillers pull the average float down. Avoids testing every combination of every skin.
 */
export function findContracts(
  options: readonly InputOption[],
  outcomesByCollection: ReadonlyMap<string, readonly OutcomeSkin[]>,
  price: PriceFn,
  opts: FinderOptions,
): FoundContract[] {
  const n = inputCount(opts.tier);
  const usable = options.filter(
    (o) => outcomesByCollection.get(o.collectionId)?.length,
  );
  // Cheapest market options, plus everything the user owns (always worth trying).
  const fillers = [
    ...[...usable]
      .filter((o) => !o.owned)
      .sort((a, b) => optionCost(a, 2) - optionCost(b, 2))
      .slice(0, opts.fillerPool ?? 30),
    ...usable.filter((o) => o.owned),
  ];
  const found = new Map<string, FoundContract>();

  const tryMix = (
    target: InputOption,
    k: number,
    filler: InputOption | null,
  ) => {
    const parts =
      filler && k < n
        ? [
            { option: target, count: k },
            { option: filler, count: n - k },
          ]
        : [{ option: target, count: n }];
    // Can't use 10 of something with only 3 listed (or 3 owned).
    if (parts.some((p) => p.count > p.option.quantity)) return;
    const cost = parts.reduce((s, p) => s + optionCost(p.option, p.count), 0);
    if (opts.budgetCents != null && cost > opts.budgetCents) return;
    const key = parts
      .map(
        (p) =>
          `${p.count}x${p.option.owned ? "owned:" : ""}${p.option.marketHashName}`,
      )
      .sort()
      .join("+");
    if (found.has(key)) return;
    const inputs = parts.flatMap((p) =>
      copyCosts(p.option, p.count).map((costCents) => ({
        ...p.option,
        costCents,
      })),
    );
    try {
      const result = evaluateContract(
        opts.tier,
        inputs,
        outcomesByCollection,
        price,
        opts.market,
      );
      found.set(key, { key, inputs: parts, result });
    } catch (err) {
      if (!(err instanceof ContractError)) throw err;
    }
  };

  for (const target of usable) {
    tryMix(target, n, null);
    for (const filler of fillers) {
      if (filler === target) continue;
      for (let k = 1; k < n; k++) tryMix(target, k, filler);
    }
  }

  return [...found.values()]
    .sort((a, b) => b.result.profitCents - a.result.profitCents)
    .slice(0, opts.limit ?? 100);
}
