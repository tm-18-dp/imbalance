"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { FoundContract } from "@/lib/finder";
import type { Outcome } from "@/lib/tradeup";
import { isTier, TIERS, valueDrivers, type Tier } from "@/lib/tradeup";
import { isMarketplaceId, MARKETPLACES, type MarketplaceId } from "@/lib/fees";
import {
  isRiskProfileId,
  RISK_PROFILES,
  riskNotes,
  THIN_MARKET,
} from "@/lib/risk";
import { useMoney } from "./Money";
import { ExactFloats } from "./ExactFloats";
import { PatternBadge } from "./PatternBadge";
import { SizedCost, useBankroll } from "./Bankroll";
import { sizingWarning, triesText, triesToBeAhead } from "@/lib/sizing";
import {
  CONTRACT_SORTS,
  profitPerDay,
  rankContracts,
  SORT_LABELS,
  type ContractSort,
} from "@/lib/rank";
import { RiskPicker, useRiskProfile } from "./RiskPicker";
import { useSearchParams } from "next/navigation";
import { urlFlag, urlNumber } from "@/lib/filters";
import { AskAi } from "./AskAi";
import type { ContractTimeline } from "@/lib/timeline";
import { FloatBadges } from "./FloatBadges";
import { AlertMe } from "./Alerts";
import { ShoppingListButtons } from "./ShoppingList";
import { floorFloat, shoppingListText } from "@/lib/shopping-list";
import type { ExactBuyPlan } from "./ExactFloats";
import { TrendBadge } from "./PriceHistory";
import type { TrendSignal } from "@/lib/trend";
import { WatchStar } from "./Watchlist";

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
  priceSource: "steam" | "skinport" | "estimate" | null;
  /** Price shape; `cut` is how much a falling price lowered the sell price (0 to 0.25). */
  trend: { signal: TrendSignal; cut: number };
  /** Null for Doppler phases, which Steam doesn't list separately. */
  marketHashName: string | null;
};

/** Steam allows about 20 price checks a minute; stay well under it. */
const STEAM_CHECK_GAP_MS = 3500;
type ApiContract = Omit<FoundContract, "result"> & {
  timeline: ContractTimeline;
  /** Has warnings by the Safe rules. */
  risky: boolean;
  result: Omit<FoundContract["result"], "outcomes"> & {
    outcomes: ApiOutcome[];
  };
};

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
  const [sort, setSort] = useState<ContractSort>(() => {
    const r = params.get("risk");
    return isRiskProfileId(r) ? RISK_PROFILES[r].contractSort : "profit";
  });
  const [hideRisky, setHideRisky] = useState(() =>
    urlFlag(params, "hideRisky", true),
  );
  // Each profile has a natural sort: Aggressive looks for return, not just profit.
  const risk = useRiskProfile(params.get("risk"), (p) =>
    setSort(p.contractSort),
  );
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    contracts?: ApiContract[];
    market?: MarketplaceId;
    /** What was scanned, and when, for follow-up requests about one contract. */
    scanned?: { tier: Tier; stattrak: boolean; at: number };
  }>({ loading: false });
  const [selected, setSelected] = useState<ApiContract | null>(null);
  const bankrollCents = useBankroll();

  /** The API query for the filters on screen; alerts save it too. */
  function scanQuery(sortBy: ContractSort = sort) {
    // Budget is typed in the shown currency; the server works in USD.
    const usd = budget ? Number(budget) / (rates[currency] ?? 1) : 0;
    return new URLSearchParams({
      tier,
      market,
      stattrak: stattrak ? "1" : "0",
      hideRisky: hideRisky ? "1" : "0",
      risk: risk.profile.id,
      sort: sortBy,
      budget: String(usd || ""),
    });
  }

  async function scan(sortBy: ContractSort = sort) {
    setState({ loading: true });
    try {
      const q = scanQuery(sortBy);
      const res = await fetch(`/api/tradeups?${q}`);
      const json = (await res.json()) as {
        error?: string;
        contracts?: ApiContract[];
        market?: MarketplaceId;
        tier?: Tier;
        variant?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Scan failed.");
      setState({
        loading: false,
        contracts: json.contracts,
        market: json.market,
        scanned: json.tier
          ? {
              tier: json.tier,
              stattrak: json.variant === "stattrak",
              at: Date.now(),
            }
          : undefined,
      });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Scan failed.",
      });
    }
  }

  // Same ranking as the server, so the order is right while a re-scan is on its way.
  const sorted = useMemo(
    () => rankContracts(state.contracts ?? [], sort),
    [state.contracts, sort],
  );

  /** Each sort has its own top 50 on the server, so a new sort scans again. */
  function changeSort(next: ContractSort) {
    setSort(next);
    if (state.contracts && !state.loading) void scan(next);
  }

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

      <RiskPicker profile={risk.profile} onChange={risk.choose} />

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
        <AlertMe
          kind="tradeups"
          query={() => scanQuery().toString()}
          defaultName={`${risk.profile.label} ${stattrak ? "StatTrak " : ""}${tier} trade-ups`}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hideRisky}
            onChange={(e) => setHideRisky(e.target.checked)}
          />
          Hide contracts above my risk level
        </label>
        <label className="ml-auto flex flex-col gap-1">
          <span className="text-muted">Sort by</span>
          <select
            className="input"
            value={sort}
            onChange={(e) => changeSort(e.target.value as ContractSort)}
          >
            {CONTRACT_SORTS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          {sort !== "profit" && (
            <span className="text-xs text-muted">
              Only contracts that make money on average
            </span>
          )}
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
                <th
                  className="p-2 font-normal"
                  title="Profit if you get the worst-paying outcome, and the best-paying one"
                >
                  Worst / best
                </th>
                <th className="p-2 font-normal">ROI</th>
                <th className="p-2 font-normal">Chance to profit</th>
                <th
                  className="p-2 font-normal"
                  title="Trade hold plus expected time to sell"
                >
                  Days
                </th>
                <th
                  className="p-2 font-normal"
                  title="Expected profit for each day your money is tied up"
                >
                  Per day
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
                    <td className="p-2">
                      <SizedCost
                        costCents={c.result.costCents}
                        bankrollCents={bankrollCents}
                      >
                        {money(c.result.costCents)}
                      </SizedCost>
                    </td>
                    <td className="p-2">{money(c.result.evCents)}</td>
                    <td
                      className={`p-2 font-medium ${c.result.profitCents >= 0 ? "text-good" : "text-bad"}`}
                    >
                      {money(c.result.profitCents)}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <span
                        className={
                          c.result.spread.worstCents < 0
                            ? "text-bad"
                            : "text-good"
                        }
                      >
                        {money(c.result.spread.worstCents)}
                      </span>
                      <span className="text-muted"> / </span>
                      <span
                        className={
                          c.result.spread.bestCents >= 0
                            ? "text-good"
                            : "text-bad"
                        }
                      >
                        {money(c.result.spread.bestCents)}
                      </span>
                    </td>
                    <td className="p-2">{c.result.roiPercent.toFixed(0)}%</td>
                    <td className="p-2">{pct(c.result.oddsToProfit)}</td>
                    <td className="p-2">{Math.ceil(c.timeline.totalDays)}</td>
                    <td className="p-2">
                      {money(Math.round(profitPerDay(c)))}
                    </td>
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
          bankrollCents={bankrollCents}
          sellOnSteam={state.market === "steam"}
          market={state.market ?? "skinport"}
          scanned={state.scanned}
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
  bankrollCents,
  sellOnSteam,
  market,
  scanned,
  onRescan,
  onClose,
}: {
  contract: ApiContract;
  bankrollCents: number | null;
  sellOnSteam: boolean;
  market: MarketplaceId;
  scanned?: { tier: Tier; stattrak: boolean; at: number };
  onRescan: () => void;
  onClose: () => void;
}) {
  const { money } = useMoney();
  // The CSFloat exact-float plan, once picked, joins the shopping list.
  const [exact, setExact] = useState<ExactBuyPlan | null>(null);
  const shoppingList = () =>
    shoppingListText({
      title:
        `${scanned?.stattrak ? "StatTrak " : ""}${scanned?.tier ?? ""} trade-up`.trim(),
      inputs: c.inputs.map((i) => ({
        count: i.count,
        marketHashName: i.option.marketHashName,
        maxFloat: i.option.float,
        firstCents: i.option.costCents,
        nextCents: i.option.nextCostCents ?? null,
        listed: i.option.quantity,
        owned: Boolean(i.option.owned),
      })),
      costCents: c.result.costCents,
      evCents: c.result.evCents,
      profitCents: c.result.profitCents,
      roiPercent: c.result.roiPercent,
      money: (cents) => money(cents),
      pricesFrom: scanned
        ? `the scan at ${new Date(scanned.at).toLocaleString()}`
        : "the last scan",
      exact: exact ?? undefined,
    });
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
        <SpreadSummary contract={c} bankrollCents={bankrollCents} />
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

        <h3 className="mt-4 mb-2 flex flex-wrap items-center gap-3 font-semibold">
          1. Buy these
          <ShoppingListButtons
            build={shoppingList}
            filename={`imbalance-trade-up-${new Date().toISOString().slice(0, 10)}.txt`}
          />
        </h3>
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
                  Any float up to {floorFloat(i.option.float)} works.{" "}
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
        <ValueDrivers outcomes={c.result.outcomes} />
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
                        {o.marketHashName && (
                          <WatchStar name={o.marketHashName} />
                        )}
                        <TrendBadge trend={o.trend.signal} />
                        {/* The price is an average: a lucky pattern is worth more. */}
                        <PatternBadge
                          name={o.skin.name}
                          seed={null}
                          patterns={[]}
                        />
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
                    {o.priceCents == null ? (
                      <span
                        className="text-bad"
                        title="Nobody has sold or listed this lately. Counted as $0, though it's worth something."
                      >
                        Unknown
                      </span>
                    ) : o.priceSource === "estimate" ? (
                      <span title="Nobody has sold or listed this lately. Worth at least this: the price of the same knife in a worse wear, or of a normal phase.">
                        at least {money(o.priceCents)}
                        <span className="block text-xs text-muted">
                          estimate
                        </span>
                      </span>
                    ) : (
                      money(o.priceCents)
                    )}
                    {o.priceCents != null && o.trend.cut > 0 && (
                      <span
                        className="block text-xs text-bad"
                        title="This item has been falling for weeks. A trade-up's result is trade locked for a week before you can sell, so the price is lowered by the drop from its 30-day to its 7-day median, assuming the slide goes on (at most 25%)."
                      >
                        lowered {Math.round(o.trend.cut * 100)}%, falling
                      </span>
                    )}
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

        {scanned && (
          <>
            <h3 className="mt-4 mb-2 font-semibold">3. Exact floats</h3>
            <ExactFloats
              onBest={setExact}
              tier={scanned.tier}
              stattrak={scanned.stattrak}
              market={market}
              inputs={c.inputs.map((i) => ({
                skinId: i.option.skinId,
                wear: i.option.wear,
                count: i.count,
                owned: Boolean(i.option.owned),
              }))}
              baseline={{
                profitCents: c.result.profitCents,
                outcomes: c.result.outcomes.map((o) => ({
                  name: o.skin.name,
                  phase: o.skin.phase ?? null,
                  wear: o.wear,
                })),
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The downside next to the upside: one try lands on a single outcome, not the average.
 * Plain-English line plus four tiles.
 */
function SpreadSummary({
  contract: c,
  bankrollCents,
}: {
  contract: ApiContract;
  bankrollCents: number | null;
}) {
  const { money } = useMoney();
  const s = c.result.spread;
  const swingy = s.stdDevCents > c.result.costCents / 2;
  const tiles: { label: string; value: string; tone: string; hint: string }[] =
    [
      {
        label: "Worst case",
        value: money(s.worstCents),
        tone: s.worstCents < 0 ? "text-bad" : "text-good",
        hint: "Profit if you get the worst-paying outcome",
      },
      {
        label: "Best case",
        value: money(s.bestCents),
        tone: s.bestCents >= 0 ? "text-good" : "text-bad",
        hint: "Profit if you get the best-paying outcome",
      },
      {
        label: "Lose over half",
        value: pct(s.chanceLoseHalf),
        tone: s.chanceLoseHalf > 0 ? "text-bad" : "text-muted",
        hint: "Chance of getting back less than half of what you paid",
      },
      {
        label: "At least double",
        value: pct(s.chanceDouble),
        tone: s.chanceDouble > 0 ? "text-good" : "text-muted",
        hint: "Chance of getting back at least twice what you paid",
      },
    ];
  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="panel p-2" title={t.hint}>
            <dt className="text-xs text-muted">{t.label}</dt>
            <dd className={`text-base font-semibold ${t.tone}`}>{t.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-muted">
        One try gets you one outcome, not the average. A typical try lands about{" "}
        {money(s.stdDevCents)} above or below the expected{" "}
        {money(c.result.evCents)}
        {swingy
          ? ", which is a big swing for the cost: the profit only shows up over many tries."
          : "."}
      </p>
      <SizingNotes
        costCents={c.result.costCents}
        profitCents={c.result.profitCents}
        stdDevCents={s.stdDevCents}
        days={c.timeline.totalDays}
        bankrollCents={bankrollCents}
      />
    </div>
  );
}

/**
 * For knife and glove pools: which knife types the expected value rests on. A contract
 * whose value is mostly one rare knife is a lottery ticket, however good its average.
 */
function ValueDrivers({ outcomes }: { outcomes: ApiOutcome[] }) {
  const drivers = valueDrivers(outcomes);
  if (drivers.length < 3) return null;
  const top = drivers.slice(0, 5);
  const lead = top[0];
  return (
    <div className="mb-3 text-sm">
      <p className="mb-1 text-muted">Where the value comes from</p>
      <ul className="space-y-1">
        {top.map((d) => (
          <li key={d.item} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate" title={d.item}>
              {d.item}
            </span>
            <span
              className="h-2 rounded bg-accent"
              style={{ width: `${Math.max(2, d.evShare * 100) * 1.5}px` }}
              aria-hidden="true"
            />
            <span>
              {Math.round(d.evShare * 100)}% of the value,{" "}
              <span className="text-muted">{pct(d.probability)} chance</span>
            </span>
          </li>
        ))}
      </ul>
      {lead.evShare > 0.4 && lead.probability < 0.2 && (
        <p className="mt-1 text-bad">
          {Math.round(lead.evShare * 100)}% of the value rests on a{" "}
          {pct(lead.probability)} chance of {lead.item}. Most tries won&apos;t
          get it.
        </p>
      )}
    </div>
  );
}

/**
 * How many tries the average needs to show up, what that ties up, and whether one try is
 * too big for the bankroll. The tries number is rough: it treats results as bell-shaped.
 */
function SizingNotes({
  costCents,
  profitCents,
  stdDevCents,
  days,
  bankrollCents,
}: {
  costCents: number;
  profitCents: number;
  stdDevCents: number;
  days: number;
  bankrollCents: number | null;
}) {
  const { money } = useMoney();
  const tries = triesToBeAhead(profitCents, stdDevCents);
  const warning = sizingWarning(costCents, bankrollCents);
  const repeatable = tries != null && tries !== Infinity && tries > 1;
  return (
    <div className="mt-2 space-y-1 text-sm">
      <p
        className={tries == null || tries === Infinity ? "text-bad" : ""}
        title="Rough guide: it treats results as bell-shaped, which contracts with one big prize are not"
      >
        {triesText(tries)}
        {repeatable && (
          <span className="text-muted">
            {" "}
            That&apos;s {money(tries * costCents)} in total if run side by side,
            or about {Math.ceil(tries * days).toLocaleString("en-US")} days one
            after another.
          </span>
        )}
      </p>
      {warning && <p className="text-bad">{warning}</p>}
      {bankrollCents == null && (
        <p className="text-muted">
          Set a bankroll on the Tracker page to get a warning when one try is
          too big a share of your money.
        </p>
      )}
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
    worstCaseProfitCents: c.result.spread.worstCents,
    bestCaseProfitCents: c.result.spread.bestCents,
    standardDeviationCents: c.result.spread.stdDevCents,
    chanceToLoseOverHalf: c.result.spread.chanceLoseHalf,
    chanceToAtLeastDouble: c.result.spread.chanceDouble,
    roughTriesToBeAheadAt90Percent: triesToBeAhead(
      c.result.profitCents,
      c.result.spread.stdDevCents,
    ),
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
