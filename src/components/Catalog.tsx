"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { SkinSummary, WearPrice } from "@/lib/queries";
import type { Listing } from "@/lib/prices/csfloat";
import { useMoney } from "./Money";
import { PriceHistory } from "./PriceHistory";
import { FloatBadges } from "./FloatBadges";
import { PatternBadge, useUserPatterns } from "./PatternBadge";
import { WatchStar } from "./Watchlist";

const RARITIES = [
  "Consumer Grade",
  "Industrial Grade",
  "Mil-Spec Grade",
  "Restricted",
  "Classified",
  "Covert",
];

type SearchResult = {
  total: number;
  page: number;
  pageSize: number;
  skins: SkinSummary[];
};

export function Catalog() {
  const { money } = useMoney();
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q, rarity, page: String(page) });
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
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, rarity, page]);

  const pages = result
    ? Math.max(1, Math.ceil(result.total / result.pageSize))
    : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Skins</h1>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="skin-search">
          Search skins or collections
        </label>
        <input
          id="skin-search"
          className="input min-w-0 flex-1"
          placeholder="Search skins or collections"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <label className="sr-only" htmlFor="rarity">
          Rarity
        </label>
        <select
          id="rarity"
          className="input"
          value={rarity}
          onChange={(e) => {
            setRarity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All rarities</option>
          {RARITIES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>

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
              <span className="mt-2 text-sm font-medium">{s.name}</span>
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
