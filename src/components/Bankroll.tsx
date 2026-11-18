"use client";

import { useEffect, useState } from "react";
import { sizingWarning } from "@/lib/sizing";

/** The bankroll saved on the Tracker page, in USD cents, or null when not set. */
export function useBankroll(): number | null {
  const [cents, setCents] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { bankrollCents?: unknown } | null) => {
        if (!stop && typeof s?.bankrollCents === "number")
          setCents(s.bankrollCents);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);
  return cents;
}

/** A cost that turns red, with the reason on hover, when it's too big for the bankroll. */
export function SizedCost({
  costCents,
  bankrollCents,
  children,
}: {
  costCents: number;
  bankrollCents: number | null;
  children: React.ReactNode;
}) {
  const warning = sizingWarning(costCents, bankrollCents);
  if (!warning) return <>{children}</>;
  return (
    <span className="text-bad" title={warning}>
      {children}
      <span aria-hidden="true"> !</span>
      <span className="sr-only"> ({warning})</span>
    </span>
  );
}
