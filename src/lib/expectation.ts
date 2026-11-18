import { z } from "zod";

/**
 * What the app expected from a trade-up when it was recorded: computed from the skins that
 * really went in, at that day's prices, after the selling fee of the market you value at.
 * Saved on the trade-up's result so it can be compared with what you got.
 */
export const expectationSchema = z.object({
  v: z.literal(1),
  /** Marketplace whose fee the values are after. */
  market: z.string().max(40),
  costCents: z.number().int(),
  /** Expected value after the fee: the average over many tries. */
  evCents: z.number().int(),
  /** How widely one try swings around `evCents`. */
  sdCents: z.number().int().min(0),
  /** Some input floats weren't logged, so the worst float of their wear was assumed. */
  floatsEstimated: z.boolean(),
  /** Outcomes without a price, counted as 0 like on the Trade-ups page. */
  missingPrices: z.number().int().min(0),
  outcomes: z
    .array(
      z.object({
        /** Market name without phase, e.g. "★ Karambit | Doppler (Factory New)". */
        name: z.string().max(200),
        probability: z.number().min(0).max(1),
        netCents: z.number().int(),
      }),
    )
    .max(500),
});
export type Expectation = z.infer<typeof expectationSchema>;

/** Parses a saved expectation, null when missing or unreadable. */
export function readExpectation(raw: unknown): Expectation | null {
  if (raw == null) return null;
  try {
    const parsed = expectationSchema.safeParse(
      typeof raw === "string" ? JSON.parse(raw) : raw,
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The chance the app gave the item you got, summed over phases. Null if it wasn't listed. */
export function chanceOfResult(
  e: Expectation,
  marketHashName: string,
): number | null {
  const hits = e.outcomes.filter((o) => o.name === marketHashName);
  return hits.length ? hits.reduce((s, o) => s + o.probability, 0) : null;
}

export type ContractCheck = {
  id: number;
  marketHashName: string;
  costCents: number;
  expectedCents: number;
  sdCents: number;
  /** What you got after the fee: the sale, or today's value while you still hold it. */
  actualCents: number | null;
  sold: boolean;
  /** Chance the app gave this result; null means it wasn't one of the predicted outcomes. */
  chance: number | null;
  floatsEstimated: boolean;
};

export type ExpectedVsActual = {
  contracts: ContractCheck[];
  /** Contracts with something to compare (sold, or held with a price). */
  counted: number;
  expectedCents: number;
  actualCents: number;
  /** How far the total is from expected, in standard deviations of luck. */
  z: number | null;
  /** Results the app didn't list as possible: a sign the collection data is wrong. */
  unexpected: number;
  verdict: "none" | "too-few" | "as-expected" | "below" | "above";
};

/** Contracts to judge before saying anything about the maths. */
export const ENOUGH_CONTRACTS = 20;

/**
 * Adds up expected and actual over every recorded trade-up. One contract is mostly luck, so
 * the verdict compares the total gap with the luck you'd expect over that many (the
 * standard deviations add up as variances): within 2 is normal luck.
 */
export function expectedVsActual(contracts: ContractCheck[]): ExpectedVsActual {
  const counted = contracts.filter((c) => c.actualCents != null);
  const expectedCents = counted.reduce((s, c) => s + c.expectedCents, 0);
  const actualCents = counted.reduce((s, c) => s + (c.actualCents ?? 0), 0);
  const sd = Math.sqrt(counted.reduce((s, c) => s + c.sdCents ** 2, 0));
  const z =
    counted.length && sd > 0 ? (actualCents - expectedCents) / sd : null;
  const verdict: ExpectedVsActual["verdict"] =
    counted.length === 0
      ? "none"
      : counted.length < ENOUGH_CONTRACTS
        ? "too-few"
        : z == null || Math.abs(z) < 2
          ? "as-expected"
          : z < 0
            ? "below"
            : "above";
  return {
    contracts,
    counted: counted.length,
    expectedCents,
    actualCents,
    z,
    unexpected: contracts.filter((c) => c.chance == null).length,
    verdict,
  };
}
