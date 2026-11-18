"use client";

import { useCallback, useEffect, useState } from "react";
import { MARKETPLACES } from "@/lib/fees";
import { formatAgo } from "@/lib/format";
import { RISK_PROFILE_IDS, RISK_PROFILES } from "@/lib/risk";
import type { BotSummary, SimBot, SimPosition } from "@/lib/sim";
import { TIERS, type Tier } from "@/lib/tradeup";
import { useMoney } from "./Money";
import { PRICES_UPDATED } from "./PriceRefresher";

/** Fired on window when bots traded, so the page reloads. */
const SIMS_UPDATED = "imbalance:sims-updated";

type ApiBot = SimBot & {
  summary: BotSummary;
  positions: (SimPosition & { valueCents: number | null; inHold: boolean })[];
  history: { at: number; valueCents: number }[];
};

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

async function post(body: unknown) {
  const res = await fetch("/api/sims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const r = (await res.json()) as {
    error?: string;
    report?: { note: string | null; bought: unknown[]; sold: unknown[] };
  };
  if (!res.ok) throw new Error(r.error ?? "That didn't work.");
  return r;
}

/**
 * Gives practice bots their turn when the app opens and after each price update, from
 * whichever page is open. Shows nothing.
 */
export function SimRunner() {
  useEffect(() => {
    async function run() {
      try {
        const res = await fetch("/api/sims/run", { method: "POST" });
        const r = (await res.json()) as { ran?: number };
        if (r.ran) window.dispatchEvent(new CustomEvent(SIMS_UPDATED));
      } catch {}
    }
    const first = setTimeout(run, 5000);
    const onPrices = () => void run();
    window.addEventListener(PRICES_UPDATED, onPrices);
    return () => {
      clearTimeout(first);
      window.removeEventListener(PRICES_UPDATED, onPrices);
    };
  }, []);
  return null;
}

export function Simulator() {
  const [bots, setBots] = useState<ApiBot[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/sims");
    setBots(((await res.json()) as { bots: ApiBot[] }).bots);
  }, []);

  useEffect(() => {
    const reload = () => void load().catch(() => {});
    reload();
    window.addEventListener(SIMS_UPDATED, reload);
    window.addEventListener(PRICES_UPDATED, reload);
    return () => {
      window.removeEventListener(SIMS_UPDATED, reload);
      window.removeEventListener(PRICES_UPDATED, reload);
    };
  }, [load]);

  async function act(
    body: unknown,
    done: (r: Awaited<ReturnType<typeof post>>) => string,
  ) {
    setMessage(null);
    try {
      const r = await post(body);
      await load();
      setMessage({ ok: true, text: done(r) });
      return true;
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "That didn't work.",
      });
      return false;
    }
  }

  const reportText = (r: Awaited<ReturnType<typeof post>>) => {
    const rep = r.report;
    if (!rep) return "Done.";
    const parts = [];
    if (rep.sold.length) parts.push(`sold ${rep.sold.length}`);
    if (rep.bought.length) parts.push(`bought ${rep.bought.length}`);
    return parts.length
      ? `The bot ${parts.join(" and ")}.`
      : (rep.note ?? "Nothing to do right now.");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Simulator</h1>
        <p className="text-sm text-muted">
          Practice bots trade with pretend money at real Skinport prices, using
          the app&apos;s own Trade-ups or Deals picks, so you can see how a
          strategy really does before risking money. Everything follows real
          rules: buys at the lowest listing, the 7-day trade hold, the usual
          time to sell, and the selling fee. Trade-up results are rolled with
          the app&apos;s odds, like the real thing. Bots trade after each price
          update while the app is open, so results build up over weeks.
        </p>
      </div>

      {message && (
        <p
          role="status"
          className={`text-sm ${message.ok ? "text-good" : "text-bad"}`}
        >
          {message.text}
        </p>
      )}

      <NewBot
        onCreate={(bot) =>
          act({ action: "create", bot }, (r) => `Bot started. ${reportText(r)}`)
        }
      />

      {bots?.length === 0 && (
        <p className="text-sm text-muted">
          No bots yet. Start one above: for example a Safe deals bot and an
          Aggressive trade-up bot side by side, to compare.
        </p>
      )}
      {bots?.map((b) => (
        <BotCard
          key={b.id}
          bot={b}
          onRun={() => act({ action: "run", id: b.id }, reportText)}
          onToggle={() =>
            act({ action: b.active ? "pause" : "resume", id: b.id }, () =>
              b.active ? "Paused." : "Running again.",
            )
          }
          onDelete={() => {
            if (
              confirm(
                `Delete ${b.name} and its whole history? This can't be undone.`,
              )
            )
              void act({ action: "delete", id: b.id }, () => "Deleted.");
          }}
        />
      ))}
    </div>
  );
}

function NewBot({
  onCreate,
}: {
  onCreate: (bot: Record<string, unknown>) => Promise<boolean>;
}) {
  const { currency, rates } = useMoney();
  const [strategy, setStrategy] = useState<"tradeups" | "deals">("tradeups");
  const [tier, setTier] = useState<Tier>("Restricted");
  const [risk, setRisk] = useState<string>("safe");
  const [start, setStart] = useState("100");
  const [share, setShare] = useState("25");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const auto = `${RISK_PROFILES[risk as "safe"].label} ${strategy === "tradeups" ? `${tier} trade-ups` : "deals"}`;

  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onCreate({
          name: name.trim() || auto,
          strategy,
          tier: strategy === "tradeups" ? tier : null,
          risk,
          market: "skinport",
          startCents: Math.round(
            (Number(start) / (rates[currency] ?? 1)) * 100,
          ),
          maxBuyShare: Math.min(100, Math.max(1, Number(share) || 25)) / 100,
        }).then((ok) => {
          setBusy(false);
          if (ok) setName("");
        });
      }}
    >
      <h2 className="w-full font-semibold">Start a practice bot</h2>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Strategy</span>
        <select
          className="input"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as "tradeups" | "deals")}
        >
          <option value="tradeups">Trade-ups</option>
          <option value="deals">Deals (buy cheap, resell)</option>
        </select>
      </label>
      {strategy === "tradeups" && (
        <label className="flex flex-col gap-1">
          <span className="text-muted">Rarity to put in</span>
          <select
            className="input"
            value={tier}
            onChange={(e) => setTier(e.target.value as Tier)}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t === "Covert" ? "Covert (to knife)" : t}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-muted">Risk level</span>
        <select
          className="input"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        >
          {RISK_PROFILE_IDS.map((r) => (
            <option key={r} value={r}>
              {RISK_PROFILES[r].label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Pretend money ({currency})</span>
        <input
          className="input w-28"
          inputMode="decimal"
          required
          value={start}
          onChange={(e) => setStart(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span
          className="text-muted"
          title="The most of the bot's value one purchase may use. Lower spreads the risk."
        >
          Most per buy (%)
        </span>
        <input
          className="input w-20"
          inputMode="numeric"
          value={share}
          onChange={(e) => setShare(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="text-muted">Name</span>
        <input
          className="input"
          maxLength={60}
          placeholder={auto}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Starting..." : "Start bot"}
      </button>
      {strategy === "tradeups" && (
        <p className="w-full text-xs text-muted">
          Trade-up bots need the pretend money (times the share per buy) to
          cover a whole contract: Restricted and Classified contracts often cost
          $10 to $60, Covert ones hundreds.
        </p>
      )}
    </form>
  );
}

function ValueChart({
  history,
  startCents,
}: {
  history: { at: number; valueCents: number }[];
  startCents: number;
}) {
  const { money } = useMoney();
  if (history.length < 2)
    return (
      <p className="text-xs text-muted">
        The value chart starts after a few hours of trading.
      </p>
    );
  const W = 600;
  const H = 120;
  const values = history.map((h) => h.valueCents);
  const lo = Math.min(startCents, ...values);
  const hi = Math.max(startCents, ...values);
  const span = hi - lo || 1;
  const t0 = history[0].at;
  const t1 = history[history.length - 1].at;
  const x = (at: number) => ((at - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * (H - 8) - 4;
  const last = values[values.length - 1];
  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Value over time, from ${money(values[0])} to ${money(last)}`}
      >
        <line
          x1={0}
          x2={W}
          y1={y(startCents)}
          y2={y(startCents)}
          className="stroke-line"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          fill="none"
          className={last >= startCents ? "stroke-good" : "stroke-bad"}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={history.map((h) => `${x(h.at)},${y(h.valueCents)}`).join(" ")}
        />
      </svg>
      <figcaption className="flex justify-between text-xs text-muted">
        <span>{day(t0)}</span>
        <span>Dashed line: starting money</span>
        <span>{day(t1)}</span>
      </figcaption>
    </figure>
  );
}

function BotCard({
  bot: b,
  onRun,
  onToggle,
  onDelete,
}: {
  bot: ApiBot;
  onRun: () => Promise<boolean>;
  onToggle: () => Promise<boolean>;
  onDelete: () => void;
}) {
  const { money } = useMoney();
  const [busy, setBusy] = useState(false);
  const s = b.summary;
  const tone = (c: number) => (c > 0 ? "text-good" : c < 0 ? "text-bad" : "");
  const held = b.positions.filter((p) => p.status === "holding");
  const sold = b.positions.filter((p) => p.status === "sold");
  const describe = (p: ApiBot["positions"][number]) =>
    p.detail?.kind === "tradeup"
      ? `Trade-up from ${p.detail.inputs}: a ${(p.detail.chance * 100).toFixed(p.detail.chance < 0.1 ? 1 : 0)}% result (contract expected ${money(p.detail.evCents)})`
      : p.detail?.kind === "deal"
        ? `Deal: ${Math.round(p.detail.discount * 100)}% under its usual price, expected back ${money(p.detail.expectedNetCents)}`
        : "";

  return (
    <section className="panel space-y-4 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {b.name}{" "}
            <span
              className={`ml-1 rounded border px-1.5 text-xs ${b.active ? "border-good text-good" : "border-line text-muted"}`}
            >
              {b.active ? "Trading" : "Paused"}
            </span>
          </h2>
          <p className="text-muted">
            {b.strategy === "tradeups" ? `${b.tier} trade-ups` : "Deals"},{" "}
            {RISK_PROFILES[b.risk].label}, sells on{" "}
            {MARKETPLACES[b.market].label}. Started {day(b.createdAt)} with{" "}
            {money(b.startCents)}, at most {Math.round(b.maxBuyShare * 100)}%
            per buy. Last turn {formatAgo(b.lastRunAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onRun().finally(() => setBusy(false));
            }}
            title="Sell what's due and look for buys now, at current prices"
          >
            {busy ? "Trading..." : "Run now"}
          </button>
          <button className="btn" onClick={() => void onToggle()}>
            {b.active ? "Pause" : "Resume"}
          </button>
          <button className="btn text-bad" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Worth now"
          value={money(s.valueCents)}
          sub={`${s.returnPct >= 0 ? "+" : ""}${s.returnPct.toFixed(1)}% since start`}
          cls={tone(s.returnPct)}
        />
        <Stat label="Cash" value={money(b.cashCents)} />
        <Stat
          label="Profit from sales"
          value={money(s.realizedCents)}
          sub={
            s.sold
              ? `${s.sold} sold, ${Math.round((s.winRate ?? 0) * 100)}% at a profit`
              : "Nothing sold yet"
          }
          cls={tone(s.realizedCents)}
        />
        <Stat
          label="Holding"
          value={String(s.holding)}
          sub={`${money(s.unrealizedCents)} if sold now${s.unpriced ? `, ${s.unpriced} unpriced` : ""}`}
          cls={tone(s.unrealizedCents)}
        />
      </div>

      <p className="text-xs text-muted">
        Worth now counts what the bot holds at its usual sale price after the
        fee, like the Tracker. That profit only becomes real when it sells, and
        prices can move during the trade hold.
      </p>

      <ValueChart history={b.history} startCents={b.startCents} />

      {b.positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="p-2 font-normal">Item</th>
                <th className="p-2 font-normal">Bought</th>
                <th className="p-2 font-normal">Cost</th>
                <th className="p-2 font-normal">Now / sold for</th>
                <th className="p-2 font-normal">Profit</th>
                <th className="p-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...held, ...sold].map((p) => {
                const back =
                  p.status === "sold" ? p.soldNetCents : p.valueCents;
                const profit = back == null ? null : back - p.costCents;
                return (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="p-2">
                      {p.marketHashName}
                      {p.version ? ` (${p.version})` : ""}
                      <span className="block text-xs text-muted">
                        {describe(p)}
                      </span>
                    </td>
                    <td className="p-2">{day(p.boughtAt)}</td>
                    <td className="p-2">{money(p.costCents)}</td>
                    <td className="p-2">
                      {back == null ? (
                        <span className="text-muted">No price</span>
                      ) : (
                        money(back)
                      )}
                    </td>
                    <td className={`p-2 ${profit == null ? "" : tone(profit)}`}>
                      {profit == null ? "-" : money(profit)}
                    </td>
                    <td className="p-2">
                      {p.status === "sold"
                        ? `Sold ${day(p.soldAt ?? p.boughtAt)}`
                        : p.inHold
                          ? `Trade hold until ${day(p.tradableAt)}`
                          : `Selling, about ${day(p.sellAfter)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  cls = "",
}: {
  label: string;
  value: string;
  sub?: string;
  cls?: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      {sub && <div className={`text-xs ${cls || "text-muted"}`}>{sub}</div>}
    </div>
  );
}
