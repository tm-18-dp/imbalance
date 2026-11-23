"use client";

import Image from "next/image";
import { useState } from "react";
import type { Deal } from "@/lib/deals";
import type { SteamPrice } from "@/lib/prices/steam";
import {
  isMarketplaceId,
  MARKETPLACES,
  steamNet,
  type MarketplaceId,
} from "@/lib/fees";
import { useMoney } from "./Money";
import { FloatSnipes } from "./FloatSnipes";
import { CrossMarketGaps } from "./CrossMarketGaps";
import { SizedCost, useBankroll } from "./Bankroll";
import { RiskPicker, useRiskProfile } from "./RiskPicker";
import { isRiskProfileId, RISK_PROFILES } from "@/lib/risk";
import { AskAi } from "./AskAi";
import { useSearchParams } from "next/navigation";
import { shownAmount, urlFlag, urlNumber } from "@/lib/filters";
import { PriceHistory, TrendBadge } from "./PriceHistory";
import { AlertMe } from "./Alerts";
import { WatchStar } from "./Watchlist";
import { SortTh, useSort } from "./SortTable";
import { nameColor } from "@/lib/rarity";

const NO_DEALS: Deal[] = [];
const dealRoi = (d: Deal) =>
  d.buyCents > 0 ? d.flipProfitCents / d.buyCents : 0;
const DEAL_COLUMNS = {
  buy: (d: Deal) => d.buyCents,
  usual: (d: Deal) => d.usualCents,
  below: (d: Deal) => d.discount,
  resell: (d: Deal) => d.resaleCents,
  sold: (d: Deal) => d.volume30d,
  profit: (d: Deal) => d.flipProfitCents,
  roi: dealRoi,
};

export function Deals() {
  const { money, rates, currency } = useMoney();
  // Filters can arrive in the URL from the Dashboard's plain-English search.
  const params = useSearchParams();
  const [market, setMarket] = useState<MarketplaceId>(() => {
    const m = params.get("market");
    return m && isMarketplaceId(m) ? m : "skinport";
  });
  // A risk level in the URL supplies the defaults for filters the URL leaves out.
  const urlRisk = params.get("risk");
  const start = RISK_PROFILES[isRiskProfileId(urlRisk) ? urlRisk : "safe"];
  const [minDiscount, setMinDiscount] = useState(() =>
    urlNumber(params, "minDiscount", String(start.dealMinDiscountPercent)),
  );
  const [minVolume, setMinVolume] = useState(() =>
    urlNumber(params, "minVolume", String(start.dealMinVolume30d)),
  );
  // Null until the user types: the URL's amount shows in the current currency.
  const [maxTyped, setMax] = useState<string | null>(null);
  const max = shownAmount(maxTyped, params, rates[currency] ?? 1);
  const [minTyped, setMin] = useState<string | null>(null);
  const min = shownAmount(minTyped, params, rates[currency] ?? 1, "min");
  const [q, setQ] = useState(() => params.get("q")?.slice(0, 100) ?? "");
  const [weapons, setWeapons] = useState(() =>
    urlFlag(params, "weapons", !start.dealIncludeNonWeapons),
  );
  const [dips, setDips] = useState(() => urlFlag(params, "dips", false));
  // Filters that came in the URL win over the saved profile's defaults on arrival.
  const urlHasFilters = ["minDiscount", "minVolume", "weapons"].some((k) =>
    params.has(k),
  );
  /** A profile fills in the filters; they stay editable afterwards. */
  const bankrollCents = useBankroll();
  const risk = useRiskProfile(params.get("risk"), (p, source) => {
    if (source === "saved" && urlHasFilters) return;
    setMinDiscount(String(p.dealMinDiscountPercent));
    setMinVolume(String(p.dealMinVolume30d));
    setWeapons(!p.dealIncludeNonWeapons);
  });
  const [chart, setChart] = useState<Deal | null>(null);
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    deals?: Deal[];
  }>({ loading: false });
  // Click a header to sort; the server's order (best flip profit first) until then.
  const sort = useSort(state.deals ?? NO_DEALS, DEAL_COLUMNS);

  /** The API query for the filters on screen; alerts save it too. */
  function scanQuery() {
    const usdMax = max ? Number(max) / (rates[currency] ?? 1) : 0;
    const usdMin = min ? Number(min) / (rates[currency] ?? 1) : 0;
    return new URLSearchParams({
      market,
      minDiscount,
      minVolume,
      max: String(usdMax || ""),
      min: String(usdMin || ""),
      q,
      weapons: weapons ? "1" : "0",
      dips: dips ? "1" : "0",
    });
  }

  async function scan() {
    setState({ loading: true });
    try {
      const params = scanQuery();
      const res = await fetch(`/api/deals?${params}`);
      const json = (await res.json()) as { error?: string; deals?: Deal[] };
      if (!res.ok) throw new Error(json.error ?? "Scan failed.");
      setState({ loading: false, deals: json.deals });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Scan failed.",
      });
    }
  }

  const num =
    (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
      set(e.target.value.replace(/[^\d.]/g, ""));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Deals</h1>
        <p className="text-sm text-muted">
          Skins listed on Skinport for less than they usually sell for (their
          30-day median), that sell often enough to flip. Profit is what you
          keep after reselling and paying the fee. If the price has slid in the
          last week or day, the resale price follows it down. Items you buy are
          usually trade locked for a week before you can resell them.
        </p>
      </div>

      {params.size > 0 && !state.deals && (
        <p role="status" className="panel border-accent p-3 text-sm">
          Filters set from your search. Check them, then click{" "}
          <strong>Find deals</strong>.
        </p>
      )}

      <RiskPicker profile={risk.profile} onChange={risk.choose} />

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Search</span>
          <input
            className="input w-44"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Any item"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Resell on</span>
          <select
            className="input"
            value={market}
            onChange={(e) => setMarket(e.target.value as MarketplaceId)}
          >
            {Object.values(MARKETPLACES).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Min % below usual</span>
          <input
            className="input w-20"
            inputMode="decimal"
            value={minDiscount}
            onChange={num(setMinDiscount)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Min sold in 30 days</span>
          <input
            className="input w-20"
            inputMode="numeric"
            value={minVolume}
            onChange={num(setMinVolume)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Min price ({currency})</span>
          <input
            className="input w-24"
            inputMode="decimal"
            value={min}
            onChange={num(setMin)}
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Max price ({currency})</span>
          <input
            className="input w-24"
            inputMode="decimal"
            value={max}
            onChange={num(setMax)}
            placeholder="Any"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={weapons}
            onChange={(e) => setWeapons(e.target.checked)}
          />
          Weapon skins only
        </label>
        <label
          className="flex items-center gap-2"
          title="Short drops against a steady long-term price, which tend to correct"
        >
          <input
            type="checkbox"
            checked={dips}
            onChange={(e) => setDips(e.target.checked)}
          />
          Dips only
        </label>
        <button
          className="btn-primary"
          disabled={state.loading}
          onClick={() => void scan()}
        >
          {state.loading ? "Scanning..." : "Find deals"}
        </button>
        <AlertMe
          kind="deals"
          query={() => scanQuery().toString()}
          defaultName={q ? `Deals: ${q}` : `${risk.profile.label} deals`}
        />
      </div>

      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.deals?.length === 0 && (
        <p className="text-sm text-muted">
          No deals right now. Lower the minimums, or update prices on the
          Dashboard.
        </p>
      )}

      {state.deals && state.deals.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="p-2 font-normal">Item</th>
                <SortTh k="buy" sort={sort}>
                  Buy now
                </SortTh>
                <SortTh k="usual" sort={sort}>
                  Usually
                </SortTh>
                <SortTh k="below" sort={sort}>
                  Below
                </SortTh>
                <SortTh
                  k="resell"
                  sort={sort}
                  title="What it should resell for: the 30-day median, or lower if the last 7 days or 24 hours sold for less"
                >
                  Resell at
                </SortTh>
                <SortTh k="sold" sort={sort}>
                  Sold 30d
                </SortTh>
                <SortTh k="profit" sort={sort}>
                  Flip profit
                </SortTh>
                <SortTh
                  k="roi"
                  sort={sort}
                  title="Flip profit as a share of the price you pay"
                >
                  Return
                </SortTh>
                <th className="p-2 font-normal">Steam</th>
              </tr>
            </thead>
            <tbody>
              {sort.sorted.map((d) => (
                <tr
                  key={`${d.marketHashName}|${d.version}`}
                  className="border-t border-line"
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {d.image && (
                        <Image
                          src={d.image}
                          alt=""
                          width={64}
                          height={48}
                          className="h-8 w-auto"
                        />
                      )}
                      <span>
                        <a
                          className="hover:underline"
                          style={{
                            color: nameColor(d.marketHashName, d.rarity),
                          }}
                          href={`https://skinport.com/market?search=${encodeURIComponent(d.marketHashName)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {d.marketHashName}
                          {d.version ? ` (${d.version})` : ""}
                        </a>
                        <WatchStar
                          name={d.marketHashName}
                          version={d.version}
                        />
                        <TrendBadge trend={d.trend} />
                        <button
                          className="ml-2 text-xs text-accent underline"
                          onClick={() => setChart(d)}
                        >
                          Chart
                        </button>
                      </span>
                    </div>
                  </td>
                  <td className="p-2">
                    <SizedCost
                      costCents={d.buyCents}
                      bankrollCents={bankrollCents}
                    >
                      {money(d.buyCents)}
                    </SizedCost>
                  </td>
                  <td className="p-2">{money(d.usualCents)}</td>
                  <td className="p-2">{Math.round(d.discount * 100)}%</td>
                  <td className="p-2">{money(d.resaleCents)}</td>
                  <td
                    className={`p-2 ${d.volume30d < RISK_PROFILES.safe.dealMinVolume30d ? "text-bad" : ""}`}
                    title={
                      d.volume30d < RISK_PROFILES.safe.dealMinVolume30d
                        ? "Sells rarely: the usual price is less reliable and it may take a while to resell"
                        : undefined
                    }
                  >
                    {d.volume30d}
                  </td>
                  <td className="p-2 font-medium text-good">
                    {money(d.flipProfitCents)}
                  </td>
                  <td className="p-2">{Math.round(dealRoi(d) * 100)}%</td>
                  <td className="p-2">
                    <SteamCheck name={d.marketHashName} buyCents={d.buyCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CrossMarketGaps />

      <FloatSnipes />

      {chart && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Price history: ${chart.marketHashName}`}
          className="fixed inset-0 z-10 flex justify-end bg-black/60"
          onClick={() => setChart(null)}
        >
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-panel p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn float-right"
              onClick={() => setChart(null)}
              autoFocus
            >
              Close
            </button>
            <h2 className="mb-3 text-lg font-semibold">
              {chart.marketHashName}
              {chart.version ? ` (${chart.version})` : ""}
            </h2>
            <PriceHistory name={chart.marketHashName} version={chart.version} />
            <div className="mt-4">
              <AskAi topic="deal" data={chart} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Looks up the Steam price for one item on click (Steam limits how often we can ask). */
function SteamCheck({ name, buyCents }: { name: string; buyCents: number }) {
  const { money } = useMoney();
  const [state, setState] = useState<{
    loading?: boolean;
    error?: string;
    price?: SteamPrice;
  } | null>(null);

  async function check() {
    setState({ loading: true });
    try {
      const res = await fetch(
        `/api/steam-price?name=${encodeURIComponent(name)}`,
      );
      const json = (await res.json()) as SteamPrice & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Steam didn't answer.");
      setState({ price: json });
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : "Steam didn't answer.",
      });
    }
  }

  if (!state)
    return (
      <button className="text-accent underline" onClick={() => void check()}>
        Check
      </button>
    );
  if (state.loading) return <span className="text-muted">...</span>;
  if (state.error || !state.price)
    return <span className="text-bad">{state.error}</span>;
  const lowest = state.price.lowestCents;
  if (lowest == null) return <span className="text-muted">Not listed</span>;
  // Undercut the lowest Steam listing by a cent, then Steam takes its fees.
  const profit = steamNet(lowest - 1) - buyCents;
  return (
    <span title={`${state.price.volume24h} sold on Steam in 24 h`}>
      {money(lowest)}{" "}
      <span className={profit > 0 ? "text-good" : "text-bad"}>
        ({profit > 0 ? "+" : ""}
        {money(profit)} on Steam)
      </span>
    </span>
  );
}
