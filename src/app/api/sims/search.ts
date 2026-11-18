import type { SimContract } from "@/lib/sim-data";
import { GET as tradeupsSearch } from "../tradeups/route";

/** Runs the Trade-ups search exactly as the page does, for practice bots. */
export async function searchTradeups(query: string): Promise<SimContract[]> {
  const res = await tradeupsSearch(
    new Request(`http://localhost/api/tradeups?${query}`),
  );
  if (!res.ok) return [];
  return ((await res.json()) as { contracts: SimContract[] }).contracts;
}
