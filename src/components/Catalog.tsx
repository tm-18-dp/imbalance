"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SkinSort, SkinSummary, WearPrice } from "@/lib/queries";
import type { Listing } from "@/lib/prices/csfloat";
import { nameColor } from "@/lib/rarity";
import { TIERS } from "@/lib/tradeup";
import { useMoney } from "./Money";
import { PriceHistory } from "./PriceHistory";
import { FloatBadges } from "./FloatBadges";
import { PatternBadge, useUserPatterns } from "./PatternBadge";
import { WatchStar } from "./Watchlist";

type SearchResult = {
  total: number;
  page: number;
  pageSize: number;
  skins: SkinSummary[];
};
type Facets = {
  categories: string[];
  weapons: string[];
  collections: { id: string; name: string }[];
};

/** Filters for the skin list (adapted from the original repo's M19 filter bar). */
const EMPTY = {
  q: "",
  rarity: "",
  category: "",
  weapon: "",
  collection: "",
  min: "",
  max: "",
  stattrak: false,
  sort: "name" as SkinSort,
};

const numeric = (v: string) => v.replace(/[^\d.]/g, "");

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Catalog() {
  const { money, rates, currency } = useMoney();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => {
    setF((old) => ({ ...old, [k]: v }));
    setPage(1);
  };

  useEffect(() => {
    fetch("/api/skins?facets=1")
      .then((r) => r.json() as Promise<Facets>)
      .then(setFacets)
      .catch((err: unknown) => console.error(err));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      // Price filters are typed in the shown currency; the server works in USD.
      const usd = (v: string) =>
        v ? String(Number(v) / (rates[currency] ?? 1)) : "";
      const params = new URLSearchParams({
        q: f.q,
        rarity: f.rarity,
        category: f.category,
        weapon: f.weapon,
        collection: f.collection,
        min: usd(f.min),
        max: usd(f.max),
        stattrak: f.stattrak ? "1" : "",
        sort: f.sort,
        page: String(page),
      });
      fetch(`/api/skins?${params}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<SearchResult>)
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted)
            setError("Could not load skins. Is the app still running?");
          console.error(err);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [f, page, rates, currency]);

  const pages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;
  const changed = JSON.stringify(f) !== JSON.stringify(EMPTY);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Skins</h1>
      <div className="panel grid grid-cols-2 items-end gap-3 p-3 sm:grid-cols-4 lg:grid-cols-[2fr_repeat(4,1fr)]">
        <Field
          label="Search"
          className="col-span-2 sm:col-span-4 lg:col-span-1"
        >
          <input
            className="input"
            placeholder="Skin or collection name"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </Field>
        <Field label="Rarity">
          <select
            className="input"
            value={f.rarity}
            onChange={(e) => set("rarity", e.target.value)}
          >
            <option value="">All rarities</option>
            {TIERS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select
            className="input"
            value={f.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">All types</option>
            {facets?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Weapon">
          <select
            className="input"
            value={f.weapon}
            onChange={(e) => set("weapon", e.target.value)}
          >
            <option value="">All weapons</option>
            {facets?.weapons.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        <Field label="Collection">
          <select
            className="input"
            value={f.collection}
            onChange={(e) => set("collection", e.target.value)}
          >
            <option value="">All collections</option>
            {facets?.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Min price (${currency})`}>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={f.min}
            onChange={(e) => set("min", numeric(e.target.value))}
          />
        </Field>
        <Field label={`Max price (${currency})`}>
          <input
            className="input"
            inputMode="decimal"
            placeholder="Any"
            value={f.max}
            onChange={(e) => set("max", numeric(e.target.value))}
          />
        </Field>
        <Field label="Sort by">
          <select
            className="input"
            value={f.sort}
            onChange={(e) => set("sort", e.target.value as SkinSort)}
          >
            <option value="name">Name A to Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="rarity">Rarity: highest first</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={f.stattrak}
            onChange={(e) => set("stattrak", e.target.checked)}
          />
          StatTrak only
        </label>
        {changed && (
          <button
            type="button"
            className="btn self-end"
            onClick={() => {
              setF(EMPTY);
              setPage(1);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {result && (
        <p className="text-sm text-muted" role="status">
          {result.total} skins. Prices are the cheapest normal (not StatTrak)
          listing on Skinport.
        </p>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
      {result && result.total === 0 && (
        <p className="text-sm text-muted">
          No skins found. If this is your first run, update the skin list on the
          Dashboard.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {result?.skins.map((s) => (
          <li key={s.id}>
            <button
              className="panel flex h-full w-full flex-col p-3 text-left hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
              style={{
                borderTopColor: s.rarityColor ?? undefined,
                borderTopWidth: 3,
              }}
              onClick={() => setSelected(s.id)}
            >
              {s.image && (
                <Image
                  src={s.image}
                  alt=""
                  width={256}
                  height={192}
                  className="mx-auto h-24 w-auto object-contain"
                />
              )}
              <span
                className="mt-2 text-sm font-medium"
                style={{ color: nameColor(s.name, s.rarity) }}
              >
                {s.name}
              </span>
              <span className="text-xs text-muted">
                {s.collections[0] ?? s.rarity}
              </span>
              <span className="mt-auto pt-1 text-sm">
                {s.fromCents != null ? (
                  `from ${money(s.fromCents)}`
                ) : (
                  <span className="text-muted">no price</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {result && pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            className="btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="btn"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {selected && (
        <SkinDetail id={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

type Detail = { skin: SkinSummary; prices: WearPrice[] };

function SkinDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { money } = useMoney();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [listingsFor, setListingsFor] = useState<string | null>(null);
  const [chartFor, setChartFor] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/skins/${encodeURIComponent(id)}`)
      .then((r) => r.json() as Promise<Detail>)
      .then(setDetail)
      .catch((err: unknown) => console.error(err));
  }, [id]);

  const s = detail?.skin;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={s?.name ?? "Skin"}
      className="fixed inset-0 z-10 flex justify-end bg-black/60"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn float-right" onClick={onClose} autoFocus>
          Close
        </button>
        {!s ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold">{s.name}</h2>
            <p
              className="text-sm"
              style={{ color: s.rarityColor ?? undefined }}
            >
              {s.rarity}
            </p>
            {s.image && (
              <Image
                src={s.image}
                alt={s.name}
                width={512}
                height={384}
                className="my-3 w-full object-contain"
              />
            )}
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-muted">Float range</dt>
              <dd>
                {s.minFloat ?? "?"} to {s.maxFloat ?? "?"}
              </dd>
              <dt className="text-muted">Collection</dt>
              <dd>{s.collections.join(", ") || "None"}</dd>
              <dt className="text-muted">StatTrak</dt>
              <dd>{s.stattrak ? "Yes" : "No"}</dd>
            </dl>

            <h3 className="mt-4 mb-2 font-semibold">Prices (Skinport)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-normal">Wear</th>
                    <th className="font-normal">Lowest</th>
                    <th className="font-normal">7d median</th>
                    <th className="font-normal">Sold 7d</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.prices.map((p) => (
                    <tr key={p.marketHashName} className="border-t border-line">
                      <td className="py-1">
                        {p.variant === "stattrak"
                          ? "ST "
                          : p.variant === "souvenir"
                            ? "Souv. "
                            : ""}
                        {p.wear ?? "Any"}
                        <WatchStar name={p.marketHashName} />
                      </td>
                      <td>{money(p.minCents)}</td>
                      <td>{money(p.median7d)}</td>
                      <td>{p.volume7d}</td>
                      <td className="text-right">
                        <button
                          className="text-accent underline"
                          onClick={() => setListingsFor(p.marketHashName)}
                        >
                          Floats
                        </button>{" "}
                        <button
                          className="text-accent underline"
                          onClick={() => setChartFor(p.marketHashName)}
                        >
                          Chart
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {chartFor && (
              <div className="mt-4">
                <h3 className="mb-2 font-semibold">{chartFor}</h3>
                <PriceHistory key={chartFor} name={chartFor} />
              </div>
            )}
            {listingsFor && (
              <Listings
                key={listingsFor}
                name={listingsFor}
                minFloat={s.minFloat}
                maxFloat={s.maxFloat}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Listings({
  name,
  minFloat,
  maxFloat,
}: {
  name: string;
  minFloat: number | null;
  maxFloat: number | null;
}) {
  const { money } = useMoney();
  const userPatterns = useUserPatterns();
  const [state, setState] = useState<{
    listings?: Listing[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/listings?name=${encodeURIComponent(name)}`)
      .then(
        (r) => r.json() as Promise<{ listings?: Listing[]; error?: string }>,
      )
      .then(setState)
      .catch(() => setState({ error: "Could not load listings." }));
  }, [name]);

  const cheapest = Math.min(
    ...(state?.listings ?? []).map((l) => l.priceCents),
  );

  return (
    <div className="mt-4">
      <h3 className="mb-2 font-semibold">CSFloat listings: {name}</h3>
      {!state && <p className="text-sm text-muted">Loading...</p>}
      {userPatterns.error && (
        <p className="text-sm text-bad">{userPatterns.error}</p>
      )}
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.listings?.length === 0 && (
        <p className="text-sm text-muted">No listings right now.</p>
      )}
      {state?.listings && state.listings.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-normal">Price</th>
              <th className="font-normal">Float</th>
              <th className="font-normal">Pattern</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.listings.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-1">
                  {money(l.priceCents)}
                  {l.priceCents > cheapest * 1.05 && (
                    <span
                      className="ml-1 text-xs text-muted"
                      title="Extra over the cheapest listing: what this float or pattern adds"
                    >
                      +{Math.round((l.priceCents / cheapest - 1) * 100)}%
                    </span>
                  )}
                </td>
                <td className="font-mono">
                  {l.float?.toFixed(6) ?? "-"}
                  <FloatBadges float={l.float} min={minFloat} max={maxFloat} />
                </td>
                <td>
                  {l.paintSeed ?? "-"}
                  <PatternBadge
                    name={l.marketHashName}
                    seed={l.paintSeed}
                    patterns={userPatterns.patterns}
                  />
                </td>
                <td className="text-right">
                  <a
                    className="text-accent underline"
                    href={l.url}
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
      )}
    </div>
  );
}
