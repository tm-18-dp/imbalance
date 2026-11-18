import { z } from "zod";
import { MARKETPLACE_IDS } from "./fees";
import { RISK_PROFILE_IDS } from "./risk";
import { TIERS } from "./tradeup";

/**
 * Page filters the ask box can set from plain English. Money amounts are in the currency the
 * user sees, exactly as they typed them: the page converts, the AI never does.
 */
const amount = z.number().positive().max(1e7).nullish();
const risk = z.enum(RISK_PROFILE_IDS).nullish();
export const filtersSchema = z.discriminatedUnion("page", [
  z.object({
    page: z.literal("tradeups"),
    tier: z.enum(TIERS).nullish(),
    stattrak: z.boolean().nullish(),
    market: z.enum(MARKETPLACE_IDS).nullish(),
    maxCost: amount,
    hideRisky: z.boolean().nullish(),
    risk,
  }),
  z.object({
    page: z.literal("deals"),
    search: z.string().max(100).nullish(),
    market: z.enum(MARKETPLACE_IDS).nullish(),
    maxPrice: amount,
    minPercentBelow: z.number().min(0).max(90).nullish(),
    minSold30d: z.number().int().min(0).max(10000).nullish(),
    dipsOnly: z.boolean().nullish(),
    weaponsOnly: z.boolean().nullish(),
    risk,
  }),
  z.object({ page: z.literal("none") }),
]);
export type Filters = z.infer<typeof filtersSchema>;

export const FILTERS_PROMPT = `Turn the user's request into page filters for a CS2 trading app.
Reply with one JSON object and nothing else. Shapes:
{"page":"tradeups","tier":one of ${JSON.stringify(TIERS)} (the rarity the user puts IN),"stattrak":bool,"market":"skinport"|"csfloat"|"steam","maxCost":number,"hideRisky":bool,"risk":"safe"|"balanced"|"aggressive"}
{"page":"deals","search":"item name words","market":"skinport"|"csfloat"|"steam","maxPrice":number,"minPercentBelow":number,"minSold30d":integer,"dipsOnly":bool,"weaponsOnly":bool,"risk":"safe"|"balanced"|"aggressive"}
{"page":"none"} when it is not a search for trade-ups or deals.
Set "risk" only when the user asks for it: "aggressive" for risky, high risk, big upside or
yolo; "balanced" for medium risk; "safe" for safe or low risk.
Leave out any field the user did not ask for. Copy amounts exactly as the user wrote them,
never convert currencies or do maths. Colours: grey Consumer, light blue Industrial, dark blue
Mil-Spec, purple Restricted, pink Classified, red Covert.`;

/** Pulls the first JSON object out of an AI reply and validates it. */
export function parseFilters(reply: string): Filters | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = filtersSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The page URL for a set of filters, or null for "none". */
export function filtersUrl(f: Filters): string | null {
  if (f.page === "none") return null;
  const q = new URLSearchParams();
  const put = (k: string, v: string | number | boolean | null | undefined) => {
    if (v != null && v !== "")
      q.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  };
  if (f.page === "tradeups") {
    put("tier", f.tier);
    put("stattrak", f.stattrak);
    put("market", f.market);
    put("max", f.maxCost);
    put("hideRisky", f.hideRisky);
    put("risk", f.risk);
  } else {
    put("q", f.search);
    put("market", f.market);
    put("max", f.maxPrice);
    put("minDiscount", f.minPercentBelow);
    put("minVolume", f.minSold30d);
    put("dips", f.dipsOnly);
    put("weapons", f.weaponsOnly);
    put("risk", f.risk);
  }
  const s = q.toString();
  return `/${f.page}${s ? `?${s}` : ""}`;
}

/** Reads one filter back from the URL; `fallback` when missing or invalid. */
export const urlFlag = (p: URLSearchParams, k: string, fallback: boolean) =>
  p.has(k) ? p.get(k) === "1" : fallback;
export const urlNumber = (p: URLSearchParams, k: string, fallback: string) => {
  const v = p.get(k);
  return v && /^\d+(\.\d+)?$/.test(v) ? v : fallback;
};
