import { describe, expect, it } from "vitest";
import { openDb, setMeta } from "./db";
import {
  alertUrl,
  cleanQuery,
  listAlerts,
  newHits,
  saveAlerts,
  type Alert,
  type AlertItem,
} from "./alerts";

const alert = (o: Partial<Alert> = {}): Alert => ({
  id: "a1",
  kind: "tradeups",
  name: "Aggressive Covert",
  query: "tier=Covert&risk=aggressive",
  minRoiPercent: 20,
  minProfitCents: null,
  createdAt: 1,
  seen: ["old"],
  lastHit: null,
  ...o,
});
const item = (
  key: string,
  profitCents: number,
  roiPercent: number,
): AlertItem => ({
  key,
  label: key,
  profitCents,
  roiPercent,
});

describe("alerts", () => {
  it("keeps only the query keys each search accepts", () => {
    expect(
      cleanQuery("tradeups", "tier=Covert&risk=aggressive&evil=1&budget="),
    ).toBe("tier=Covert&risk=aggressive");
    expect(cleanQuery("deals", "q=AK&tier=Covert&dips=1")).toBe("q=AK&dips=1");
  });

  it("reports new results that clear the bar, best first, once", () => {
    const items = [
      item("old", 5000, 50), // reported before
      item("low", 9000, 10), // under 20% return
      item("ok", 300, 25),
      item("best", 2000, 40),
    ];
    const first = newHits(alert(), items, 100);
    expect(first.hits.map((h) => h.key)).toEqual(["best", "ok"]);
    expect(first.alert.lastHit).toEqual({
      at: 100,
      count: 2,
      label: "best",
      profitCents: 2000,
      roiPercent: 40,
    });
    // The same results again: nothing new.
    expect(newHits(first.alert, items, 200).hits).toEqual([]);
  });

  it("applies a profit bar too", () => {
    const a = alert({ minRoiPercent: null, minProfitCents: 1000, seen: [] });
    expect(
      newHits(a, [item("x", 999, 90), item("y", 1000, 1)], 1).hits.map(
        (h) => h.key,
      ),
    ).toEqual(["y"]);
  });

  it("forgets the oldest results past 500", () => {
    const a = alert({ minRoiPercent: null, seen: [] });
    const many = Array.from({ length: 520 }, (_, i) => item(`k${i}`, 1, 1));
    const { alert: next } = newHits(a, many, 1);
    expect(next.seen).toHaveLength(500);
  });

  it("links to the page with the search filled in", () => {
    expect(
      alertUrl({
        kind: "tradeups",
        query: "tier=Covert&risk=aggressive&budget=50&sort=roi&owned=0",
      }),
    ).toBe("/tradeups?tier=Covert&risk=aggressive");
    expect(alertUrl({ kind: "deals", query: "q=AK&dips=1" })).toBe(
      "/deals?q=AK&dips=1",
    );
  });

  it("saves alerts and ignores a damaged list", () => {
    const db = openDb(":memory:");
    expect(listAlerts(db)).toEqual([]);
    saveAlerts(db, [alert()]);
    expect(listAlerts(db)).toEqual([alert()]);
    setMeta(db, "alerts", "{broken");
    expect(listAlerts(db)).toEqual([]);
  });
});
