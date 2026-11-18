"use client";

import Image from "next/image";
import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import type { WatchedItem } from "@/lib/watchlist";
import { useMoney } from "./Money";
import { PriceHistory, TrendBadge } from "./PriceHistory";
import { PRICES_UPDATED } from "./PriceRefresher";

/**
 * One shared copy of the watchlist for every star on the page, loaded once and updated
 * as stars are clicked.
 */
type Snapshot = { items: WatchedItem[] | null; error?: string };
let snapshot: Snapshot = { items: null };
let loading = false;
const listeners = new Set<() => void>();
const set = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((l) => l());
};
const keyOf = (name: string, version = "") => `${name}|${version}`;

async function load() {
  if (loading) return;
  loading = true;
  try {
    const res = await fetch("/api/watchlist");
    const r = (await res.json()) as { items: WatchedItem[] };
    set({ items: r.items });
  } catch {
    set({ ...snapshot, items: snapshot.items ?? [] });
  } finally {
    loading = false;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (snapshot.items == null) void load();
  return () => listeners.delete(l);
}
const SERVER: Snapshot = { items: null };

function useWatchlist() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER,
  );
}

async function toggle(name: string, version: string, on: boolean) {
  const res = await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: on ? "add" : "remove", name, version }),
  });
  if (!res.ok) {
    const r = (await res.json()) as { error?: string };
    set({ ...snapshot, error: r.error ?? "Starring failed." });
    return;
  }
  await load();
}

/** Star to follow an item's price on the Dashboard. */
export function WatchStar({
  name,
  version = "",
}: {
  name: string;
  version?: string;
}) {
  const { items, error } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const on =
    items?.some(
      (i) => keyOf(i.marketHashName, i.version) === keyOf(name, version),
    ) ?? false;
  return (
    <button
      type="button"
      className={`ml-1.5 align-baseline text-base leading-none ${on ? "text-accent" : "text-muted hover:text-text"}`}
      aria-pressed={on}
      aria-label={on ? `Unstar ${name}` : `Star ${name} to watch its price`}
      title={
        error ??
        (on
          ? "On your watchlist (Dashboard). Click to remove."
          : "Watch this item's price on the Dashboard")
      }
      disabled={busy || items == null}
      onClick={() => {
        setBusy(true);
        void toggle(name, version, !on).finally(() => setBusy(false));
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

const pctChange = (now: number | null, then: number | null) =>
  now != null && then != null && then > 0 ? now / then - 1 : null;

function Change({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">-</span>;
  const tone =
    value > 0.005 ? "text-good" : value < -0.005 ? "text-bad" : "text-muted";
  return (
    <span className={tone}>
      {value > 0 ? "+" : ""}
      {(value * 100).toFixed(1)}%
    </span>
  );
}

/** Starred items on the Dashboard: price now, usual price, trend and change since starred. */
export function WatchlistPanel() {
  const { money } = useMoney();
  const { items, error } = useWatchlist();
  const [chart, setChart] = useState<string | null>(null);

  // Prices change under the list after each background update.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(PRICES_UPDATED, reload);
    return () => window.removeEventListener(PRICES_UPDATED, reload);
  }, []);

  if (items == null) return null;
  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div>
        <h2 className="font-semibold">Watchlist ({items.length})</h2>
        <p className="text-muted">
          {items.length
            ? "Skinport prices of the items you starred. The usual price is the 30-day sales median."
            : "Star an item (☆) on Deals, Skins, Trade-ups or the Tracker to follow its price here."}
        </p>
        {error && <p className="text-bad">{error}</p>}
      </div>
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="p-2 font-normal">Item</th>
                <th className="p-2 font-normal">Lowest now</th>
                <th className="p-2 font-normal">Usual</th>
                <th
                  className="p-2 font-normal"
                  title="7-day sales median against the 30-day one"
                >
                  This week
                </th>
                <th
                  className="p-2 font-normal"
                  title="Lowest listing now against when you starred it"
                >
                  Since starred
                </th>
                <th className="p-2 font-normal">Sold 30d</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const key = keyOf(i.marketHashName, i.version);
                return (
                  <Fragment key={key}>
                    <tr className="border-t border-line align-top">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {i.image && (
                            <Image
                              src={i.image}
                              alt=""
                              width={64}
                              height={48}
                              className="h-8 w-auto"
                            />
                          )}
                          <span>
                            {i.marketHashName}
                            {i.version ? ` (${i.version})` : ""}
                            {i.pricedVersion && (
                              <span
                                className="block text-xs text-muted"
                                title="Skinport only lists this item by phase. Prices are for the cheapest phase listed now."
                              >
                                Cheapest phase now: {i.pricedVersion}
                              </span>
                            )}
                            <WatchStar
                              name={i.marketHashName}
                              version={i.version}
                            />
                            <TrendBadge trend={i.trend} />
                            <button
                              type="button"
                              className="ml-2 text-xs text-accent underline"
                              aria-expanded={chart === key}
                              onClick={() =>
                                setChart(chart === key ? null : key)
                              }
                            >
                              {chart === key ? "Hide chart" : "Chart"}
                            </button>
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        {i.nowCents == null ? (
                          <span className="text-muted">None listed</span>
                        ) : (
                          money(i.nowCents)
                        )}
                        <span className="block text-xs text-muted">
                          {i.listed} listed
                        </span>
                      </td>
                      <td className="p-2">{money(i.median30d)}</td>
                      <td className="p-2">
                        <Change value={pctChange(i.median7d, i.median30d)} />
                      </td>
                      <td className="p-2">
                        <Change value={pctChange(i.nowCents, i.addedCents)} />
                      </td>
                      <td className="p-2">{i.volume30d}</td>
                    </tr>
                    {chart === key && (
                      <tr>
                        <td colSpan={6} className="p-2">
                          <PriceHistory
                            name={i.marketHashName}
                            version={i.version}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
