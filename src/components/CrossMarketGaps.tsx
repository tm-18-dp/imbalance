"use client";

import { useState } from "react";
import { MARKETPLACES } from "@/lib/fees";
import type { Gap, Quote } from "@/lib/gaps";
import { useMoney } from "./Money";
import { SizedCost, useBankroll } from "./Bankroll";

type Item = {
  marketHashName: string;
  volume30d: number;
  quotes: Quote[];
  gaps: Gap[];
};
type Reply = { items: Item[]; missingSteam: string[]; csfloatKey: boolean };

/** Steam allows about 20 price checks a minute; stay well under it. */
const STEAM_GAP_MS = 3500;
const CSFLOAT_GAP_MS = 400;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Buy on one marketplace, sell on another. Steam prices are looked up slowly first (Steam
 * only allows a few a minute), then every buy-here, sell-there pair is compared after the
 * selling fee. Selling on Steam pays wallet money that can't be withdrawn, so it's opt-in
 * and valued at a share of cash the user picks.
 */
export function CrossMarketGaps() {
  const { money, rates, currency } = useMoney();
  const bankrollCents = useBankroll();
  const [q, setQ] = useState("");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("");
  const [items, setItems] = useState("10");
  const [steamSell, setSteamSell] = useState(false);
  const [walletValue, setWalletValue] = useState("100");
  const [state, setState] = useState<{
    loading: boolean;
    progress?: string;
    error?: string;
    reply?: Reply;
  }>({ loading: false });

  const num =
    (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
      set(e.target.value.replace(/[^\d.]/g, ""));

  async function load(): Promise<Reply> {
    const usd = (v: string) =>
      v ? String(Number(v) / (rates[currency] ?? 1)) : "";
    const params = new URLSearchParams({
      q,
      min: usd(min),
      max: usd(max),
      items,
      steamSell: steamSell ? "1" : "0",
      walletValue,
    });
    const res = await fetch(`/api/gaps?${params}`);
    if (!res.ok) throw new Error("Comparing prices failed.");
    return (await res.json()) as Reply;
  }

  async function run() {
    setState({ loading: true, progress: "Loading prices..." });
    try {
      let reply = await load();
      const steam = reply.missingSteam;
      for (let i = 0; i < steam.length; i++) {
        setState({
          loading: true,
          progress: `Checking Steam prices: ${i} of ${steam.length} (Steam allows only a few a minute).`,
        });
        if (i > 0) await wait(STEAM_GAP_MS);
        const res = await fetch(
          `/api/steam-price?name=${encodeURIComponent(steam[i])}`,
        );
        if (!res.ok) {
          setState({
            loading: true,
            progress: "Steam stopped answering. Comparing what there is.",
          });
          break;
        }
      }
      if (reply.csfloatKey) {
        for (let i = 0; i < reply.items.length; i++) {
          setState({
            loading: true,
            progress: `Checking CSFloat listings: ${i} of ${reply.items.length}.`,
          });
          if (i > 0) await wait(CSFLOAT_GAP_MS);
          const res = await fetch(
            `/api/listings?name=${encodeURIComponent(reply.items[i].marketHashName)}`,
          );
          if (!res.ok) break;
        }
      }
      if (steam.length || reply.csfloatKey) reply = await load();
      setState({ loading: false, reply });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Comparing prices failed.",
      });
    }
  }

  const rows = (state.reply?.items ?? [])
    .flatMap((it) => it.gaps.map((g) => ({ item: it, gap: g })))
    .sort((a, b) => b.gap.profitCents - a.gap.profitCents);

  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div>
        <h2 className="text-lg font-semibold">Cross-market gaps</h2>
        <p className="text-muted">
          Buy on one marketplace, sell on another, after the selling fee. Items
          you buy are usually trade locked for about a week first, so the price
          can move before you sell.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Search</span>
          <input
            className="input w-44"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Most traded items"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Min price ({currency})</span>
          <input
            className="input w-20"
            inputMode="decimal"
            value={min}
            onChange={num(setMin)}
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
        <label className="flex flex-col gap-1">
          <span
            className="text-muted"
            title="Each item needs a Steam price check, about 3.5 seconds each the first time"
          >
            Items to compare
          </span>
          <select
            className="input"
            value={items}
            onChange={(e) => setItems(e.target.value)}
          >
            {["5", "10", "20", "30"].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label
          className="flex items-center gap-2"
          title="Steam pays Steam wallet money, which you can spend on Steam but can't withdraw"
        >
          <input
            type="checkbox"
            checked={steamSell}
            onChange={(e) => setSteamSell(e.target.checked)}
          />
          Include selling on Steam
        </label>
        {steamSell && (
          <label className="flex flex-col gap-1">
            <span
              className="text-muted"
              title="What a dollar of Steam wallet money is worth to you in cash"
            >
              Steam money worth (% of cash)
            </span>
            <input
              className="input w-20"
              inputMode="numeric"
              value={walletValue}
              onChange={num(setWalletValue)}
            />
          </label>
        )}
        <button className="btn-primary" disabled={state.loading} onClick={run}>
          {state.loading ? "Comparing..." : "Compare markets"}
        </button>
      </div>

      {steamSell && (
        <p className="text-bad">
          Selling on Steam pays Steam wallet money: you can spend it on Steam
          but can&apos;t withdraw it. Set what it&apos;s worth to you above.
        </p>
      )}
      {state.loading && state.progress && (
        <p className="text-muted" role="status">
          {state.progress}
        </p>
      )}
      {state.error && <p className="text-bad">{state.error}</p>}
      {state.reply && !state.reply.csfloatKey && (
        <p className="text-muted">
          CSFloat isn&apos;t included: add a free CSFloat key (API keys, top
          right) to compare it too.
        </p>
      )}
      {state.reply && rows.length === 0 && (
        <p className="text-muted">
          No gaps after fees across {state.reply.items.length} items right now.
          Marketplaces usually track each other closely; try more items or a
          search.
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="p-2 font-normal">Item</th>
                <th className="p-2 font-normal">Buy on</th>
                <th className="p-2 font-normal">Sell on</th>
                <th className="p-2 font-normal">After fee</th>
                <th className="p-2 font-normal">Profit</th>
                <th className="p-2 font-normal">Sold 30d</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, gap }) => (
                <tr
                  key={`${item.marketHashName}|${gap.buyOn}|${gap.sellOn}`}
                  className="border-t border-line"
                >
                  <td className="p-2">{item.marketHashName}</td>
                  <td className="p-2">
                    {MARKETPLACES[gap.buyOn].label}{" "}
                    <SizedCost
                      costCents={gap.buyCents}
                      bankrollCents={bankrollCents}
                    >
                      {money(gap.buyCents)}
                    </SizedCost>
                  </td>
                  <td className="p-2">
                    {MARKETPLACES[gap.sellOn].label}{" "}
                    {gap.sellIsEstimate ? "about " : ""}
                    {money(gap.sellCents)}
                    {gap.paidInWallet && (
                      <span className="block text-xs text-bad">
                        Steam wallet money
                      </span>
                    )}
                  </td>
                  <td className="p-2">{money(gap.netCents)}</td>
                  <td className="p-2 font-medium text-good">
                    {money(gap.profitCents)} ({Math.round(gap.margin * 100)}%)
                  </td>
                  <td className="p-2">{item.volume30d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
