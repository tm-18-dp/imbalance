import { describe, expect, it } from "vitest";
import { isLocalHost } from "./local-host";
import { isSameOrigin } from "./same-origin";

describe("isLocalHost", () => {
  it.each([
    "localhost",
    "localhost:3000",
    "127.0.0.1:3001",
    "[::1]:3000",
    "LOCALHOST:3000",
  ])("accepts %s", (h) => expect(isLocalHost(h)).toBe(true));
  it.each([
    null,
    "",
    "evil.com:3000",
    "localhost.evil.com:3000",
    "127.0.0.1.nip.io",
    "192.168.1.5:3000",
  ])("rejects %s", (h) => expect(isLocalHost(h)).toBe(false));
});

describe("isSameOrigin", () => {
  const post = (origin: string, host: string) =>
    new Request("http://localhost:3000/api/keys", {
      method: "POST",
      headers: { origin, host },
    });

  it("allows the app itself", () => {
    expect(isSameOrigin(post("http://localhost:3000", "localhost:3000"))).toBe(
      true,
    );
  });
  it("blocks other websites", () => {
    expect(isSameOrigin(post("https://evil.com", "localhost:3000"))).toBe(
      false,
    );
  });
  it("blocks DNS rebinding, where Origin and Host match but aren't local", () => {
    expect(isSameOrigin(post("http://evil.com:3000", "evil.com:3000"))).toBe(
      false,
    );
  });
});
