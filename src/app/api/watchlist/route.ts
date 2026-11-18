import { z } from "zod";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { addWatch, listWatch, removeWatch } from "@/lib/watchlist";
import { errorResponse, forbidden } from "../errors";

export async function GET() {
  await connection();
  return Response.json({ items: listWatch(getDb()) });
}

const actionSchema = z.object({
  action: z.enum(["add", "remove"]),
  name: z.string().trim().min(1).max(200),
  version: z.string().max(50).default(""),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("Pick an item to star.");
    const { action, name, version } = parsed.data;
    const db = getDb();
    if (action === "add") addWatch(db, name, version);
    else removeWatch(db, name, version);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
