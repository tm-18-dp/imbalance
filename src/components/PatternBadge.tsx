"use client";

import { useEffect, useState } from "react";
import { patternFlag, type KnownPattern } from "@/lib/patterns";

/** Your premium patterns from data/patterns.json, plus any problem reading them. */
export function useUserPatterns() {
  const [state, setState] = useState<{
    patterns: KnownPattern[];
    error?: string;
  }>({ patterns: [] });
  useEffect(() => {
    let stop = false;
    fetch("/api/patterns")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { patterns?: KnownPattern[]; error?: string } | null) => {
        if (!stop && s)
          setState({ patterns: s.patterns ?? [], error: s.error });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return state;
}

/**
 * A known premium pattern (green), or a reminder that this finish's value depends on the
 * pattern and Imbalance doesn't price it (muted).
 */
export function PatternBadge({
  name,
  seed,
  patterns,
}: {
  name: string;
  seed: number | null | undefined;
  patterns: readonly KnownPattern[];
}) {
  const flag = patternFlag(name, seed, patterns);
  if (flag.known)
    return (
      <span
        className="ml-1.5 rounded border border-good px-1 font-sans text-xs text-good"
        title={`Pattern ${seed} is on ${flag.known.source === "yours" ? "your list (data/patterns.json)" : "Imbalance's short built-in list"}. Check recent sales of this exact pattern before buying or selling: Imbalance doesn't price it.`}
      >
        {flag.known.label}
      </span>
    );
  if (flag.sensitive)
    return (
      <span
        className="ml-1.5 rounded border border-line px-1 font-sans text-xs text-muted"
        title={`${flag.sensitive.note}. Imbalance doesn't price patterns.`}
      >
        Pattern matters
      </span>
    );
  return null;
}
