"use client";

import {
  ENOUGH_CONTRACTS,
  type ExpectedVsActual as Comparison,
} from "@/lib/expectation";
import { useMoney } from "./Money";

const VERDICT: Record<Comparison["verdict"], string> = {
  none: "",
  "too-few": `Too few to judge the maths yet: one trade-up is mostly luck. Check again after ${ENOUGH_CONTRACTS}.`,
  "as-expected":
    "Within normal luck of what the app expected: the maths is holding up.",
  below:
    "Well below what the app expected, more than luck explains. The prices it uses may be too high (thin markets, falling prices) or fees and floats different from what you logged. Be careful putting more money in.",
  above:
    "Well above what the app expected, more than luck explains. The app may be too cautious, or you sold better than the usual price.",
};

/**
 * For trade-ups recorded on this page: what the app expected from the skins that went in,
 * next to what you got (the sale after its fee, or today's value while you hold it).
 */
export function ExpectedVsActual({ data }: { data: Comparison }) {
  const { money } = useMoney();
  if (data.contracts.length === 0) return null;
  const diff = data.actualCents - data.expectedCents;
  const tone = (c: number) => (c > 0 ? "text-good" : c < 0 ? "text-bad" : "");
  return (
    <section className="panel space-y-3 p-4 text-sm">
      <div>
        <h2 className="font-semibold">Trade-ups: expected vs what you got</h2>
        <p className="text-muted">
          When you record a trade-up, the app works out what it expected from
          the exact skins that went in, at that day&apos;s prices, after the
          selling fee.
        </p>
      </div>
      {data.counted > 0 && (
        <p>
          Over {data.counted} trade-up{data.counted === 1 ? "" : "s"}: expected{" "}
          <strong>{money(data.expectedCents)}</strong>, got{" "}
          <strong>{money(data.actualCents)}</strong> (
          <span className={tone(diff)}>
            {diff >= 0 ? "+" : ""}
            {money(diff)}
          </span>
          {data.z != null && (
            <span
              className="text-muted"
              title="How far the total is from expected, measured in the swing you'd expect from luck over this many trade-ups. Within 2 either way is normal."
            >
              , {Math.abs(data.z).toFixed(1)}x normal luck{" "}
              {data.z < 0 ? "below" : "above"}
            </span>
          )}
          ).
          <span className="block text-muted">{VERDICT[data.verdict]}</span>
        </p>
      )}
      {data.unexpected > 0 && (
        <p className="text-bad">
          {data.unexpected} result{data.unexpected === 1 ? " was" : "s were"}{" "}
          not among the outcomes the app predicted. Check the item name you
          logged; if it is right, the app&apos;s collection data is wrong for
          that contract.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="p-2 font-normal">You got</th>
              <th className="p-2 font-normal">Cost</th>
              <th className="p-2 font-normal">Expected</th>
              <th className="p-2 font-normal">Got</th>
              <th className="p-2 font-normal">Chance of this</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="p-2">
                  {c.marketHashName}
                  {c.floatsEstimated && (
                    <span
                      className="block text-xs text-muted"
                      title="Some inputs had no float logged, so the worst float of their wear was assumed"
                    >
                      floats estimated
                    </span>
                  )}
                </td>
                <td className="p-2">{money(c.costCents)}</td>
                <td className="p-2">
                  {money(c.expectedCents)}
                  <span className="block text-xs text-muted">
                    usually {money(Math.max(0, c.expectedCents - c.sdCents))} to{" "}
                    {money(c.expectedCents + c.sdCents)}
                  </span>
                </td>
                <td
                  className={`p-2 ${c.actualCents == null ? "" : tone(c.actualCents - c.expectedCents)}`}
                >
                  {c.actualCents == null ? "No price" : money(c.actualCents)}
                  {!c.sold && (
                    <span className="block text-xs text-muted">
                      not sold, worth now
                    </span>
                  )}
                </td>
                <td className={`p-2 ${c.chance == null ? "text-bad" : ""}`}>
                  {c.chance == null
                    ? "Not predicted"
                    : `${(c.chance * 100).toFixed(c.chance < 0.1 ? 1 : 0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
