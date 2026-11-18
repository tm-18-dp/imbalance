import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { KnownPattern } from "./patterns";

/**
 * Your own premium patterns, in data/patterns.json (the data folder is not in git, so
 * `git pull` never touches it). Example: docs/patterns.example.json.
 */
export const userPatternsSchema = z.array(
  z.object({
    skin: z.string().trim().min(3).max(200),
    seeds: z.array(z.number().int().min(0).max(100000)).min(1).max(5000),
    label: z.string().trim().min(1).max(60),
  }),
);

export const patternsFile = () =>
  process.env.IMBALANCE_PATTERNS_FILE ??
  path.join(process.cwd(), "data", "patterns.json");

/** Reads the user's patterns. A missing file is fine; a broken one says what's wrong. */
export function readUserPatterns(file = patternsFile()): {
  patterns: KnownPattern[];
  error?: string;
} {
  let text: string;
  try {
    text = fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    return { patterns: [] };
  }
  try {
    const parsed = userPatternsSchema.safeParse(JSON.parse(text));
    if (parsed.success) return { patterns: parsed.data };
    const issue = parsed.error.issues[0];
    return {
      patterns: [],
      error:
        `data/patterns.json: entry ${String(issue.path[0] ?? "")} ${issue.path.slice(1).join(".")} ${issue.message}`.replace(
          /\s+/g,
          " ",
        ),
    };
  } catch {
    return {
      patterns: [],
      error:
        "data/patterns.json isn't valid JSON. Compare it with docs/patterns.example.json.",
    };
  }
}
