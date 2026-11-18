import type { AlertItem, AlertKind } from "@/lib/alerts";
import { GET as dealsSearch } from "../deals/route";
import { GET as tradeupsSearch } from "../tradeups/route";

type Contract = {
  key: string;
  inputs: { option: { skinName: string }; count: number }[];
  result: { profitCents: number; roiPercent: number };
};
type Deal = {
  marketHashName: string;
  version: string;
  buyCents: number;
  flipProfitCents: number;
};

/** Runs a saved search exactly as its page would, and lists the results for alerts. */
export async function runSearch(
  kind: AlertKind,
  query: string,
): Promise<AlertItem[]> {
  const req = new Request(`http://localhost/api/${kind}?${query}`);
  if (kind === "tradeups") {
    const res = await tradeupsSearch(req);
    if (!res.ok) return [];
    const { contracts } = (await res.json()) as { contracts: Contract[] };
    return contracts.map((c) => ({
      key: c.key,
      label: c.inputs
        .map((i) => `${i.count}x ${i.option.skinName}`)
        .join(" + "),
      profitCents: c.result.profitCents,
      roiPercent: c.result.roiPercent,
    }));
  }
  const res = await dealsSearch(req);
  if (!res.ok) return [];
  const { deals } = (await res.json()) as { deals: Deal[] };
  // A cheaper listing of the same item is a new find.
  return deals.map((d) => ({
    key: `${d.marketHashName}|${d.version}|${d.buyCents}`,
    label: d.marketHashName,
    profitCents: d.flipProfitCents,
    roiPercent: d.buyCents > 0 ? (d.flipProfitCents / d.buyCents) * 100 : 0,
  }));
}
