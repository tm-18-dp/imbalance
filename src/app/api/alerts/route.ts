import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import {
  alertSchema,
  alertUrl,
  cleanQuery,
  listAlerts,
  MAX_ALERTS,
  newAlertSchema,
  saveAlerts,
} from "@/lib/alerts";
import { isSameOrigin } from "@/lib/same-origin";
import { errorResponse, forbidden } from "../errors";
import { runSearch } from "./run";

/** Saved alerts, without the long list of results already reported. */
export async function GET() {
  await connection();
  return Response.json({
    alerts: listAlerts(getDb()).map((a) => ({
      ...alertSchema.omit({ seen: true }).parse(a),
      url: alertUrl(a),
    })),
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), alert: newAlertSchema }),
  z.object({ action: z.literal("delete"), id: z.string().max(40) }),
]);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("That alert isn't complete.");
    const db = getDb();
    const a = parsed.data;
    const alerts = listAlerts(db);
    if (a.action === "delete") {
      saveAlerts(
        db,
        alerts.filter((x) => x.id !== a.id),
      );
      return Response.json({ ok: true });
    }
    if (alerts.length >= MAX_ALERTS)
      throw new Error(
        `You have ${MAX_ALERTS} alerts already. Delete one on the Dashboard first.`,
      );
    const query = cleanQuery(a.alert.kind, a.alert.query);
    // What the search finds right now is already on your screen: only later finds alert.
    const now = await runSearch(a.alert.kind, query);
    const alert = {
      ...a.alert,
      query,
      id: randomUUID(),
      createdAt: Date.now(),
      seen: now.map((i) => i.key).slice(-500),
      lastHit: null,
    };
    saveAlerts(db, [...alerts, alert]);
    return Response.json({ id: alert.id });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
