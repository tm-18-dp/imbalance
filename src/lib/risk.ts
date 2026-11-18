import type { ContractSort } from "./rank";

export type RiskOutcome = {
  probability: number;
  netCents: number;
  priceCents: number | null;
  volume30d: number;
};

export const RISK_PROFILE_IDS = ["safe", "balanced", "aggressive"] as const;
export type RiskProfileId = (typeof RISK_PROFILE_IDS)[number];

export type RiskProfile = {
  id: RiskProfileId;
  label: string;
  /** One line for the picker: what this profile lets through. */
  summary: string;
  /** Trade-ups: sales in 30 days below this make an outcome's price untrusted. */
  thinMarket: number;
  /** Trade-ups: most of the expected value allowed to come from untrusted prices. */
  maxThinShare: number;
  /** Trade-ups: allow outcomes with no price at all (counted as 0, so EV is understated). */
  allowMissingPrices: boolean;
  /** Trade-ups: the sort the page switches to when this profile is picked. */
  contractSort: ContractSort;
  /** Deals: minimum sales in 30 days. */
  dealMinVolume30d: number;
  /** Deals: minimum discount below the 30-day median, as a percentage. */
  dealMinDiscountPercent: number;
  /** Deals: also show stickers, cases, charms and other non-weapon items. */
  dealIncludeNonWeapons: boolean;
};

export const RISK_PROFILES: Record<RiskProfileId, RiskProfile> = {
  safe: {
    id: "safe",
    label: "Safe",
    summary: "Only prices backed by regular sales. Small, steadier profits.",
    thinMarket: 3,
    maxThinShare: 0.25,
    allowMissingPrices: false,
    contractSort: "profit",
    dealMinVolume30d: 10,
    dealMinDiscountPercent: 10,
    dealIncludeNonWeapons: false,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    summary:
      "Allows some value from skins that sell less often. More results, wider swings.",
    thinMarket: 3,
    maxThinShare: 0.4,
    allowMissingPrices: false,
    contractSort: "profit",
    dealMinVolume30d: 5,
    dealMinDiscountPercent: 7,
    dealIncludeNonWeapons: true,
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    summary:
      "Allows rare sellers and unpriced outcomes. Biggest upside, real chance of losses.",
    // A single sale proves little, so 0 or 1 sales still count as untrusted here.
    thinMarket: 2,
    maxThinShare: 0.6,
    allowMissingPrices: true,
    contractSort: "roi",
    dealMinVolume30d: 2,
    dealMinDiscountPercent: 5,
    dealIncludeNonWeapons: true,
  },
};

export const isRiskProfileId = (v: unknown): v is RiskProfileId =>
  typeof v === "string" && (RISK_PROFILE_IDS as readonly string[]).includes(v);

/** Sales in 30 days below this mean the price can't be trusted (Safe's rule, used for warnings). */
export const THIN_MARKET = RISK_PROFILES.safe.thinMarket;

/** Share of the expected value that comes from outcomes selling under `thinMarket` times. */
export function thinShare(
  outcomes: readonly RiskOutcome[],
  evCents: number,
  thinMarket: number,
): number {
  if (evCents <= 0) return 0;
  const thinValue = outcomes
    .filter((o) => o.volume30d < thinMarket)
    .reduce((s, o) => s + o.probability * o.netCents, 0);
  return thinValue / evCents;
}

/**
 * Plain-English warnings for a contract, always judged by the Safe rules so the downside
 * shows whatever profile is picked. Risky when an outcome has no price, or when more than a
 * quarter of the expected value comes from skins that barely sell (their listed price may be
 * fake, and you may not find a buyer at it).
 */
export function riskNotes(
  outcomes: readonly RiskOutcome[],
  evCents: number,
): string[] {
  const safe = RISK_PROFILES.safe;
  const notes: string[] = [];
  const missing = outcomes.filter((o) => o.priceCents == null).length;
  if (missing) notes.push(`${missing} outcome(s) have no price, counted as 0`);
  const share = thinShare(outcomes, evCents, safe.thinMarket);
  if (share > safe.maxThinShare) {
    notes.push(
      `${Math.round(share * 100)}% of the expected value comes from skins that sold under ${safe.thinMarket} times in 30 days`,
    );
  }
  return notes;
}

/** True when a contract is within what the profile accepts. */
export function withinProfile(
  outcomes: readonly RiskOutcome[],
  evCents: number,
  profile: RiskProfile,
): boolean {
  if (!profile.allowMissingPrices && outcomes.some((o) => o.priceCents == null))
    return false;
  return (
    thinShare(outcomes, evCents, profile.thinMarket) <= profile.maxThinShare
  );
}
