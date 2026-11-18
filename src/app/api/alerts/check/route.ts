import { getDb } from "@/lib/db";
import { alertUrl, listAlerts, newHits, saveAlerts } from "@/lib/alerts";
import { isSameOrigin } from "@/lib/same-origin";
import { forbidden } from "../../errors";
import { runSearch } from "../run";

/** One check at a time: each trade-up search takes a few seconds. */
let running = false;

/**
 * Reruns every saved alert and returns what's new since the last check. Open pages call
 * this after each price update; results are remembered here, so only one tab hears of each.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  if (running) return Response.json({ busy: true, hits: [] });
  running = true;
  try {
    const db = getDb();
    const found = [];
    for (const alert of listAlerts(db)) {
      const items = await runSearch(alert.kind, alert.query);
      const { hits, alert: next } = newHits(alert, items, Date.now());
      if (!hits.length) continue;
      // Saved per alert, re-read so an alert deleted meanwhile stays deleted.
      saveAlerts(
        db,
        listAlerts(db).map((a) => (a.id === next.id ? next : a)),
      );
      found.push({
        id: alert.id,
        name: alert.name,
        url: alertUrl(alert),
        count: hits.length,
        best: hits[0],
      });
    }
    return Response.json({ hits: found });
  } finally {
    running = false;
  }
}
