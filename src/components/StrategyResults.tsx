"use client";

import { useState } from "react";
import type { Holding } from "@/lib/tracker";
import { RISK_PROFILE_IDS, RISK_PROFILES } from "@/lib/risk";
import {
  groupLabel,
  STRATEGIES,
  STRATEGY_LABELS,
  UNTAGGED,
  type MonthRow,
  type ResultGroup,
  type ResultRow,
} from "@/lib/results";
import { useMoney } from "./Money";

export type GroupResults = {
  rows: ResultRow[];
  keys: string[];
  months: MonthRow[];
};
type Tags = { strategy: string | null; risk: string | null };

export function StrategySelect({
  value,
  onChange,
  className = "input",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Untagged</option>
      {STRATEGIES.map((s) => (
        <option key={s} value={s}>
          {STRATEGY_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

export function RiskSelect({
  value,
  onChange,
  className = "input",
  emptyLabel = "Untagged",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  emptyLabel?: string;
  label?: string;
}) {
  return (
    <select
      className={className}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {RISK_PROFILE_IDS.map((r) => (
        <option key={r} value={r}>
          {RISK_PROFILES[r].label}
        </option>
      ))}
    </select>
  );
}

/** Strategy and risk tags of one entry, editable in place (for entries logged untagged). */
export function TagPicker({
  holding,
  onTag,
}: {
  holding: Holding;
  onTag: (id: number, tags: Tags) => Promise<boolean>;
}) {
  const small = "input px-1 py-0.5 text-xs";
  return (
    <div className="flex flex-col gap-1">
      <StrategySelect
        className={small}
        label={`Strategy for ${holding.marketHashName}`}
        value={holding.strategy ?? ""}
        onChange={(v) =>
          void onTag(holding.id, { strategy: v || null, risk: holding.risk })
        }
      />
      <RiskSelect
        className={small}
        label={`Risk level for ${holding.marketHashName}`}
        value={holding.risk ?? ""}
        onChange={(v) =>
          void onTag(holding.id, {
            strategy: holding.strategy,
            risk: v || null,
          })
        }
      />
    </div>
  );
}

const tone = (c: number) => (c > 0 ? "text-good" : c < 0 ? "text-bad" : "");

/**
 * Real profit per strategy or per risk level, and per month: whether Aggressive actually
 * earns more than Safe, and which strategy pays. Only tagged entries can be compared.
 */
export function StrategyResults({
  results,
}: {
  results: Record<ResultGroup, GroupResults>;
}) {
  const { money } = useMoney();
  const [by, setBy] = useState<ResultGroup>("strategy");
  const r = results[by];
  if (r.rows.length === 0) return null;
  const untaggedOnly = r.rows.every((x) => x.key === UNTAGGED);
  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Results</h2>
        <div className="flex gap-1" role="group" aria-label="Group results">
          {(["strategy", "risk"] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={by === g ? "btn-primary" : "btn"}
              aria-pressed={by === g}
              onClick={() => setBy(g)}
            >
              {g === "strategy" ? "By strategy" : "By risk level"}
            </button>
          ))}
        </div>
      </div>
      {untaggedOnly && (
        <p className="text-muted">
          Nothing is tagged yet. Pick what you bought it for and the risk level
          when you add a purchase, or set them on the rows below, to compare
          them here.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="p-2 font-normal">
                {by === "strategy" ? "Strategy" : "Risk level"}
              </th>
              <th className="p-2 font-normal">Sold</th>
              <th className="p-2 font-normal">Profit from sales</th>
              <th className="p-2 font-normal">Holding</th>
              <th className="p-2 font-normal">Profit if sold now</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.key} className="border-t border-line">
                <td className="p-2">{groupLabel(x.key)}</td>
                <td className="p-2">{x.sold}</td>
                <td className={`p-2 ${tone(x.realizedCents)}`}>
                  {x.sold ? money(x.realizedCents) : "-"}
                  {x.roi != null && (
                    <span className="block text-xs">
                      {x.roi >= 0 ? "+" : ""}
                      {(x.roi * 100).toFixed(1)}% on {money(x.soldCostCents)}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {x.held ? (
                    <>
                      {x.held}
                      <span className="block text-xs text-muted">
                        cost {money(x.investedCents)}
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={`p-2 ${tone(x.unrealizedCents)}`}>
                  {x.held ? money(x.unrealizedCents) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.months.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-muted">Profit from sales per month</h3>
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th className="p-2 font-normal">Month</th>
                {r.keys.map((k) => (
                  <th key={k} className="p-2 font-normal">
                    {groupLabel(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.months.map((m) => (
                <tr key={m.month} className="border-t border-line">
                  <td className="p-2">{m.month}</td>
                  {r.keys.map((k) => (
                    <td key={k} className={`p-2 ${tone(m.byKey[k] ?? 0)}`}>
                      {m.byKey[k] == null ? "-" : money(m.byKey[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Profit is after the selling fee. Skins used in a trade-up count in the
        result of that trade-up. A handful of sales proves little: compare once
        each group has 20 or more.
      </p>
    </section>
  );
}
