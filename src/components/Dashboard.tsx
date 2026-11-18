"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Status } from "@/lib/queries";
import type { NextStep } from "@/lib/timeline";
import { NextSteps } from "./Tracker";
import { AskAi } from "./AskAi";
import { PlainSearch } from "./PlainSearch";
import { formatAgo } from "@/lib/format";
import { PRICES_UPDATED } from "./PriceRefresher";
import { AlertList } from "./Alerts";

type FullStatus = Status & {
  keys: Record<string, boolean>;
  pricesCooldownMs: number;
};

export function Dashboard() {
  const [status, setStatus] = useState<FullStatus | null>(null);
  const [busy, setBusy] = useState<"catalog" | "prices" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/status");
    setStatus((await res.json()) as FullStatus);
  }, []);

  // A background price update (header) changes the counts and "Updated" time.
  useEffect(() => {
    const reload = () => void load().catch(() => {});
    window.addEventListener(PRICES_UPDATED, reload);
    return () => window.removeEventListener(PRICES_UPDATED, reload);
  }, [load]);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json() as Promise<FullStatus>)
      .then(setStatus)
      .catch(() =>
        setMessage({
          ok: false,
          text: "Could not load the status. Is the app still running?",
        }),
      );
  }, []);

  async function sync(kind: "catalog" | "prices") {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/sync/${kind}`, { method: "POST" });
      const json = (await res.json()) as {
        error?: string;
        skins?: number;
        items?: number;
      };
      if (!res.ok) throw new Error(json.error ?? "Update failed.");
      setMessage({
        ok: true,
        text:
          kind === "catalog"
            ? `Skin list updated: ${json.skins} skins.`
            : `Prices updated: ${json.items} items.`,
      });
      await load();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Update failed.",
      });
    } finally {
      setBusy(null);
    }
  }

  const empty = status && status.skins === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">
          Update the skin list and prices, then look for trade-ups and deals.
          Log what you buy on the Tracker page.
        </p>
      </div>

      <TrackerSteps />

      <section className="panel space-y-2 p-4">
        <h2 className="font-semibold">Ask the AI</h2>
        <p className="text-sm text-muted">
          Uses your own Gemini, Groq or OpenRouter key. Describe what to find
          and it opens the right page with the filters set, or ask a question
          about your Tracker below.
        </p>
        <PlainSearch />
        <AskAi
          topic="question"
          needsQuestion
          placeholder="e.g. Which of my skins should I sell first?"
        />
      </section>

      {empty && (
        <div className="panel border-accent p-4 text-sm">
          <strong>First time here?</strong> Click <em>Update skin list</em>,
          then <em>Update prices</em>. It takes under a minute.
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`text-sm ${message.ok ? "text-good" : "text-bad"}`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-4">
          <h2 className="font-semibold">Skin list</h2>
          <p className="mt-1 text-sm text-muted">
            {status
              ? `${status.skins} skins in ${status.collections} collections`
              : "Loading..."}
            <br />
            Updated {formatAgo(status?.catalogSyncedAt ?? null)}
          </p>
          <button
            className="btn-primary mt-3"
            disabled={busy !== null}
            onClick={() => void sync("catalog")}
          >
            {busy === "catalog" ? "Updating..." : "Update skin list"}
          </button>
        </div>
        <div className="panel p-4">
          <h2 className="font-semibold">Prices (Skinport)</h2>
          <p className="mt-1 text-sm text-muted">
            {status
              ? `${status.prices} prices, ${status.snapshots} saved for charts`
              : "Loading..."}
            <br />
            Updated {formatAgo(status?.pricesSyncedAt ?? null)}
          </p>
          <button
            className="btn-primary mt-3"
            disabled={busy !== null}
            onClick={() => void sync("prices")}
          >
            {busy === "prices" ? "Updating..." : "Update prices"}
          </button>
          {status && status.pricesCooldownMs > 0 && (
            <p className="mt-2 text-xs text-muted">
              Skinport allows one refresh every 5 minutes. Next in{" "}
              {Math.ceil(status.pricesCooldownMs / 60_000)} min.
            </p>
          )}
        </div>
      </div>

      <AlertList />

      {status && !empty && (
        <Link href="/catalog" className="btn inline-block">
          Browse skins
        </Link>
      )}
    </div>
  );
}

/** Next steps from the tracker, if the user has logged anything. */
function TrackerSteps() {
  const [data, setData] = useState<{
    steps: NextStep[];
    comeBackAt: number | null;
  } | null>(null);
  useEffect(() => {
    fetch("/api/tracker")
      .then(
        (r) =>
          r.json() as Promise<{ steps: NextStep[]; comeBackAt: number | null }>,
      )
      .then(setData)
      .catch(() => setData(null));
  }, []);
  return data ? (
    <NextSteps steps={data.steps} comeBackAt={data.comeBackAt} />
  ) : null;
}
