/**
 * Bet sizing: how big one buy is next to the money you have set aside, and how many
 * tries a contract needs before its average result is likely to show up.
 */

/** Warn when one buy is more than this share of the bankroll. */
export const BANKROLL_WARN_SHARE = 0.1;

/** One buy as a share of the bankroll, or null when no bankroll is set. */
export function bankrollShare(
  costCents: number,
  bankrollCents: number | null | undefined,
): number | null {
  if (!bankrollCents || bankrollCents <= 0) return null;
  return costCents / bankrollCents;
}

/** Plain-English warning when one buy is too big a share of the bankroll, else null. */
export function sizingWarning(
  costCents: number,
  bankrollCents: number | null | undefined,
): string | null {
  const share = bankrollShare(costCents, bankrollCents);
  if (share == null || share <= BANKROLL_WARN_SHARE) return null;
  if (share > 1) return "This costs more than your whole bankroll.";
  return `This is ${Math.round(share * 100)}% of your bankroll. Keeping each buy under ${Math.round(BANKROLL_WARN_SHARE * 100)}% means a few bad results can't wipe you out.`;
}

/** z for being ahead with about 90% confidence (one-sided). */
const Z_90 = 1.2816;
/** Above this many tries the number stops meaning much. */
export const MAX_TRIES = 1000;

/**
 * Rough number of tries before you are about 90% likely to be ahead overall, from the
 * expected profit per try and how widely one try swings (standard deviation). The average
 * of n tries swings by sd / sqrt(n), so n = (z * sd / profit)^2. It's a rough guide:
 * it treats results as bell-shaped, which lottery-style contracts are not.
 * Null when the contract loses money on average (no number of tries helps).
 * Infinity when it would take more than MAX_TRIES.
 */
export function triesToBeAhead(
  profitCents: number,
  stdDevCents: number,
): number | null {
  if (profitCents <= 0) return null;
  if (stdDevCents <= 0) return 1;
  const n = Math.ceil(((Z_90 * stdDevCents) / profitCents) ** 2);
  return n > MAX_TRIES ? Infinity : Math.max(1, n);
}

/** Plain-English line for `triesToBeAhead`. */
export function triesText(tries: number | null): string {
  if (tries == null)
    return "Loses money on average: repeating it doesn't help.";
  if (tries === Infinity)
    return `Needs over ${MAX_TRIES} tries before you're likely to be ahead: the profit is tiny next to the swings.`;
  if (tries === 1) return "Likely to be ahead after a single try.";
  return `Needs about ${tries.toLocaleString("en-US")} tries before you're 9 in 10 likely to be ahead overall.`;
}
