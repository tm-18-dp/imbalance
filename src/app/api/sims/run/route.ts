import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/same-origin";
import { SIM_RUN_EVERY_MS } from "@/lib/sim";
import { listBots, runBot } from "@/lib/sim-data";
import { forbidden } from "../../errors";
import { searchTradeups } from "../search";

/** One run at a time: trade-up bots search for a few seconds each. */
let running = false;

/**
 * Gives every active bot its turn when it's due (prices update every 10 minutes). Open
 * pages call this after each price update; bots only trade while the app is open.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  if (running) return Response.json({ busy: true, ran: 0 });
  running = true;
  try {
    const db = getDb();
    const now = Date.now();
    let ran = 0;
    for (const bot of listBots(db)) {
      if (!bot.active) continue;
      if (bot.lastRunAt != null && now - bot.lastRunAt < SIM_RUN_EVERY_MS)
        continue;
      await runBot(db, bot.id, { now, random: Math.random, searchTradeups });
      ran++;
    }
    return Response.json({ ran });
  } finally {
    running = false;
  }
}
