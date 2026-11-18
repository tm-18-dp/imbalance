import { describe, expect, it } from "vitest";
import {
  contractTimeline,
  DAY,
  daysToSell,
  MAX_SELL_DAYS,
  nextSteps,
} from "./timeline";

describe("timeline", () => {
  it("estimates days to sell from 30-day sales", () => {
    expect(daysToSell(0)).toBeNull();
    expect(daysToSell(90)).toBe(1);
    expect(daysToSell(1000)).toBe(0.5);
    expect(daysToSell(1)).toBe(MAX_SELL_DAYS);
  });

  it("queues thin items behind a quarter of what is listed", () => {
    // Sells often: 3 sales go by first, however many are listed.
    expect(daysToSell(30, 200)).toBe(3);
    // 5 sales a month, 80 listed: halfway thin, so 3 + 0.5 * (20 - 3) = 11.5 sales ahead.
    expect(daysToSell(5, 80)).toBeCloseTo(69);
    // Few listed: no longer than the usual 3-sale queue.
    expect(daysToSell(5, 2)).toBe(18);
    expect(daysToSell(2, 100)).toBe(MAX_SELL_DAYS);
  });

  it("adds the trade hold and the expected selling time", () => {
    const t = contractTimeline(7, [
      { probability: 0.5, volume30d: 90 }, // 1 day
      { probability: 0.5, volume30d: 0 }, // unsellable: 90 days
    ]);
    expect(t).toEqual({ holdDays: 7, sellDays: 45.5, totalDays: 52.5 });
  });

  it("says what to do with each item and when to come back", () => {
    const now = 100 * DAY;
    const h = (
      id: number,
      tradableAt: number,
      costCents: number,
      valueCents: number | null,
      status = "holding",
    ) => ({
      id,
      marketHashName: `Item ${id}`,
      tradableAt,
      status,
      costCents,
      valueCents,
    });
    const { steps, comeBackAt } = nextSteps(
      [
        h(1, now + 3 * DAY, 100, 200),
        h(2, now - DAY, 100, 150),
        h(3, now - DAY, 100, 80),
        h(4, now + DAY, 100, 90),
        h(5, 0, 1, 1, "sold"),
      ],
      now,
    );
    expect(steps.map((s) => [s.id, s.kind])).toEqual([
      [2, "sell"],
      [3, "hold"],
      [4, "wait"],
      [1, "wait"],
    ]);
    expect(steps[0].gainCents).toBe(50);
    expect(comeBackAt).toBe(now + DAY);
  });
});
