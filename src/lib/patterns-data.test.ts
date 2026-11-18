import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readUserPatterns } from "./patterns-data";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imbalance-patterns-"));
const file = path.join(dir, "patterns.json");
afterEach(() => fs.rmSync(file, { force: true }));

describe("readUserPatterns", () => {
  it("is empty without a file", () => {
    expect(readUserPatterns(file)).toEqual({ patterns: [] });
  });
  it("reads a valid list", () => {
    fs.writeFileSync(
      file,
      JSON.stringify([
        { skin: "AK-47 | Case Hardened", seeds: [151, 955], label: "Tier 1" },
      ]),
    );
    expect(readUserPatterns(file).patterns[0].seeds).toEqual([151, 955]);
  });
  it("explains broken files instead of crashing", () => {
    fs.writeFileSync(file, "{ not json");
    expect(readUserPatterns(file).error).toMatch(/isn't valid JSON/);
    fs.writeFileSync(
      file,
      JSON.stringify([{ skin: "AK", seeds: [], label: "x" }]),
    );
    const r = readUserPatterns(file);
    expect(r.patterns).toEqual([]);
    expect(r.error).toMatch(/^data\/patterns\.json: entry 0/);
  });
});
