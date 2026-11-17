"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { FoundContract } from "@/lib/finder";
import type { Outcome } from "@/lib/tradeup";
import { isTier, TIERS, type Tier } from "@/lib/tradeup";
import { isMarketplaceId, MARKETPLACES, type MarketplaceId } from "@/lib/fees";
import { riskNotes, THIN_MARKET } from "@/lib/risk";
import { useMoney } from "./Money";
import { useSearchParams } from "next/navigation";
import { urlFlag, urlNumber } from "@/lib/filters";
import { AskAi } from "./AskAi";
import type { ContractTimeline } from "@/lib/timeline";
import { FloatBadges } from "./FloatBadges";

const TIER_COLORS: Record<Tier, string> = {
  "Consumer Grade": "#b0c3d9",
  "Industrial Grade": "#5e98d9",
  "Mil-Spec Grade": "#4b69ff",
  Restricted: "#8847ff",
  Classified: "#d32ce6",
  Covert: "#eb4b4b",
};
const TIER_SHORT: Record<Tier, string> = {
  "Consumer Grade": "Consumer (grey)",
  "Industrial Grade": "Industrial (light blue)",
  "Mil-Spec Grade": "Mil-Spec (dark blue)",
  Restricted: "Restricted (purple)",
  Classified: "Classified (pink)",
  Covert: "Covert (red) to knife",
};

type ApiOutcome = Outcome & {
  volume30d: number;
  priceSource: "steam" | "skinport" | null;
  /** Null for Doppler phases, which Steam doesn't list separately. */
  marketHashName: string | null;
};

/** Steam allows about 20 price checks a minute; stay well under it. */
const STEAM_CHECK_GAP_MS = 3500;
type ApiContract = Omit<FoundContract, "result"> & {
  timeline: ContractTimeline;
  result: Omit<FoundContract["result"], "outcomes"> & {
    outcomes: ApiOutcome[];
  };
};
type SortKey = "profit" | "roi" | "odds";

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

const contractRisks = (c: ApiContract) =>
  riskNotes(c.result.outcomes, c.result.evCents);

export function TradeUps() {
  const { money, rates, currency } = useMoney();
  // Filters can arrive in the URL from the Dashboard's plain-English search.
  const params = useSearchParams();
  const [tier, setTier] = useState<Tier>(() => {
    const t = params.get("tier");
    return t && isTier(t) ? t : "Restricted";
  });
  const [stattrak, setStattrak] = useState(() =>
    urlFlag(params, "stattrak", false),
  );
  const [market, setMarket] = useState<MarketplaceId>(() => {
    const m = params.get("market");
    return m && isMarketplaceId(m) ? m : "skinport";
  });
  const [budget, setBudget] = useState(() => urlNumber(params, "max", ""));
  const [sort, setSort] = useState<SortKey>("profit");
  const [hideRisky, setHideRisky] = useState(() =>
    urlFlag(params, "hideRisky", true),
  );
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    contracts?: ApiContract[];
    market?: MarketplaceId;
  }>({ loading: false });
  const [selected, setSelected] = useState<ApiContract | null>(null);

  async function scan() {
    setState({ loading: true });
    try {
      // Budget is typed in the shown currency; the server works in USD.
      const usd = budget ? Number(budget) / (rates[currency] ?? 1) : 0;
      const q = new URLSearchParams({
        tier,
        market,
        stattrak: stattrak ? "1" : "0",
        hideRisky: hideRisky ? "1" : "0",
        budget: String(usd || ""),
      });
      const res = await fetch(`/api/tradeups?${q}`);
      const json = (await res.json()) as {
        error?: string;
        contracts?: ApiContract[];
        market?: MarketplaceId;
      };
      if (!res.ok) throw new Error(json.error ?? "Scan failed.");
      setState({
        loading: false,
        contracts: json.contracts,
        market: json.market,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Scan failed.",
      });
    }
  }

  const sorted = useMemo(() => {
    const list = [...(state.contracts ?? [])];
    const by: Record<SortKey, (c: ApiContract) => number> = {
      profit: (c) => c.result.profitCents,
      roi: (c) => c.result.roiPercent,
      odds: (c) => c.result.oddsToProfit,
    };
    return list.sort((a, b) => by[sort](b) - by[sort](a));
  }, [state.contracts, sort]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Trade-ups</h1>
        <p className="text-sm text-muted">
          Pick a rarity, scan, and see which contracts pay after fees. Prices
          come from Skinport, or from Steam when you sell on Steam and have
          checked that item. Inputs assume the worst float of their wear, so
          lower floats only make it better.
        </p>
      </div>

      {params.size > 0 && !state.contracts && (
        <p role="status" className="panel border-accent p-3 text-sm">
          Filters set from your search. Check them, then click{" "}
          <strong>Scan</strong>.
        </p>
      )}

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm text-muted">Rarity to put in</legend>
        {TIERS.map((t) => (
          <button
            key={t}
            className="btn"
            aria-pressed={tier === t}
            style={{
              borderColor: tier === t ? TIER_COLORS[t] : undefined,
              borderLeftWidth: 4,
              borderLeftColor: TIER_COLORS[t],
            }}
            onClick={() => setTier(t)}
          >
            {TIER_SHORT[t]}
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={stattrak}
            onChange={(e) => setStattrak(e.target.checked)}
          />
          StatTrak
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Sell on</span>
          <select
            className="input"
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketplaceId)}
          >
            {Object.values(MARKETPLACES).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.feeNote.split(" (")[0]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Max cost ({currency})</span>
          <input
            className="input w-28"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Any"
          />
        </label>
        <button
          className="btn-primary"
          disabled={state.loading}
          onClick={() => void scan()}
        >
          {state.loading ? "Scanning..." : "Scan"}
        </button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideRisky}
            onChange={(e) => setHideRisky(e.target.checked)}
          />
          Hide risky contracts
        </label>
        <label className="ml-auto flex flex-col gap-1">
          <span className="text-muted">Sort by</span>
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="profit">Expected profit</option>
            <option value="roi">Return (ROI)</option>
            <option value="odds">Chance to profit</option>
          </select>
        </label>
      </div>

      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.contracts && sorted.length === 0 && (
        <p className="text-sm text-muted">
          No contracts found. Update prices on the Dashboard, or raise the max
          cost.
        </p>
      )}

      {sorted.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="p-2 font-normal">Inputs</th>
                <th className="p-2 font-normal">Cost</th>
                <th className="p-2 font-normal">Expected back</th>
                <th className="p-2 font-normal">Profit</th>
                <th className="p-2 font-normal">ROI</th>
                <th className="p-2 font-normal">Chance to profit</th>
                <th
                  className="p-2 font-normal"
                  title="Trade hold plus expected time to sell"
                >
                  Days
                </th>
                <th className="p-2 font-normal">Risk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const risks = contractRisks(c);
                return (
                  <tr
                    key={c.key}
                    className="cursor-pointer border-t border-line hover:bg-bg"
                    onClick={() => setSelected(c)}
                  >
                    <td className="p-2">
                      <button
                        className="flex flex-wrap items-center gap-2 text-left"
                        onClick={() => setSelected(c)}
                      >
                        {c.inputs.map((i) => (
                          <span
                            key={i.option.marketHashName}
                            className="flex items-center gap-1"
                          >
                            {i.option.image && (
                              <Image
                                src={i.option.image}
                                alt=""
                                width={48}
                                height={36}
                                className="h-7 w-auto"
                              />
                            )}
                            <span>
                              {i.count}x{" "}
                              {i.option.owned && (
                                <strong className="text-good">yours </strong>
                              )}
                              {i.option.skinName}{" "}
                              <span className="text-muted">
                                ({i.option.wear})
                              </span>
                            </span>
                          </span>
                        ))}
                      </button>
                    </td>
                    <td className="p-2">{money(c.result.costCents)}</td>
                    <td className="p-2">{money(c.result.evCents)}</td>
                    <td
                      className={`p-2 font-medium ${c.result.profitCents >= 0 ? "text-good" : "text-bad"}`}
                    >
                      {money(c.result.profitCents)}
                    </td>
                    <td className="p-2">{c.result.roiPercent.toFixed(0)}%</td>
                    <td className="p-2">{pct(c.result.oddsToProfit)}</td>
                    <td className="p-2">{Math.ceil(c.timeline.totalDays)}</td>
                    <td className="p-2">
                      {risks.length ? (
                        <span className="text-bad" title={risks.join(". ")}>
                          Check
                        </span>
                      ) : (
                        <span className="text-muted">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ContractDetail
          contract={selected}
          sellOnSteam={state.market === "steam"}
          onRescan={() => {
            setSelected(null);
            void scan();
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ContractDetail({
  contract: c,
  sellOnSteam,
  onRescan,
  onClose,
}: {
  contract: ApiContract;
  sellOnSteam: boolean;
  onRescan: () => void;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const risks = contractRisks(c);
  const notOnSteam = c.result.outcomes.filter(
    (o) => o.priceSource !== "steam" && o.marketHashName,
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contract details"
      className="fixed inset-0 z-10 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-line bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn float-right" onClick={onClose} autoFocus>
          Close
        </button>
        <h2 className="text-lg font-semibold">Contract</h2>
        <p className="text-sm text-muted">
          Cost {money(c.result.costCents)}, expected back{" "}
          {money(c.result.evCents)},{" "}
          <span
            className={c.result.profitCents >= 0 ? "text-good" : "text-bad"}
          >
            profit {money(c.result.profitCents)}
          </span>
          , chance to profit {pct(c.result.oddsToProfit)}.
        </p>
        <p className="mt-1 text-sm">
          Takes about <strong>{Math.ceil(c.timeline.totalDays)} days</strong>: a{" "}
          {c.timeline.holdDays}-day trade hold before you can sell what you get
          (change it on the Tracker page), then about{" "}
          {Math.ceil(c.timeline.sellDays)} days to sell it at the usual price.
        </p>
        {risks.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm text-bad">
            {risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {sellOnSteam && notOnSteam.length > 0 && (
          <SteamPricesNote
            names={notOnSteam.map((o) => o.marketHashName!)}
            total={c.result.outcomes.length}
            onDone={onRescan}
          />
        )}

        <div className="mt-4">
          <AskAi topic="contract" data={contractForAi(c, risks)} />
        </div>

        <h3 className="mt-4 mb-2 font-semibold">1. Buy these</h3>
        <ul className="space-y-2 text-sm">
          {c.inputs.map((i) => (
            <li
              key={i.option.marketHashName}
              className="flex items-center gap-3"
            >
              {i.option.image && (
                <Image
                  src={i.option.image}
                  alt=""
                  width={96}
                  height={72}
                  className="h-12 w-auto"
                />
              )}
              <span>
                <strong>{i.count}x</strong> {i.option.marketHashName}:{" "}
                {i.count > 1 &&
                i.option.nextCostCents != null &&
                i.option.nextCostCents > i.option.costCents ? (
                  <>
                    cheapest {money(i.option.costCents)}, then about{" "}
                    {money(i.option.nextCostCents)} each
                  </>
                ) : (
                  <>about {money(i.option.costCents)} each</>
                )}
                <br />
                <span className="text-muted">
                  Any float up to {i.option.float.toFixed(3)} works.{" "}
                  {i.option.quantity} listed on Skinport.
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          Average float position of the inputs:{" "}
          {(c.result.avgNormFloat * 100).toFixed(1)}% of their range. Lower
          floats push outcomes to better wear.
        </p>

        <h3 className="mt-4 mb-2 font-semibold">2. What you can get</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-normal">Outcome</th>
                <th className="font-normal">Chance</th>
                <th className="font-normal">Float</th>
                <th className="font-normal">Sells for</th>
                <th className="font-normal">After fees</th>
                <th className="font-normal">Sold 30d</th>
              </tr>
            </thead>
            <tbody>
              {c.result.outcomes.map((o) => (
                <tr key={o.skin.id} className="border-t border-line align-top">
                  <td className="py-1">
                    <div className="flex items-center gap-2">
                      {o.skin.image && (
                        <Image
                          src={o.skin.image}
                          alt=""
                          width={64}
                          height={48}
                          className="h-8 w-auto"
                        />
                      )}
                      <span>
                        {o.skin.name}
                        {o.skin.phase ? ` ${o.skin.phase}` : ""}{" "}
                        <span className="text-muted">{o.wear ?? ""}</span>
                        {o.betterWear && (
                          <span className="block text-xs text-muted">
                            {o.betterWear.wear} if average float position is
                            under {(o.betterWear.maxAvgNorm * 100).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td>{pct(o.probability)}</td>
                  <td className="font-mono">
                    {o.float.toFixed(4)}
                    <FloatBadges
                      float={o.float}
                      min={o.skin.minFloat}
                      max={o.skin.maxFloat}
                    />
                  </td>
                  <td>
                    {money(o.priceCents)}
                    {sellOnSteam && o.priceSource === "skinport" && (
                      <span
                        className="block text-xs text-muted"
                        title="No Steam price checked for this item yet, so this is Skinport's price"
                      >
                        Skinport price
                      </span>
                    )}
                  </td>
                  <td
                    className={
                      o.netCents > c.result.costCents ? "text-good" : ""
                    }
                  >
                    {money(o.netCents)}
                  </td>
                  <td className={o.volume30d < THIN_MARKET ? "text-bad" : ""}>
                    {o.volume30d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** The computed facts about a contract, compact, for the AI to comment on. */
function contractForAi(c: ApiContract, risks: string[]) {
  return {
    costCents: c.result.costCents,
    expectedValueAfterFeesCents: c.result.evCents,
    profitCents: c.result.profitCents,
    roiPercent: Math.round(c.result.roiPercent),
    chanceToProfit: c.result.oddsToProfit,
    days: c.timeline,
    warnings: risks,
    inputs: c.inputs.map((i) => ({
      count: i.count,
      item: i.option.marketHashName,
      cheapestCents: i.option.costCents,
      furtherCopiesCents: i.option.nextCostCents ?? i.option.costCents,
      owned: Boolean(i.option.owned),
    })),
    outcomes: c.result.outcomes.map((o) => ({
      item: o.skin.name,
      wear: o.wear,
      float: Number(o.float.toFixed(4)),
      probability: Number(o.probability.toFixed(3)),
      sellCents: o.priceCents,
      afterFeeCents: o.netCents,
      sales30d: o.volume30d,
    })),
  };
}

/**
 * When selling on Steam, outcomes without a checked Steam price use Skinport's price, which
 * is often lower. This fetches Steam prices one by one, slowly, then rescans.
 */
function SteamPricesNote({
  names,
  total,
  onDone,
}: {
  names: string[];
  total: number;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState<{
    done: number;
    error?: string;
  } | null>(null);

  async function run() {
    const unique = [...new Set(names)];
    setProgress({ done: 0 });
    for (let i = 0; i < unique.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, STEAM_CHECK_GAP_MS));
      const res = await fetch(
        `/api/steam-price?name=${encodeURIComponent(unique[i])}`,
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setProgress({
          done: i,
          error: json.error ?? "Steam didn't answer. Try again in a minute.",
        });
        return;
      }
      setProgress({ done: i + 1 });
    }
    onDone();
  }

  const count = new Set(names).size;
  return (
    <div className="panel mt-3 border-accent p-3 text-sm">
      <p>
        {names.length} of {total} outcomes use Skinport&apos;s price because
        Steam hasn&apos;t been checked for them. Steam prices are often higher.
      </p>
      {progress ? (
        <p className="mt-1 text-muted" role="status">
          {progress.error
            ? progress.error
            : `Checking Steam: ${progress.done} of ${count}.`}
        </p>
      ) : (
        <button className="btn mt-2" onClick={run}>
          Get Steam prices (about{" "}
          {Math.ceil((count * STEAM_CHECK_GAP_MS) / 1000)} s), then rescan
        </button>
      )}
    </div>
  );
}
