/**
 * Pattern (paint seed) premiums. Some finishes look different on every item, and the
 * best-looking patterns sell for many times the usual price. Imbalance only flags them:
 * pricing a pattern needs sales of that exact pattern, which it doesn't have.
 */

/** Finishes whose look, and so value, depends on the pattern. */
const PATTERN_FINISHES: { finish: string; note: string; also?: string[] }[] = [
  {
    finish: "Case Hardened",
    note: "How much blue shows depends on the pattern; mostly-blue 'blue gems' sell for many times the usual price",
  },
  {
    finish: "Heat Treated",
    note: "Like Case Hardened: the amount of blue depends on the pattern",
  },
  {
    finish: "Marble Fade",
    note: "Colour placement depends on the pattern; some (like 'fire and ice') sell for much more",
  },
  {
    finish: "Fade",
    note: "How much of the fade shows depends on the pattern (the 'fade %'); higher fades sell for more",
  },
  {
    finish: "Crimson Web",
    note: "Web placement depends on the pattern; webs in the right spots sell for more",
  },
  {
    finish: "Slaughter",
    note: "Some patterns show shapes collectors pay extra for",
  },
  {
    finish: "Doppler",
    also: ["Gamma Doppler"],
    note: "Beyond the phase, some patterns look better and sell for more",
  },
];

export type KnownPattern = {
  /** Skin name without wear, e.g. "AK-47 | Case Hardened". */
  skin: string;
  seeds: number[];
  label: string;
};

/**
 * A few patterns well known enough to build in. Kept short on purpose: a wrong seed could
 * cost money. Add your own in data/patterns.json (see `userPatternsSchema`).
 */
export const BUILT_IN_PATTERNS: KnownPattern[] = [
  { skin: "AK-47 | Case Hardened", seeds: [661], label: "Blue gem" },
  { skin: "★ Karambit | Case Hardened", seeds: [387], label: "Blue gem" },
  { skin: "Five-SeveN | Case Hardened", seeds: [278], label: "Blue gem" },
];

export type PatternFlag = {
  /** The finish's value depends on the pattern. */
  sensitive: { finish: string; note: string } | null;
  /** This exact pattern is on a list of premium ones. */
  known: { label: string; source: "built-in" | "yours" } | null;
};

/** "StatTrak™ AK-47 | Case Hardened (Field-Tested)" -> "AK-47 | Case Hardened". */
export function skinOf(name: string): string {
  return name
    .replace(
      / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/,
      "",
    )
    .replace("StatTrak™ ", "")
    .replace(/^Souvenir /, "");
}

/** The pattern-sensitive finish of a skin, if any. Exact names only: "Amber Fade" is not "Fade". */
export function patternFinish(
  name: string,
): { finish: string; note: string } | null {
  const finish = skinOf(name).split(" | ")[1] ?? "";
  const hit = PATTERN_FINISHES.find(
    (f) => finish === f.finish || f.also?.includes(finish),
  );
  return hit ? { finish: hit.finish, note: hit.note } : null;
}

/** Flags for one item and pattern: does the pattern matter, and is it a known premium one? */
export function patternFlag(
  name: string,
  seed: number | null | undefined,
  userPatterns: readonly KnownPattern[] = [],
): PatternFlag {
  const sensitive = patternFinish(name);
  if (seed == null) return { sensitive, known: null };
  const skin = skinOf(name);
  const find = (list: readonly KnownPattern[]) =>
    list.find((p) => p.skin === skin && p.seeds.includes(seed));
  const mine = find(userPatterns);
  const builtIn = find(BUILT_IN_PATTERNS);
  return {
    sensitive,
    known: mine
      ? { label: mine.label, source: "yours" }
      : builtIn
        ? { label: builtIn.label, source: "built-in" }
        : null,
  };
}
