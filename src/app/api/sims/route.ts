import { z } from "zod";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { botSummary, newBotSchema } from "@/lib/sim";
import {
  botValuer,
  createBot,
  deleteBot,
  getBot,
  listBots,
  listPositions,
  listSnapshots,
  runBot,
  setBotActive,
} from "@/lib/sim-data";
import { errorResponse, forbidden } from "../errors";
import { searchTradeups } from "./search";

/** Every practice bot with where it stands, its positions and its value history. */
export async function GET() {
  await connection();
  const db = getDb();
  const now = Date.now();
  return Response.json({
    bots: listBots(db).map((bot) => {
      const value = botValuer(db, bot);
      const positions = listPositions(db, bot.id);
      return {
        ...bot,
        summary: botSummary(bot, positions, value),
        positions: positions.map((p) => ({
          ...p,
          valueCents: p.status === "holding" ? value(p) : null,
          // Decided here so the page renders without reading the clock.
          inHold: p.status === "holding" && p.tradableAt > now,
        })),
        history: listSnapshots(db, bot.id),
      };
    }),
  });
}

const id = z.number().int().positive();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), bot: newBotSchema }),
  z.object({ action: z.literal("pause"), id }),
  z.object({ action: z.literal("resume"), id }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("run"), id }),
]);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("Some bot settings are missing.");
    const db = getDb();
    const a = parsed.data;
    if (a.action === "create") {
      const newId = createBot(db, a.bot);
      // First turn straight away, so the new bot shows what it bought.
      const report = await runBot(db, newId, {
        now: Date.now(),
        random: Math.random,
        searchTradeups,
      });
      return Response.json({ id: newId, report });
    }
    if (a.action === "pause") setBotActive(db, a.id, false);
    if (a.action === "resume") setBotActive(db, a.id, true);
    if (a.action === "delete") deleteBot(db, a.id);
    if (a.action === "run") {
      getBot(db, a.id);
      return Response.json({
        report: await runBot(db, a.id, {
          now: Date.now(),
          random: Math.random,
          searchTradeups,
        }),
      });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
