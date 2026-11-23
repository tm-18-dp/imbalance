/**
 * Spaces out calls to outside APIs so bursts (many Steam checks, CSFloat listings, AI
 * questions) can't get the user's IP blocked. Adapted from the original Imbalance repo
 * (4bdulllahh/imbalance, M19), without its settings page: these are its defaults.
 * Skinport has its own 5-minute cooldown in sync-state.ts.
 */
export const GAPS_MS = {
  csfloat: 2_000,
  /** Steam allows roughly 20 calls a minute. */
  steam: 3_000,
  ai: 2_000,
};

/** Milliseconds to wait between calls to a host, 0 for hosts without a limit. */
export function gapMs(host: string): number {
  if (host.endsWith("csfloat.com")) return GAPS_MS.csfloat;
  if (host.endsWith("steamcommunity.com")) return GAPS_MS.steam;
  if (/googleapis\.com$|groq\.com$|openrouter\.ai$/.test(host))
    return GAPS_MS.ai;
  return 0;
}

/** Longest a call waits in line before giving up with a plain-English error. */
export const MAX_WAIT_MS = 20_000;

// On globalThis so dev hot reloads keep one queue.
const g = globalThis as unknown as { imbalanceNextCall?: Map<string, number> };
const next = (g.imbalanceNextCall ??= new Map<string, number>());

/**
 * Waits for this host's turn. Each call books the next free slot first, so calls made at
 * the same time queue up instead of all going at once.
 */
export async function throttle(
  host: string,
  now = Date.now(),
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<void> {
  const gap = gapMs(host);
  if (!gap) return;
  const at = Math.max(now, next.get(host) ?? 0);
  if (at - now > MAX_WAIT_MS)
    throw new Error(
      `Too many calls to ${host} at once (one every ${gap / 1000} s). Try again in ${Math.ceil((at - now) / 1000)} s.`,
    );
  next.set(host, at + gap);
  if (at > now) await sleep(at - now);
}

/** For tests: forget every booked slot. */
export const resetThrottle = () => next.clear();
