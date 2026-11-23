"use client";

import { useEffect, useMemo, useState } from "react";
import type { HistoryPoint, TrendSignal } from "@/lib/trend";
import { TREND_LABELS } from "@/lib/trend";
import type { DailyPoint, Recovery } from "@/lib/recovery";
import { useMoney } from "./Money";

type History = {
  daily: DailyPoint[];
  dailyError: string | null;
  recovery: Recovery;
  /** Set when the item is only listed by phase: the phase these prices are for. */
  pricedVersion?: string | null;
  points: HistoryPoint[];
  nowCents: number | null;
  median24h: number | null;
  median7d: number | null;
  median30d: number | null;
  median90d: number | null;
  volumes: { d1: number; d7: number; d30: number; d90: number };
  trend: TrendSignal;
  error?: string;
};

const TREND_TONE: Record<TrendSignal, string> = {
  dip: "text-good",
  rebounding: "text-good",
  falling: "text-bad",
  rising: "text-text",
  stable: "text-muted",
  unknown: "text-muted",
};

export function TrendBadge({ trend }: { trend: TrendSignal }) {
  if (trend === "stable" || trend === "unknown") return null;
  return (
    <span
      className={`ml-2 rounded border border-current px-1.5 text-xs ${TREND_TONE[trend]}`}
      title={TREND_LABELS[trend]}
    >
      {trend}
    </span>
  );
}

/** Price chart, recovery odds and sales medians for one market item. */
export function PriceHistory({
  name,
  version = "",
}: {
  name: string;
  version?: string;
}) {
  const { money } = useMoney();
  const [h, setH] = useState<History | null>(null);

  useEffect(() => {
    fetch(`/api/history?${new URLSearchParams({ name, version })}`)
      .then((r) => r.json() as Promise<History>)
      .then(setH)
      .catch(() => setH(null));
  }, [name, version]);

  if (!h) return <p className="text-sm text-muted">Loading price history...</p>;
  if (h.error) return <p className="text-sm text-bad">{h.error}</p>;

  const rows = [
    { label: "Last 24 h", cents: h.median24h, sold: h.volumes.d1 },
    { label: "Last 7 days", cents: h.median7d, sold: h.volumes.d7 },
    { label: "Last 30 days", cents: h.median30d, sold: h.volumes.d30 },
    { label: "Last 90 days", cents: h.median90d, sold: h.volumes.d90 },
  ];
  // CSFloat's daily sales when we have them; else our own Skinport snapshots.
  const series: DailyPoint[] = h.daily.length
    ? h.daily
    : h.points.map((p) => ({ day: p.at, cents: p.cents, sales: 0 }));

  return (
    <div className="space-y-4">
      <p className={`text-sm font-medium ${TREND_TONE[h.trend]}`}>
        {TREND_LABELS[h.trend]}
      </p>
      {h.pricedVersion && (
        <p className="text-xs text-muted">
          Skinport only lists this by phase: its prices below are for the
          cheapest phase now, {h.pricedVersion}. The long chart covers all
          phases together.
        </p>
      )}
      <RecoveryPanel r={h.recovery} nowCents={h.nowCents} />
      {series.length >= 2 ? (
        <PriceChart
          points={series}
          nowCents={h.nowCents}
          source={h.daily.length ? "csfloat" : "snapshots"}
        />
      ) : (
        <p className="rounded-md border border-dashed border-line p-3 text-sm text-muted">
          {h.dailyError
            ? `No chart: ${h.dailyError}`
            : "No sales history for this item yet."}{" "}
          The sales medians below still work.
        </p>
      )}
      {h.dailyError && h.daily.length > 0 && (
        <p className="text-xs text-muted">
          Showing the saved history: {h.dailyError}
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="mb-1 text-left text-sm font-medium">
          Skinport sales
        </caption>
        <thead className="text-left text-muted">
          <tr>
            <th className="py-1 font-normal">Period</th>
            <th className="font-normal">Median sale</th>
            <th className="font-normal">Sold</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <td className="py-1">Cheapest listing now</td>
            <td>{money(h.nowCents)}</td>
            <td />
          </tr>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-1">{r.label}</td>
              <td>{money(r.cents)}</td>
              <td>{r.sold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const share = (x: number) => `${Math.round(x * 100)}%`;

/** "Will it come back, and by when": counts from this item's own past drops. */
function RecoveryPanel({
  r,
  nowCents,
}: {
  r: Recovery;
  nowCents: number | null;
}) {
  const { money } = useMoney();
  if (r.status === "no-data")
    return (
      <div className="rounded-lg border border-line bg-bg p-3 text-sm">
        <strong>Chance the price comes back:</strong>{" "}
        <span className="text-muted">{r.reason}</span>
      </div>
    );
  if (r.status === "not-below")
    return (
      <div className="rounded-lg border border-line bg-bg p-3 text-sm">
        <strong>Price is at its usual level</strong>{" "}
        <span className="text-muted">
          (usual sale about {money(r.usualCents)} on CSFloat). Nothing to come
          back from.
        </span>
      </div>
    );
  const weak = r.episodes < 4;
  return (
    <div className="rounded-lg border border-line bg-bg p-3 text-sm">
      <p>
        <strong>Chance the price comes back.</strong> It sits{" "}
        <strong>{share(r.dropPct)}</strong> under its usual price
        {nowCents != null && <> ({money(nowCents)} now)</>}. It dropped this far{" "}
        <strong>{r.episodes}</strong> time{r.episodes === 1 ? "" : "s"} before.
        After those drops it was back to normal:
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["within 7 days", r.within.d7],
            ["within 30 days", r.within.d30],
            ["within 90 days", r.within.d90],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-md border border-line p-2">
            <div
              className={`text-lg font-semibold ${v >= 0.6 ? "text-good" : v < 0.3 ? "text-bad" : ""}`}
            >
              {share(v)}
            </div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {r.medianDays != null
          ? `Typical wait: ${r.medianDays} days (3 in 4 came back within ${r.p75Days} days). `
          : "None of those came back within 90 days. "}
        Based on CSFloat daily sales since 2020. Past drops don&apos;t promise
        anything
        {weak
          ? ", and this is only a few cases, so treat it as a rough hint"
          : ""}
        .
      </p>
    </div>
  );
}

const W = 640;
const H = 220;
const VOL_H = 44;
const PAD = { top: 12, right: 56, bottom: 22, left: 8 };
const DAY = 86_400_000;
const RANGES = [
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 182 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Infinity },
] as const;

/** Daily price line with a crosshair, plus sales per day underneath on its own axis. */
function PriceChart({
  points: all,
  nowCents,
  source,
}: {
  points: DailyPoint[];
  nowCents: number | null;
  source: "csfloat" | "snapshots";
}) {
  const { money } = useMoney();
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("3m");
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)!.days;
    const end = all[all.length - 1].day;
    const cut = all.filter((p) => p.day >= end - days * DAY);
    return cut.length >= 2 ? cut : all.slice(-2);
  }, [all, range]);

  const values = points.map((p) => p.cents);
  // Clip to the 2nd..98th percentile so one odd sale doesn't flatten the line.
  const sortedV = [...values].sort((a, b) => a - b);
  const lo = sortedV[Math.floor(sortedV.length * 0.02)];
  const hi = sortedV[Math.ceil(sortedV.length * 0.98) - 1];
  const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const t0 = points[0].day;
  const t1 = points[points.length - 1].day;
  const innerW = W - PAD.left - PAD.right;
  const x = (at: number) => PAD.left + ((at - t0) / (t1 - t0 || 1)) * innerW;
  const y = (c: number) =>
    PAD.top +
    (1 - (Math.min(yMax, Math.max(yMin, c)) - yMin) / (yMax - yMin)) *
      (H - PAD.top - PAD.bottom);
  const path = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.cents).toFixed(1)}`,
    )
    .join("");
  const area = `${path}L${x(t1).toFixed(1)},${H - PAD.bottom}L${x(t0).toFixed(1)},${H - PAD.bottom}Z`;
  const ticks = [0, 0.5, 1].map((f) => yMin + f * (yMax - yMin));
  const date = (at: number, withYear = false) =>
    new Date(at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(withYear || t1 - t0 > 300 * DAY ? { year: "2-digit" } : {}),
    });
  const maxSales = Math.max(1, ...points.map((p) => p.sales));
  const barW = Math.max(1, innerW / points.length - 1);
  const hp = hover == null ? null : points[hover];
  const first = points[0].cents;
  const last = points[points.length - 1].cents;
  const change = first ? (last - first) / first : 0;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - box.left) / box.width) * W;
    const at = t0 + ((svgX - PAD.left) / innerW) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (Math.abs(points[i].day - at) < Math.abs(points[best].day - at))
        best = i;
    setHover(best);
  }

  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm">
          <span className="font-medium">
            {source === "csfloat"
              ? "Average sale price per day (CSFloat)"
              : "Cheapest Skinport listing (saved by Imbalance)"}
          </span>{" "}
          <span className={change >= 0 ? "text-good" : "text-bad"}>
            {change >= 0 ? "+" : ""}
            {(change * 100).toFixed(1)}% over this range
          </span>
        </figcaption>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={`rounded-md border px-2 py-0.5 text-xs ${range === r.id ? "border-accent text-accent" : "border-line text-muted hover:text-text"}`}
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H + VOL_H}`}
          className="w-full"
          role="img"
          aria-label={`Price from ${money(first)} to ${money(last)} between ${date(t0, true)} and ${date(t1, true)}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={W - PAD.right + 6}
                y={y(t) + 4}
                fontSize={11}
                fill="var(--muted)"
              >
                {money(Math.round(t))}
              </text>
            </g>
          ))}
          {nowCents != null && nowCents >= yMin && nowCents <= yMax && (
            <g>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(nowCents)}
                y2={y(nowCents)}
                stroke="var(--muted)"
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left + 4}
                y={y(nowCents) - 4}
                fontSize={11}
                fill="var(--muted)"
              >
                Skinport now {money(nowCents)}
              </text>
            </g>
          )}
          <path d={area} fill="var(--accent)" opacity={0.08} />
          <path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--muted)">
            {date(t0)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 6}
            fontSize={11}
            fill="var(--muted)"
            textAnchor="end"
          >
            {date(t1)}
          </text>
          {source === "csfloat" &&
            points.map((p) => {
              const bh = (p.sales / maxSales) * (VOL_H - 8);
              return (
                <rect
                  key={p.day}
                  x={x(p.day) - barW / 2}
                  y={H + VOL_H - bh}
                  width={barW}
                  height={bh}
                  fill="var(--muted)"
                  opacity={hp === p ? 0.9 : 0.35}
                />
              );
            })}
          {hp && (
            <g>
              <line
                x1={x(hp.day)}
                x2={x(hp.day)}
                y1={PAD.top}
                y2={H + VOL_H}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              <circle
                cx={x(hp.day)}
                cy={y(hp.cents)}
                r={4.5}
                fill="var(--accent)"
                stroke="var(--panel)"
                strokeWidth={2}
              />
            </g>
          )}
          <rect
            x={0}
            y={0}
            width={W}
            height={H + VOL_H}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute top-2 rounded border border-line bg-panel px-2 py-1 text-xs shadow"
            style={
              x(hp.day) > W / 2
                ? { left: 8 }
                : { right: `${(PAD.right / W) * 100}%` }
            }
          >
            <div className="text-muted">{date(hp.day, true)}</div>
            <strong>{money(hp.cents)}</strong>
            {source === "csfloat" && (
              <span className="text-muted"> · {hp.sales} sold</span>
            )}
          </div>
        )}
      </div>
      {source === "csfloat" && (
        <p className="text-xs text-muted">
          Bars: number sold per day. Hover for exact values.
        </p>
      )}
    </figure>
  );
}
