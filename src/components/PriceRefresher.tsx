"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AUTO_CHECK_MS, AUTO_REFRESH_MS } from "@/lib/auto-refresh";
import { formatAgo } from "@/lib/format";

const STORAGE_KEY = "imbalance-auto-refresh";
/** Fired on window after a background update, so open pages can reload. */
export const PRICES_UPDATED = "imbalance:prices-updated";

type Reply = {
  skipped?: boolean;
  syncedAt?: number | null;
  items?: number;
  error?: string;
};

function savedOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function saveOn(next: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

/**
 * Keeps Skinport prices fresh while the app is open: every minute a visible page asks the
 * server, which updates when prices are 10 minutes old. Hidden tabs don't ask. On by
 * default, remembered per browser.
 */
export function PriceRefresher() {
  const on = useSyncExternalStore(subscribe, savedOn, () => true);
  const [state, setState] = useState<{
    syncedAt: number | null;
    updating: boolean;
    failed: boolean;
  }>({ syncedAt: null, updating: false, failed: false });

  useEffect(() => {
    if (!on) return;
    let stop = false;
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        // A real update takes a few seconds; show it only if it is one.
        const slow = setTimeout(
          () => !stop && setState((s) => ({ ...s, updating: true })),
          800,
        );
        const res = await fetch("/api/sync/prices?auto=1", { method: "POST" });
        clearTimeout(slow);
        const r = (await res.json()) as Reply;
        if (stop) return;
        setState({
          syncedAt: r.syncedAt ?? null,
          updating: false,
          failed: !res.ok,
        });
        if (res.ok && !r.skipped)
          window.dispatchEvent(new CustomEvent(PRICES_UPDATED));
      } catch {
        if (!stop) setState((s) => ({ ...s, updating: false, failed: true }));
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = setInterval(check, AUTO_CHECK_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [on]);

  const minutes = AUTO_REFRESH_MS / 60_000;
  const status = !on
    ? "Auto prices off"
    : state.updating
      ? "Updating prices..."
      : state.failed
        ? "Price update failed"
        : state.syncedAt
          ? `Prices ${formatAgo(state.syncedAt)}`
          : "Auto prices";
  return (
    <label
      className={`flex items-center gap-1.5 text-xs ${on && state.failed ? "text-bad" : "text-muted"}`}
      title={
        on
          ? `Updates Skinport prices every ${minutes} minutes while a page is open (after your first update on the Dashboard). ${state.failed ? "The last try failed; it tries again in " + minutes + " minutes." : ""}`.trim()
          : `Turn on to update Skinport prices every ${minutes} minutes while a page is open.`
      }
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => saveOn(e.target.checked)}
        aria-label="Update prices automatically"
      />
      <span role="status">{status}</span>
    </label>
  );
}
