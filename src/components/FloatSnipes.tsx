"use client";

import { useState } from "react";
import type { Snipe } from "@/lib/snipes";
import { useMoney } from "./Money";
import { SizedCost, useBankroll } from "./Bankroll";
import { PatternBadge, useUserPatterns } from "./PatternBadge";

type ApiSnipe = Snipe & { volume30d: number };

/**
 * CSFloat listings with a float collectors pay extra for, priced close to an ordinary
 * float of the same item. The premium isn't priced: the page shows how little extra each
 * one costs, and the buyer judges what the float is worth.
 */
export function FloatSnipes() {
  const { money, rates, currency } = useMoney();
  const bankrollCents = useBankroll();
  const userPatterns = useUserPatterns();
  const [q, setQ] = useState("");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("");
  const [items, setItems] = useState("10");
  const [maxOver, setMaxOver] = useState("15");
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    needsKey?: boolean;
    snipes?: ApiSnipe[];
    checked?: number;
    candidates?: number;
    stopped?: string;
  }>({ loading: false });

  const num =
    (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
      set(e.target.value.replace(/[^\d.]/g, ""));

  async function scan() {
    setState({ loading: true });
    const usd = (v: string) =>
      v ? String(Number(v) / (rates[currency] ?? 1)) : "";
    try {
      const params = new URLSearchParams({
        q,
        min: usd(min),
        max: usd(max),
        items,
        maxOver,
      });
      const res = await fetch(`/api/snipes?${params}`);
      const json = (await res.json()) as {
        error?: string;
        needsKey?: boolean;
        snipes?: ApiSnipe[];
        checked?: number;
        candidates?: number;
        stopped?: string;
      };
      if (!res.ok)
        return setState({
          loading: false,
          error: json.error ?? "CSFloat didn't answer.",
          needsKey: json.needsKey,
        });
      setState({ loading: false, ...json });
    } catch {
      setState({ loading: false, error: "CSFloat didn't answer. Try again." });
    }
  }

  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div>
        <h2 className="text-lg font-semibold">Float snipes</h2>
        <p className="text-muted">
          CSFloat listings with a float collectors pay extra for (0.00x, best of
          a wear, the lowest or highest a skin can roll), priced close to an
          ordinary float of the same item. Imbalance can&apos;t price the extra
          a collector would pay: it shows how little extra you pay, and you
          judge the rest.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-muted">Search</span>
          <input
            className="input w-44"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Most traded skins"
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
            title="Each skin not checked in the last 10 minutes costs two CSFloat requests"
          >
            Skins to check
          </span>
          <select
            className="input"
            value={items}
            onChange={(e) => setItems(e.target.value)}
          >
            {["5", "10", "20"].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Max extra paid (%)</span>
          <input
            className="input w-20"
            inputMode="decimal"
            value={maxOver}
            onChange={num(setMaxOver)}
          />
        </label>
        <button className="btn-primary" disabled={state.loading} onClick={scan}>
          {state.loading ? "Checking CSFloat..." : "Find float snipes"}
        </button>
      </div>

      {state.error && (
        <p className={state.needsKey ? "text-muted" : "text-bad"}>
          {state.error}
        </p>
      )}
      {state.checked != null && (
        <p className="text-muted">
          Checked {state.checked} of {state.candidates} skins.
          {state.stopped && ` Stopped early: ${state.stopped}`}
        </p>
      )}
      {state.snipes?.length === 0 && (
        <p className="text-muted">
          No special floats priced close to ordinary ones right now. Raise the
          max extra paid, or check more skins.
        </p>
      )}
      {state.snipes && state.snipes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="p-2 font-normal">Item</th>
                <th className="p-2 font-normal">Float</th>
                <th className="p-2 font-normal">Price</th>
                <th
                  className="p-2 font-normal"
                  title="The lower of Skinport's usual sale price and CSFloat's cheapest ordinary-float listing"
                >
                  Ordinary float
                </th>
                <th className="p-2 font-normal">Extra paid</th>
                <th className="p-2 font-normal">Sold 30d</th>
                <th className="p-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {state.snipes.map((s) => (
                <tr key={s.listing.id} className="border-t border-line">
                  <td className="p-2">
                    {s.listing.marketHashName}
                    <PatternBadge
                      name={s.listing.marketHashName}
                      seed={s.listing.paintSeed}
                      patterns={userPatterns.patterns}
                    />
                  </td>
                  <td className="p-2">
                    <span className="font-mono">
                      {s.listing.float.toFixed(5)}
                    </span>
                    <span className="ml-1 inline-flex flex-wrap gap-1">
                      {s.flags.map((f) => (
                        <span
                          key={f.label}
                          title={f.detail}
                          className={`rounded border px-1 text-xs ${f.rare ? "border-good text-good" : "border-accent text-accent"}`}
                        >
                          {f.label}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="p-2">
                    <SizedCost
                      costCents={s.listing.priceCents}
                      bankrollCents={bankrollCents}
                    >
                      {money(s.listing.priceCents)}
                    </SizedCost>
                  </td>
                  <td className="p-2">{money(s.referenceCents)}</td>
                  <td
                    className={`p-2 ${s.overReference <= 0 ? "text-good" : ""}`}
                  >
                    {s.overReference <= 0
                      ? `${Math.round(-s.overReference * 100)}% less`
                      : `${Math.round(s.overReference * 100)}% more`}
                  </td>
                  <td className="p-2">{s.volume30d}</td>
                  <td className="p-2">
                    <a
                      className="text-accent underline"
                      href={s.listing.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
