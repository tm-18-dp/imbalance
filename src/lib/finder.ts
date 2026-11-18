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
  /**
   * Swap search: how many of the best simple mixes to improve by swapping one input at a
   * time (0 turns it off), and the time (Date.now() ms) to stop by.
   */
  improveSeeds?: number;
  deadline?: number;
  /**
   * Only contracts this accepts are kept, used as swap starting points, or swapped to
   * (for example "within my risk level"). Without it every contract counts.
   */
  accept?: (result: ContractResult) => boolean;
};

/** Most swaps tried on one contract before moving on. */
const MAX_SWAP_STEPS = 20;

/**
 * Tries k target inputs (1..N) with N-k filler inputs for every target option and the
 * cheapest filler options. Fillers can be any collection with outcomes, and low-float
 * fillers pull the average float down. Avoids testing every combination of every skin.
 * Then a swap search improves the best of those: swap one input copy for another skin
 * while profit rises, which finds three- and four-skin mixes the simple search can't.
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
  /** Every mix tried, including ones that didn't work, so none is evaluated twice. */
  const tried = new Set<string>();

  /** Evaluates one mix of inputs; null when it isn't possible or affordable. */
  const evaluateParts = (
    parts: { option: InputOption; count: number }[],
  ): FoundContract | null => {
    // Can't use 10 of something with only 3 listed (or 3 owned).
    if (parts.some((p) => p.count > p.option.quantity)) return null;
    const cost = parts.reduce((s, p) => s + optionCost(p.option, p.count), 0);
    if (opts.budgetCents != null && cost > opts.budgetCents) return null;
    const key = parts
      .map((p) => `${p.count}x${optionId(p.option)}`)
      .sort()
      .join("+");
    if (tried.has(key)) return found.get(key) ?? null;
    tried.add(key);
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
      const contract = { key, inputs: parts, result };
      found.set(key, contract);
      return contract;
    } catch (err) {
      if (!(err instanceof ContractError)) throw err;
      return null;
    }
  };

  const tryMix = (target: InputOption, k: number, filler: InputOption | null) =>
    evaluateParts(
      filler && k < n
        ? [
            { option: target, count: k },
            { option: filler, count: n - k },
          ]
        : [{ option: target, count: n }],
    );

  for (const target of usable) {
    tryMix(target, n, null);
    for (const filler of fillers) {
      if (filler === target) continue;
      for (let k = 1; k < n; k++) tryMix(target, k, filler);
    }
  }

  const timeLeft = () => opts.deadline == null || Date.now() < opts.deadline;
  const verdict = new Map<string, boolean>();
  const ok = (c: FoundContract) => {
    if (!opts.accept) return true;
    let v = verdict.get(c.key);
    if (v == null) verdict.set(c.key, (v = opts.accept(c.result)));
    return v;
  };
  const best = (count: number) =>
    [...found.values()]
      .sort((a, b) => b.result.profitCents - a.result.profitCents)
      .filter(ok)
      .slice(0, count);
  const seedCount = opts.improveSeeds ?? 40;

  // Three-skin mixes: for the best target-plus-filler mixes, every split of the target,
  // that filler and a second filler. A single swap can't reach these when both counts
  // have to change at once (for example to just reach a better wear more cheaply).
  const pairs = new Map<string, [InputOption, InputOption]>();
  for (const c of best(seedCount))
    if (c.inputs.length === 2)
      for (const [a, b] of [
        [c.inputs[0].option, c.inputs[1].option],
        [c.inputs[1].option, c.inputs[0].option],
      ])
        pairs.set(`${optionId(a)}|${optionId(b)}`, [a, b]);
  threeWay: for (const [target, filler] of pairs.values())
    for (const second of fillers) {
      if (second === target || second === filler) continue;
      for (let k = 1; k <= n - 2; k++)
        for (let m = 1; m <= n - k - 1; m++) {
          if (!timeLeft()) break threeWay;
          evaluateParts([
            { option: target, count: k },
            { option: filler, count: m },
            { option: second, count: n - k - m },
          ]);
        }
    }

  // Swap search from the best mixes so far. Candidate skins: everything in the best
  // mixes plus the cheap fillers and owned skins.
  const seeds = best(seedCount);
  const pool = [
    ...new Map(
      [...seeds.flatMap((c) => c.inputs.map((i) => i.option)), ...fillers].map(
        (o) => [optionId(o), o],
      ),
    ).values(),
  ];
  for (const seed of seeds) {
    if (!timeLeft()) break;
    let current = seed;
    for (let step = 0; step < MAX_SWAP_STEPS && timeLeft(); step++) {
      const better = bestSwap(current, pool, evaluateParts, timeLeft, ok);
      if (!better) break;
      current = better;
    }
  }

  return best(opts.limit ?? 100);
}

/** Identity of an option for mixing: owned copies are kept apart from market ones. */
const optionId = (o: InputOption) =>
  `${o.owned ? "owned:" : ""}${o.marketHashName}`;

/**
 * The first swap of one input copy (from a skin in the contract to any skin in the pool)
 * that raises expected profit, or null when none does.
 */
function bestSwap(
  contract: FoundContract,
  pool: readonly InputOption[],
  evaluateParts: (
    parts: { option: InputOption; count: number }[],
  ) => FoundContract | null,
  timeLeft: () => boolean,
  ok: (c: FoundContract) => boolean,
): FoundContract | null {
  for (const from of contract.inputs) {
    for (const to of pool) {
      if (!timeLeft()) return null;
      const toId = optionId(to);
      if (toId === optionId(from.option)) continue;
      const counts = new Map<string, { option: InputOption; count: number }>();
      for (const p of contract.inputs)
        counts.set(optionId(p.option), { option: p.option, count: p.count });
      const src = counts.get(optionId(from.option))!;
      src.count--;
      if (src.count === 0) counts.delete(optionId(from.option));
      const dst = counts.get(toId);
      if (dst) dst.count++;
      else counts.set(toId, { option: to, count: 1 });
      const next = evaluateParts([...counts.values()]);
      if (
        next &&
        next.result.profitCents > contract.result.profitCents &&
        ok(next)
      )
        return next;
    }
  }
  return null;
}
