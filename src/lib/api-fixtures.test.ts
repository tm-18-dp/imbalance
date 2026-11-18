import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  geminiModels,
  geminiReply,
  openaiModels,
  openaiReply,
  pickModel,
} from "./ai";
import { listingsResponseSchema } from "./prices/csfloat";

/**
 * Real responses saved by `npm run record-fixtures` (keys never saved, other people's
 * account details removed). A missing file means its key wasn't set when recording: that
 * check is skipped, not failed.
 */
const DIR = path.join(__dirname, "fixtures");
const fixture = (name: string): unknown | null => {
  const file = path.join(DIR, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};
const check = (name: string, test: (body: unknown) => void) =>
  it.skipIf(fixture(name) == null)(name, () => test(fixture(name)));

describe("real API responses", () => {
  describe("model lists", () => {
    check("openrouter-models", (body) => {
      const ids = openaiModels.parse(body).data.map((m) => m.id);
      expect(ids.length).toBeGreaterThan(0);
      // The app only uses free OpenRouter models, and must find one.
      expect(pickModel("openrouter", ids)).toMatch(/:free$/);
    });
    check("groq-models", (body) => {
      const ids = openaiModels.parse(body).data.map((m) => m.id);
      expect(pickModel("groq", ids)).toBeTruthy();
    });
    check("gemini-models", (body) => {
      const ids = geminiModels
        .parse(body)
        .models.filter((m) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m) => m.name.replace(/^models\//, ""));
      expect(pickModel("gemini", ids)).toBeTruthy();
    });
  });

  describe("chat replies", () => {
    for (const name of ["openrouter-reply", "groq-reply"])
      check(name, (body) => {
        const r = openaiReply.parse(body);
        expect(r.choices[0]?.message.content?.trim()).toBeTruthy();
      });
    check("gemini-reply", (body) => {
      const r = geminiReply.parse(body);
      const text = r.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      expect(text?.trim()).toBeTruthy();
    });
  });

  describe("CSFloat listings", () => {
    for (const name of [
      "csfloat-listings-lowest-price",
      "csfloat-listings-lowest-float",
    ])
      check(name, (body) => {
        const rows = listingsResponseSchema.parse(body);
        expect(rows.length).toBeGreaterThan(0);
        for (const r of rows) {
          expect(r.item.market_hash_name).toBe(
            "AK-47 | Redline (Field-Tested)",
          );
          expect(r.price).toBeGreaterThan(0);
          expect(r.item.float_value).toBeGreaterThan(0);
        }
        if (name.endsWith("float")) {
          const floats = rows.map((r) => r.item.float_value ?? 1);
          expect(floats).toEqual([...floats].sort((a, b) => a - b));
        } else {
          const prices = rows.map((r) => r.price);
          expect(prices).toEqual([...prices].sort((a, b) => a - b));
        }
      });
  });

  it("never stores an API key", () => {
    if (!existsSync(DIR)) return;
    const text = readdirSync(DIR)
      .map((f) => readFileSync(path.join(DIR, f), "utf8"))
      .join(" ");
    // Shapes of the providers' keys: sk-or-..., gsk_..., AIza...
    expect(text).not.toMatch(/sk-or-|gsk_|AIza/);
  });
});
