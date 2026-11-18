/** How often prices refresh by themselves while the app is open. */
export const AUTO_REFRESH_MS = 10 * 60_000;
/** How often an open page asks the server whether a refresh is due. */
export const AUTO_CHECK_MS = 60_000;

/**
 * Whether a background price refresh should run now. Never before the first manual update
 * (that download is the user's choice), and at most once per `AUTO_REFRESH_MS` counting
 * failed tries too, so a Skinport outage can't burn through its rate limit.
 */
export function autoRefreshDue(
  lastSyncedAt: number | null,
  lastTriedAt: number | null,
  now: number,
): boolean {
  if (lastSyncedAt == null) return false;
  const last = Math.max(lastSyncedAt, lastTriedAt ?? 0);
  return now - last >= AUTO_REFRESH_MS;
}
