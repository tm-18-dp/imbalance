"use client";

import { useState } from "react";
import type { MarketplaceId } from "@/lib/fees";
import type { ContractSpread, Tier } from "@/lib/tradeup";
import type { WearName } from "@/lib/wear";
import { useMoney } from "./Money";

type Plan = {
  target: number | null;
  costCents: number;
  evCents: number;
  profitCents: number;
  roiPercent: number;
  oddsToProfit: number;
  avgNormFloat: number;
  spread: ContractSpread;
  buys: {
    id: string;
    skinName: string;
    marketHashName: string;
    priceCents: number;
    float: number;
    url: string;
  }[];
  outcomes: {
    name: string;
    phase: string | null;
    wear: WearName | null;
    probability: number;
    priceCents: number | null;
  }[];
};

/** The best plan's listings, for the shopping list. */
export type ExactBuyPlan = {
  buys: Plan["buys"];
  costCents: number;
  profitCents: number;
};

export type ExactFloatsProps = {
  onBest?: (plan: ExactBuyPlan | null) => void;
  tier: Tier;
  stattrak: boolean;
  market: MarketplaceId;
  inputs: { skinId: string; wear: WearName; count: number; owned: boolean }[];
  /** The scanned contract (worst floats), to compare against. */
  baseline: {
    profitCents: number;
    outcomes: { name: string; phase: string | null; wear: WearName | null }[];
  };
};

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/**
 * Picks real CSFloat listings with known floats so the contract's average float lands under
 * a better-wear threshold, and compares the plans with the scanned (worst-float) contract.
 */
export function ExactFloats({
  onBest,
  tier,
  stattrak,
  market,
  inputs,
  baseline,
}: ExactFloatsProps) {
  const { money } = useMoney();
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    needsKey?: boolean;
    note?: string;
    plans?: Plan[];
  }>({ loading: false });

  if (inputs.some((i) => i.owned))
    return (
      <p className="text-sm text-muted">
        This contract uses skins you own, whose floats are already known, so
        there is nothing to pick on CSFloat.
      </p>
    );

  async function run() {
    setState({ loading: true });
    try {
      const q = new URLSearchParams({
        tier,
        market,
        stattrak: stattrak ? "1" : "0",
        inputs: JSON.stringify(
          inputs.map(({ skinId, wear, count }) => ({ skinId, wear, count })),
        ),
      });
      const res = await fetch(`/api/tradeups/exact?${q}`);
      const json = (await res.json()) as {
        error?: string;
        needsKey?: boolean;
        note?: string;
        plans?: Plan[];
      };
      if (!res.ok)
        return setState({
          loading: false,
          error: json.error ?? "CSFloat didn't answer.",
          needsKey: json.needsKey,
        });
      setState({ loading: false, plans: json.plans ?? [], note: json.note });
      const best = json.plans?.[0];
      onBest?.(
        best
          ? {
              buys: best.buys,
              costCents: best.costCents,
              profitCents: best.profitCents,
            }
          : null,
      );
    } catch {
      setState({ loading: false, error: "CSFloat didn't answer. Try again." });
    }
  }

  const best = state.plans?.[0];
  const wearOf = new Map(
    baseline.outcomes.map((o) => [`${o.name}|${o.phase ?? ""}`, o.wear]),
  );
  const upgrades = best
    ? best.outcomes.filter(
        (o) => o.wear && wearOf.get(`${o.name}|${o.phase ?? ""}`) !== o.wear,
      )
    : [];

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        The scan assumes every input has the worst float its wear allows. Real
        CSFloat listings with low floats can push results into a better wear.
        This picks the cheapest listings that do it.
      </p>
      {!state.plans && (
        <button className="btn" disabled={state.loading} onClick={run}>
          {state.loading
            ? "Checking CSFloat listings..."
            : "Pick exact floats on CSFloat"}
        </button>
      )}
      {state.error && (
        <p className={state.needsKey ? "text-muted" : "text-bad"}>
          {state.error}
        </p>
      )}
      {state.note && <p className="text-muted">{state.note}</p>}
      {state.plans && state.plans.length === 0 && !state.note && (
        <p className="text-muted">
          No mix of current listings fits this contract.
        </p>
      )}
      {best && (
        <>
          <div className="panel p-3">
            <p>
              <strong>Best plan:</strong> cost {money(best.costCents)}, expected
              back {money(best.evCents)},{" "}
              <span
                className={best.profitCents >= 0 ? "text-good" : "text-bad"}
              >
                profit {money(best.profitCents)}
              </span>{" "}
              ({best.roiPercent.toFixed(0)}%), chance to profit{" "}
              {pct(best.oddsToProfit)}.
            </p>
            <p className="text-muted">
              With worst-case floats the scan expected{" "}
              {money(baseline.profitCents)}.{" "}
              {best.profitCents > baseline.profitCents
                ? `Exact floats add ${money(best.profitCents - baseline.profitCents)}.`
                : "Exact floats don't beat it right now."}{" "}
              Average float position {(best.avgNormFloat * 100).toFixed(1)}%.
            </p>
            {upgrades.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {upgrades.slice(0, 8).map((o) => (
                  <li key={`${o.name}|${o.phase}`}>
                    {o.name}
                    {o.phase ? ` ${o.phase}` : ""}:{" "}
                    {wearOf.get(`${o.name}|${o.phase ?? ""}`)} to{" "}
                    <strong className="text-good">{o.wear}</strong> (
                    {pct(o.probability)} chance)
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 font-semibold">Buy these on CSFloat</p>
            <ul className="space-y-1">
              {best.buys.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2">
                  <span>{b.marketHashName}</span>
                  <span className="font-mono text-muted">
                    {b.float.toFixed(5)}
                  </span>
                  <span>{money(b.priceCents)}</span>
                  <a
                    className="text-accent underline"
                    href={b.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">
              Listings sell fast: these are from the last 10 minutes. If one is
              gone, check again.
            </p>
          </div>

          {state.plans!.length > 1 && (
            <div className="overflow-x-auto">
              <p className="mb-1 font-semibold">Other plans</p>
              <table className="w-full text-left">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-normal">Average float under</th>
                    <th className="font-normal">Cost</th>
                    <th className="font-normal">Profit</th>
                    <th className="font-normal">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {state.plans!.slice(1).map((p, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="py-1">
                        {p.target == null
                          ? "Any (cheapest)"
                          : `${(p.target * 100).toFixed(1)}% of range`}
                      </td>
                      <td>{money(p.costCents)}</td>
                      <td
                        className={
                          p.profitCents >= 0 ? "text-good" : "text-bad"
                        }
                      >
                        {money(p.profitCents)}
                      </td>
                      <td>{p.roiPercent.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
