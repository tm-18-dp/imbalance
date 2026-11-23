import { afterEach, describe, expect, it } from "vitest";
import { gapMs, MAX_WAIT_MS, resetThrottle, throttle } from "./limiter";

afterEach(resetThrottle);

describe("request limiter", () => {
  it("spaces calls per host and leaves other hosts alone", () => {
    expect(gapMs("csfloat.com")).toBe(2000);
    expect(gapMs("steamcommunity.com")).toBe(3000);
    expect(gapMs("generativelanguage.googleapis.com")).toBe(2000);
    expect(gapMs("api.groq.com")).toBe(2000);
    expect(gapMs("openrouter.ai")).toBe(2000);
    expect(gapMs("api.skinport.com")).toBe(0);
    // A look-alike host is not the real one.
    expect(gapMs("openrouter.ai.example.com")).toBe(0);
  });

  it("queues calls made at the same time", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await throttle("steamcommunity.com", 1000, sleep);
    await throttle("steamcommunity.com", 1000, sleep);
    await throttle("steamcommunity.com", 1000, sleep);
    expect(waits).toEqual([3000, 6000]);
    // Later on, the slot is free again.
    await throttle("steamcommunity.com", 20_000, sleep);
    expect(waits).toEqual([3000, 6000]);
  });

  it("refuses when the queue is longer than the wait limit", async () => {
    const sleep = async () => {};
    const calls = Math.floor(MAX_WAIT_MS / 3000) + 1;
    for (let i = 0; i < calls; i++)
      await throttle("steamcommunity.com", 0, sleep);
    await expect(throttle("steamcommunity.com", 0, sleep)).rejects.toThrow(
      /Too many calls/,
    );
  });
});
