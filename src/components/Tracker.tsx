"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Holding, Portfolio, Settings } from "@/lib/tracker";
import type { NextStep } from "@/lib/timeline";
import { MARKETPLACES, type MarketplaceId } from "@/lib/fees";
import type { ResultGroup } from "@/lib/results";
import { useMoney } from "./Money";
import {
  RiskSelect,
  StrategyResults,
  StrategySelect,
  TagPicker,
  type GroupResults,
} from "./StrategyResults";
import { ExpectedVsActual } from "./ExpectedVsActual";
import type { ExpectedVsActual as Comparison } from "@/lib/expectation";
import { FloatBadges } from "./FloatBadges";
import { WatchStar } from "./Watchlist";

type Row = Holding & {
  image: string | null;
  valueCents: number | null;
  volume30d: number;
};
type Data = {
  holdings: Row[];
  settings: Settings;
  results: Record<ResultGroup, GroupResults>;
  expectedVsActual: Comparison;
  portfolio: Portfolio;
  steps: NextStep[];
  comeBackAt: number | null;
};

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const today = () => new Date().toISOString().slice(0, 10);

async function post(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch("/api/tracker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown> & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? "That didn't work. Try again.");
  return json;
}

export function Tracker() {
  const { money, rates, currency } = useMoney();
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<number[]>([]);
  const toUsdCents = (v: string) =>
    Math.round((Number(v) / (rates[currency] ?? 1)) * 100);

  const load = useCallback(async () => {
    const res = await fetch("/api/tracker");
    setData((await res.json()) as Data);
  }, []);

  useEffect(() => {
    fetch("/api/tracker")
      .then((r) => r.json() as Promise<Data>)
      .then(setData)
      .catch(() =>
        setMessage({
          ok: false,
          text: "Could not load your tracker. Is the app still running?",
        }),
      );
  }, []);

  async function run(
    body: unknown,
    done: string | ((reply: Record<string, unknown>) => string),
  ) {
    setMessage(null);
    try {
      const reply = await post(body);
      await load();
      setMessage({
        ok: true,
        text: typeof done === "string" ? done : done(reply),
      });
      return true;
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "That didn't work.",
      });
      return false;
    }
  }

  if (!data)
    return (
      <p className="text-sm text-muted">{message?.text ?? "Loading..."}</p>
    );
  const held = data.holdings.filter((h) => h.status === "holding");
  const past = data.holdings.filter((h) => h.status !== "holding");
  const p = data.portfolio;
  // Server decides what is still trade-locked, so render stays pure.
  const locked = new Set(
    data.steps.filter((s) => s.kind === "wait").map((s) => s.id),
  );
  const tone = (c: number) => (c >= 0 ? "text-good" : "text-bad");
  const tag = (
    id: number,
    tags: { strategy: string | null; risk: string | null },
  ) => run({ action: "tag", id, tags }, "Tag saved.");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tracker</h1>
        <p className="text-sm text-muted">
          Log what you buy, put into trade-ups and sell. Values are what you
          would get selling on {MARKETPLACES[data.settings.sellMarket].label}{" "}
          today, after its fee.
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Invested now", value: money(p.investedCents), cls: "" },
          { label: "Worth now", value: money(p.valueCents), cls: "" },
          {
            label: "Unrealized profit",
            value: money(p.unrealizedCents),
            cls: tone(p.unrealizedCents),
          },
          {
            label: "Profit from sales",
            value: money(p.realizedCents),
            cls: tone(p.realizedCents),
          },
        ].map((c) => (
          <div key={c.label} className="panel p-3">
            <div className="text-xs text-muted">{c.label}</div>
            <div className={`text-xl font-semibold ${c.cls}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <NextSteps steps={data.steps} comeBackAt={data.comeBackAt} />

      <StrategyResults results={data.results} />

      <ExpectedVsActual data={data.expectedVsActual} />

      <AddPurchase
        defaultRisk={data.settings.riskProfile}
        onAdd={(item) => run({ action: "buy", item }, "Added to your tracker.")}
        toUsdCents={toUsdCents}
        currency={currency}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What you hold ({held.length})</h2>
        {held.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Add a purchase above.
          </p>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="p-2 font-normal">
                    <span className="sr-only">Pick for trade-up</span>
                  </th>
                  <th className="p-2 font-normal">Item</th>
                  <th className="p-2 font-normal">Paid</th>
                  <th className="p-2 font-normal">Worth now</th>
                  <th className="p-2 font-normal">Tradable</th>
                  <th className="p-2 font-normal">Strategy</th>
                  <th className="p-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {held.map((h) => (
                  <tr key={h.id} className="border-t border-line align-top">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        aria-label={`Use ${h.marketHashName} in a trade-up`}
                        checked={selected.includes(h.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, h.id]
                              : s.filter((x) => x !== h.id),
                          )
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {h.image && (
                          <Image
                            src={h.image}
                            alt=""
                            width={64}
                            height={48}
                            className="h-8 w-auto"
                          />
                        )}
                        <span>
                          {h.marketHashName}
                          <WatchStar
                            name={h.marketHashName}
                            version={h.version}
                          />
                          {h.float != null && (
                            <span className="block font-mono text-xs text-muted">
                              {h.float.toFixed(6)}
                              <FloatBadges float={h.float} />
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="p-2">{money(h.costCents)}</td>
                    <td className="p-2">
                      {money(h.valueCents)}
                      {h.valueCents != null && (
                        <span
                          className={`block text-xs ${tone(h.valueCents - h.costCents)}`}
                        >
                          {money(h.valueCents - h.costCents)}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {!locked.has(h.id) ? (
                        <span className="text-good">Now</span>
                      ) : (
                        day(h.tradableAt)
                      )}
                    </td>
                    <td className="p-2">
                      <TagPicker holding={h} onTag={tag} />
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <SellButton
                        holding={h}
                        currency={currency}
                        defaultMarket={data.settings.sellMarket}
                        onSell={(soldCents, market) =>
                          run(
                            {
                              action: "sell",
                              id: h.id,
                              soldCents,
                              market,
                              soldAt: Date.now(),
                            },
                            `Sold ${h.marketHashName}.`,
                          )
                        }
                        toUsdCents={toUsdCents}
                      />{" "}
                      <button
                        className="text-bad underline"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${h.marketHashName} from your tracker? This can't be undone.`,
                            )
                          ) {
                            void run(
                              { action: "delete", id: h.id },
                              "Deleted.",
                            );
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RecordTradeUp
          count={selected.length}
          onRecord={async (output) => {
            if (
              await run(
                {
                  action: "tradeup",
                  inputIds: selected,
                  output,
                  at: Date.now(),
                },
                (reply) =>
                  reply.noExpectation
                    ? `Trade-up recorded. It can't be compared with what the app expected: ${String(reply.noExpectation)}`
                    : "Trade-up recorded, with what the app expected from it.",
              )
            )
              setSelected([]);
          }}
        />
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="p-2 font-normal">Item</th>
                  <th className="p-2 font-normal">Paid</th>
                  <th className="p-2 font-normal">Result</th>
                  <th className="p-2 font-normal">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {past.map((h) => (
                  <tr key={h.id} className="border-t border-line">
                    <td className="p-2">{h.marketHashName}</td>
                    <td className="p-2">{money(h.costCents)}</td>
                    <td className="p-2">
                      {h.status === "used" ? (
                        <span className="text-muted">Used in a trade-up</span>
                      ) : (
                        <span
                          className={tone((h.soldNetCents ?? 0) - h.costCents)}
                        >
                          Sold for {money(h.soldCents)} on {h.soldOn}, kept{" "}
                          {money(h.soldNetCents)} (
                          {money((h.soldNetCents ?? 0) - h.costCents)})
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {h.status === "sold" ? (
                        <TagPicker holding={h} onTag={tag} />
                      ) : (
                        <span
                          className="text-xs text-muted"
                          title="Its cost counts in the trade-up's result"
                        >
                          In a trade-up
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <SettingsAndBackup
        settings={data.settings}
        onSave={(settings) =>
          run({ action: "settings", settings }, "Settings saved.")
        }
        onImport={(d) => run({ action: "import", data: d }, "Backup restored.")}
      />
    </div>
  );
}

export function NextSteps({
  steps,
  comeBackAt,
}: {
  steps: NextStep[];
  comeBackAt: number | null;
}) {
  const { money } = useMoney();
  if (steps.length === 0) return null;
  const text: Record<NextStep["kind"], (s: NextStep) => string> = {
    sell: (s) =>
      `Sell ${s.marketHashName}: tradable, worth ${money(s.gainCents)} more than you paid`,
    hold: (s) =>
      `${s.marketHashName} is tradable, but ${s.gainCents == null ? "has no market price" : s.gainCents === 0 ? "selling now only gets back what you paid" : `selling now loses ${money(-s.gainCents)}`}. Hold or use it in a trade-up.`,
    wait: (s) => `${s.marketHashName} unlocks ${day(s.at)}`,
  };
  return (
    <section className="panel p-4">
      <h2 className="font-semibold">Next steps</h2>
      {comeBackAt && (
        <p className="mt-1 text-sm">
          Come back on <strong>{day(comeBackAt)}</strong>, when your next item
          unlocks.
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {steps.slice(0, 8).map((s) => (
          <li
            key={s.id}
            className={
              s.kind === "sell"
                ? "text-good"
                : s.kind === "wait"
                  ? "text-muted"
                  : ""
            }
          >
            {text[s.kind](s)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddPurchase({
  onAdd,
  toUsdCents,
  currency,
  defaultRisk,
}: {
  onAdd: (item: Record<string, unknown>) => Promise<boolean>;
  toUsdCents: (v: string) => number;
  currency: string;
  defaultRisk: string;
}) {
  const [strategy, setStrategy] = useState("trade-up");
  const [risk, setRisk] = useState(defaultRisk);
  const [name, setName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [float, setFloat] = useState("");
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<MarketplaceId>("skinport");
  const [count, setCount] = useState("1");

  function search(q: string) {
    setName(q);
    if (q.trim().length < 2) return;
    fetch(`/api/names?q=${encodeURIComponent(q)}`)
      .then((r) => r.json() as Promise<{ names: string[] }>)
      .then((r) => setNames(r.names))
      .catch(() => setNames([]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.min(10, Math.max(1, Number(count) || 1));
    for (let i = 0; i < n; i++) {
      const ok = await onAdd({
        marketHashName: name,
        costCents: toUsdCents(price),
        float: float ? Number(float) : null,
        boughtAt: new Date(`${date}T12:00:00`).getTime(),
        source,
        strategy: strategy || null,
        risk: risk || null,
      });
      if (!ok) return;
    }
    setName("");
    setPrice("");
    setFloat("");
    setCount("1");
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="panel flex flex-wrap items-end gap-3 p-4 text-sm"
    >
      <h2 className="w-full font-semibold">Add a purchase</h2>
      <label className="flex min-w-60 flex-1 flex-col gap-1">
        <span className="text-muted">Item (exact market name)</span>
        <input
          className="input"
          list="item-names"
          required
          value={name}
          onChange={(e) => search(e.target.value)}
          placeholder="AK-47 | Redline (Field-Tested)"
        />
        <datalist id="item-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Price each ({currency})</span>
        <input
          className="input w-28"
          inputMode="decimal"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">How many</span>
        <input
          className="input w-16"
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Float (optional)</span>
        <input
          className="input w-28"
          inputMode="decimal"
          value={float}
          onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.1534"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Bought on</span>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Where</span>
        <select
          className="input"
          value={source}
          onChange={(e) => setSource(e.target.value as MarketplaceId)}
        >
          {Object.values(MARKETPLACES).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span
          className="text-muted"
          title="What you bought it for, so Results can compare strategies"
        >
          Bought for
        </span>
        <StrategySelect value={strategy} onChange={setStrategy} />
      </label>
      <label className="flex flex-col gap-1">
        <span
          className="text-muted"
          title="The risk level you found it at, so Results can compare them"
        >
          Risk level
        </span>
        <RiskSelect value={risk} onChange={setRisk} />
      </label>
      <button className="btn-primary">Add</button>
    </form>
  );
}

function SellButton({
  holding,
  currency,
  defaultMarket,
  onSell,
  toUsdCents,
}: {
  holding: Row;
  currency: string;
  defaultMarket: MarketplaceId;
  onSell: (soldCents: number, market: MarketplaceId) => Promise<boolean>;
  toUsdCents: (v: string) => number;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [market, setMarket] = useState(defaultMarket);
  if (!open)
    return (
      <button className="text-accent underline" onClick={() => setOpen(true)}>
        Sold
      </button>
    );
  return (
    <form
      className="inline-flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void onSell(toUsdCents(price), market).then(
          (ok) => ok && setOpen(false),
        );
      }}
    >
      <label className="sr-only" htmlFor={`sell-${holding.id}`}>
        Sale price in {currency}
      </label>
      <input
        id={`sell-${holding.id}`}
        className="input w-24"
        inputMode="decimal"
        required
        autoFocus
        placeholder={currency}
        value={price}
        onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
      />
      <select
        className="input"
        aria-label="Sold on"
        value={market}
        onChange={(e) => setMarket(e.target.value as MarketplaceId)}
      >
        {Object.values(MARKETPLACES).map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <button className="btn-primary">Save</button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function RecordTradeUp({
  count,
  onRecord,
}: {
  count: number;
  onRecord: (output: {
    marketHashName: string;
    float: number | null;
    risk: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [risk, setRisk] = useState("");
  const [float, setFloat] = useState("");
  if (count === 0)
    return (
      <p className="text-sm text-muted">
        Tick 10 skins (or 5 Coverts) above to record a trade-up you did.
      </p>
    );
  const ready = count === 10 || count === 5;
  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void onRecord({
          marketHashName: name,
          float: float ? Number(float) : null,
          risk: risk || null,
        });
      }}
    >
      <p className="w-full">
        {count} picked.{" "}
        {ready
          ? "What did you get?"
          : "A trade-up needs exactly 10 (or 5 Coverts)."}
      </p>
      {ready && (
        <>
          <label className="flex min-w-60 flex-1 flex-col gap-1">
            <span className="text-muted">Item you got (exact market name)</span>
            <input
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Its float</span>
            <input
              className="input w-28"
              inputMode="decimal"
              value={float}
              onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Risk level</span>
            <RiskSelect
              value={risk}
              onChange={setRisk}
              emptyLabel="Same as the inputs"
            />
          </label>
          <button className="btn-primary">Record trade-up</button>
        </>
      )}
    </form>
  );
}

function SettingsAndBackup({
  settings,
  onSave,
  onImport,
}: {
  settings: Settings;
  onSave: (s: Partial<Settings>) => Promise<boolean>;
  onImport: (data: unknown) => Promise<boolean>;
}) {
  const [holdDays, setHoldDays] = useState(String(settings.holdDays));
  const { currency } = useMoney();
  return (
    <section className="panel flex flex-wrap items-end gap-4 p-4 text-sm">
      <h2 className="w-full font-semibold">Settings and backup</h2>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Trade hold after buying (days)</span>
        <input
          className="input w-20"
          inputMode="numeric"
          value={holdDays}
          onChange={(e) => setHoldDays(e.target.value.replace(/\D/g, ""))}
          onBlur={() => void onSave({ holdDays: Number(holdDays) })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Value items as if sold on</span>
        <select
          className="input"
          value={settings.sellMarket}
          onChange={(e) =>
            void onSave({ sellMarket: e.target.value as MarketplaceId })
          }
        >
          {Object.values(MARKETPLACES).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {/* Remounts when the currency is known, so the amount shows converted. */}
      <BankrollInput
        key={currency}
        bankrollCents={settings.bankrollCents}
        onSave={(bankrollCents) => onSave({ bankrollCents })}
      />
      <a className="btn" href="/api/tracker/export">
        Download backup
      </a>
      <label className="btn cursor-pointer">
        Restore backup
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (
              !file ||
              !confirm(
                "Restoring replaces everything in your tracker with the backup. Continue?",
              )
            )
              return;
            void file
              .text()
              .then((t) => onImport(JSON.parse(t)))
              .catch(() => onImport(null));
          }}
        />
      </label>
    </section>
  );
}

/**
 * Money set aside for trading, typed in the shown currency and saved in USD cents.
 * Trade-ups and Deals warn when one buy is a big share of it.
 */
function BankrollInput({
  bankrollCents,
  onSave,
}: {
  bankrollCents: number | null;
  onSave: (cents: number | null) => Promise<boolean>;
}) {
  const { currency, rates } = useMoney();
  const rate = rates[currency] ?? 1;
  const [value, setValue] = useState(() =>
    bankrollCents == null
      ? ""
      : String(Math.round((bankrollCents / 100) * rate)),
  );
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-muted"
        title="Money you have set aside for trading. Trade-ups and Deals warn when one buy is more than 10% of it."
      >
        Bankroll ({currency})
      </span>
      <input
        className="input w-28"
        inputMode="decimal"
        placeholder="Not set"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={() =>
          void onSave(value ? Math.round((Number(value) / rate) * 100) : null)
        }
      />
    </label>
  );
}
