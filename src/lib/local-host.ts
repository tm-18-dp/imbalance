const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True when a Host header (or URL host) names this computer: localhost, 127.0.0.1 or [::1],
 * with any port. A website can point its own domain at 127.0.0.1 (DNS rebinding) and then
 * talk to Imbalance as "same origin", but its requests still carry its own domain in Host,
 * so checking the name blocks it.
 */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  return LOCAL_NAMES.has(name);
}
