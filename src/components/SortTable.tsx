"use client";

import { useMemo, useState } from "react";

/** Adapted from the original Imbalance repo (4bdulllahh/imbalance, M19). */
export type SortDir = "asc" | "desc";

/**
 * Sorts rows by a numeric or text column; clicking a header again flips the order. Blank
 * values always go last. A null key keeps the rows in the order they came.
 */
export function useSort<T, K extends string>(
  rows: readonly T[],
  columns: Record<K, (row: T) => number | string | null>,
  initial: K | null = null,
  initialDir: SortDir = "desc",
) {
  const [key, setKey] = useState<K | null>(initial);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    if (key == null) return [...rows];
    const get = columns[key];
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      const c =
        typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return dir === "asc" ? c : -c;
    });
    // columns is a constant object at each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(k);
      setDir("desc");
    }
  };
  const reset = () => setKey(null);
  return { sorted, key, dir, toggle, reset };
}

/** A clickable table header that shows and flips the sort order. */
export function SortTh<K extends string>({
  k,
  sort,
  children,
  title,
  className = "",
}: {
  k: K;
  sort: { key: K | null; dir: SortDir; toggle: (k: K) => void };
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      className={`p-2 font-normal ${className}`}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
      title={title}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-1 text-left hover:text-text ${active ? "text-accent" : ""}`}
        onClick={(e) => {
          // Headers sit inside clickable rows on some tables.
          e.stopPropagation();
          sort.toggle(k);
        }}
      >
        {children}
        <span aria-hidden className="text-[10px]">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
