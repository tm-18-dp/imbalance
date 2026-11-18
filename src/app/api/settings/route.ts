import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { getSettings, saveSettings, settingsPatchSchema } from "@/lib/tracker";
import { errorResponse, forbidden } from "../errors";

/** App settings (trade hold, sell market, risk profile). */
export async function GET() {
  await connection();
  return Response.json(getSettings(getDb()));
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  try {
    const parsed = settingsPatchSchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("Those settings aren't valid.");
    return Response.json(saveSettings(getDb(), parsed.data));
  } catch (err) {
    return errorResponse(err, 400);
  }
}
