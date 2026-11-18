"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, AlertItem, AlertKind } from "@/lib/alerts";
import { formatAgo } from "@/lib/format";
import { useMoney } from "./Money";
import { PRICES_UPDATED } from "./PriceRefresher";

/** Fired on window when alerts are added or deleted, so lists reload. */
const ALERTS_CHANGED = "imbalance:alerts-changed";

type Hit = {
  id: string;
  name: string;
  url: string;
  count: number;
  best: AlertItem;
};
type SavedAlert = Omit<Alert, "seen"> & { url: string };

const canNotify = () => typeof Notification !== "undefined";

/** Asks once, from a click: browsers only allow the question after a user action. */
async function askToNotify(): Promise<NotificationPermission | "unsupported"> {
  if (!canNotify()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Checks saved alerts when the app opens and after each background price update, then
 * shows a browser notification (when allowed) and a link in the header.
 */
export function AlertWatcher() {
  const { money } = useMoney();
  // Read through a ref: the check must not rerun whenever the currency changes.
  const moneyRef = useRef(money);
  useEffect(() => {
    moneyRef.current = money;
  });
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    let stop = false;
    async function check() {
      try {
        const res = await fetch("/api/alerts/check", { method: "POST" });
        if (!res.ok) return;
        const r = (await res.json()) as { hits: Hit[] };
        if (stop || !r.hits.length) return;
        setHits((h) => [...r.hits, ...h].slice(0, 10));
        // The Dashboard's list shows each alert's last find.
        window.dispatchEvent(new CustomEvent(ALERTS_CHANGED));
        if (canNotify() && Notification.permission === "granted")
          for (const hit of r.hits) {
            const n = new Notification(`Imbalance: ${hit.name}`, {
              body: `${hit.count} new. Best: ${hit.best.label}, profit ${moneyRef.current(hit.best.profitCents)} (${hit.best.roiPercent.toFixed(0)}%)`,
              tag: `imbalance-alert-${hit.id}`,
              icon: "/logo.svg",
            });
            n.onclick = () => {
              window.focus();
              window.location.href = hit.url;
            };
          }
      } catch {}
    }
    // Let the page load first: a check reruns every saved search.
    const first = setTimeout(check, 3000);
    const onPrices = () => void check();
    window.addEventListener(PRICES_UPDATED, onPrices);
    return () => {
      stop = true;
      clearTimeout(first);
      window.removeEventListener(PRICES_UPDATED, onPrices);
    };
  }, []);

  if (!hits.length) return null;
  const total = hits.reduce((s, h) => s + h.count, 0);
  return (
    <Link
      href={hits.length === 1 ? hits[0].url : "/#alerts"}
      onClick={() => setHits([])}
      className="rounded border border-good px-2 py-0.5 text-xs text-good"
      title={hits.map((h) => `${h.name}: ${h.count} new`).join("\n")}
    >
      {total} new find{total === 1 ? "" : "s"}
    </Link>
  );
}

/**
 * "Alert me" next to a search: saves it, with a bar results must clear. What it finds
 * right now doesn't alert; only later finds do.
 */
export function AlertMe({
  kind,
  query,
  defaultName,
}: {
  kind: AlertKind;
  /** The search's API query, built when the alert is saved. */
  query: () => string;
  defaultName: string;
}) {
  const { currency, rates } = useMoney();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [minRoi, setMinRoi] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [state, setState] = useState<{
    busy?: boolean;
    text?: string;
    ok?: boolean;
  }>({});

  if (!open)
    return (
      <>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setName(defaultName);
            setState({});
            setOpen(true);
          }}
          title="Get told when this search finds something new"
        >
          Alert me
        </button>
        {state.text && (
          <p
            role="status"
            className={`w-full text-sm ${state.ok ? "text-good" : "text-bad"}`}
          >
            {state.text}
          </p>
        )}
      </>
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    const permission = await askToNotify();
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          alert: {
            kind,
            name: name.trim() || defaultName,
            query: query(),
            minRoiPercent: minRoi ? Number(minRoi) : null,
            minProfitCents: minProfit
              ? Math.round((Number(minProfit) / (rates[currency] ?? 1)) * 100)
              : null,
          },
        }),
      });
      const r = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(r.error ?? "Saving the alert failed.");
      window.dispatchEvent(new CustomEvent(ALERTS_CHANGED));
      setOpen(false);
      setState({
        ok: true,
        text:
          permission === "granted"
            ? "Alert saved. You'll get a notification when it finds something new while the app is open."
            : "Alert saved. Notifications are off in this browser, so new finds show as a link in the header instead.",
      });
    } catch (err) {
      setState({
        ok: false,
        text: err instanceof Error ? err.message : "Saving the alert failed.",
      });
    }
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="panel flex w-full flex-wrap items-end gap-3 p-3 text-sm"
    >
      <p className="w-full text-muted">
        Get told when this search finds something new. Prices update every 10
        minutes while the app is open; it checks after each update.
      </p>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-muted">Name</span>
        <input
          className="input"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Only if return at least (%)</span>
        <input
          className="input w-24"
          inputMode="decimal"
          placeholder="Any"
          value={minRoi}
          onChange={(e) => setMinRoi(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">and profit at least ({currency})</span>
        <input
          className="input w-24"
          inputMode="decimal"
          placeholder="Any"
          value={minProfit}
          onChange={(e) => setMinProfit(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <button className="btn-primary" disabled={state.busy}>
        {state.busy ? "Saving..." : "Save alert"}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.text && (
        <p className={`w-full ${state.ok ? "text-good" : "text-bad"}`}>
          {state.text}
        </p>
      )}
    </form>
  );
}

/** Saved alerts on the Dashboard: what each watches, its last find, and Delete. */
export function AlertList() {
  const { money } = useMoney();
  const [alerts, setAlerts] = useState<SavedAlert[] | null>(null);
  const [permission, setPermission] = useState<string>("unsupported");

  const load = useCallback(async () => {
    const res = await fetch("/api/alerts");
    const r = (await res.json()) as { alerts: SavedAlert[] };
    setAlerts(r.alerts);
  }, []);

  useEffect(() => {
    const reload = () => void load().catch(() => {});
    reload();
    // Read after mount: the server render has no Notification API.
    const t = setTimeout(
      () =>
        setPermission(canNotify() ? Notification.permission : "unsupported"),
      0,
    );
    window.addEventListener(ALERTS_CHANGED, reload);
    window.addEventListener(PRICES_UPDATED, reload);
    return () => {
      clearTimeout(t);
      window.removeEventListener(ALERTS_CHANGED, reload);
      window.removeEventListener(PRICES_UPDATED, reload);
    };
  }, [load]);

  if (!alerts?.length) return null;
  return (
    <section id="alerts" className="panel space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Alerts</h2>
        {permission === "default" && (
          <button
            type="button"
            className="btn"
            onClick={() => void askToNotify().then(setPermission)}
          >
            Turn on notifications
          </button>
        )}
        {permission === "denied" && (
          <span className="text-muted">
            Notifications are blocked for this site in your browser; new finds
            show in the header instead.
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const bar = [
            a.minRoiPercent != null && `return ${a.minRoiPercent}%+`,
            a.minProfitCents != null && `profit ${money(a.minProfitCents)}+`,
          ].filter(Boolean);
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2"
            >
              <div>
                <Link
                  href={a.url}
                  className="font-medium text-accent underline"
                >
                  {a.name}
                </Link>
                <span className="ml-2 text-xs text-muted">
                  {a.kind === "tradeups" ? "Trade-ups" : "Deals"}
                  {bar.length ? `, ${bar.join(", ")}` : ""}
                </span>
                <span className="block text-xs text-muted">
                  {a.lastHit
                    ? `Last find ${formatAgo(a.lastHit.at)}: ${a.lastHit.count} new, best ${a.lastHit.label} at ${money(a.lastHit.profitCents)} profit`
                    : `Nothing new since it was saved ${formatAgo(a.createdAt)}`}
                </span>
              </div>
              <button
                type="button"
                className="text-bad underline"
                onClick={() =>
                  void fetch("/api/alerts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete", id: a.id }),
                  }).then(load)
                }
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
