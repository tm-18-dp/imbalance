import { getDb, getMeta, setMeta } from "@/lib/db";
import {
  fetchSkinport,
  saveSkinport,
  SYNC_COOLDOWN_MS,
} from "@/lib/prices/skinport";
import { cooldownLeft } from "@/lib/sync-state";
import { autoRefreshDue } from "@/lib/auto-refresh";
import { isSameOrigin } from "@/lib/same-origin";
import { errorResponse, forbidden } from "../../errors";

/** One update at a time, even with several tabs open. */
let running = false;

const metaTime = (db: ReturnType<typeof getDb>, key: string) => {
  const v = getMeta(db, key);
  return v ? Number(v) : null;
};

/**
 * Updates Skinport prices. `?auto=1` is the background refresh from open pages: the server
 * decides whether it's due (see `autoRefreshDue`) and answers `{ skipped: true }` when not,
 * so any number of open tabs cause at most one update.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  const db = getDb();
  const auto = new URL(req.url).searchParams.get("auto") === "1";
  const syncedAt = metaTime(db, "skinport_synced_at");

  if (auto) {
    const due = autoRefreshDue(
      syncedAt,
      metaTime(db, "skinport_auto_tried_at"),
      Date.now(),
    );
    if (!due || running) return Response.json({ skipped: true, syncedAt });
    setMeta(db, "skinport_auto_tried_at", String(Date.now()));
  } else {
    if (running)
      return Response.json(
        { error: "Prices are already updating. Give it a moment." },
        { status: 429 },
      );
    const wait = cooldownLeft(db, "skinport_synced_at", SYNC_COOLDOWN_MS);
    if (wait > 0) {
      const min = Math.ceil(wait / 60_000);
      return Response.json(
        {
          error: `Prices were updated recently. Skinport allows a refresh every 5 minutes, try again in ${min} min.`,
        },
        { status: 429 },
      );
    }
  }

  running = true;
  try {
    const saved = saveSkinport(db, await fetchSkinport());
    return Response.json({
      ...saved,
      syncedAt: metaTime(db, "skinport_synced_at"),
    });
  } catch (err) {
    return errorResponse(err, 502);
  } finally {
    running = false;
  }
}
