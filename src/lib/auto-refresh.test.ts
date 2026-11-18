import { describe, expect, it } from "vitest";
import { AUTO_REFRESH_MS, autoRefreshDue } from "./auto-refresh";

describe("auto refresh", () => {
  const now = 100 * AUTO_REFRESH_MS;

  it("never starts the first download by itself", () => {
    expect(autoRefreshDue(null, null, now)).toBe(false);
  });

  it("runs once prices are 10 minutes old", () => {
    expect(autoRefreshDue(now - AUTO_REFRESH_MS + 1, null, now)).toBe(false);
    expect(autoRefreshDue(now - AUTO_REFRESH_MS, null, now)).toBe(true);
  });

  it("waits 10 minutes after a failed try too", () => {
    const old = now - 3 * AUTO_REFRESH_MS;
    expect(autoRefreshDue(old, now - 60_000, now)).toBe(false);
    expect(autoRefreshDue(old, now - AUTO_REFRESH_MS, now)).toBe(true);
  });
});
