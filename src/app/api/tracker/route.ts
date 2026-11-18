import { z } from "zod";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { baseSkinName } from "@/lib/deals";
import { MARKETPLACE_IDS, MARKETPLACES } from "@/lib/fees";
import { isSameOrigin } from "@/lib/same-origin";
import { priceLookup } from "@/lib/tradeup-data";
import {
  addHolding,
  buySchema,
  deleteHolding,
  getSettings,
  importTracker,
  listHoldings,
  markSold,
  portfolio,
  recordTradeUp,
  saveSettings,
  settingsPatchSchema,
} from "@/lib/tracker";
import { nextSteps } from "@/lib/timeline";
import { errorResponse, forbidden } from "../errors";

export async function GET() {
  await connection();
  const db = getDb();
  const settings = getSettings(db);
  const lookup = priceLookup(db);
  const market = MARKETPLACES[settings.sellMarket];
  const images = new Map(
    (
      db.prepare("SELECT name, image FROM skins").all() as {
        name: string;
        image: string | null;
      }[]
    ).map((r) => [r.name, r.image]),
  );
  const holdings = listHoldings(db).map((h) => {
    const { sellCents, volume30d } = lookup(h.marketHashName, h.version);
    return {
      ...h,
      image: images.get(baseSkinName(h.marketHashName)) ?? null,
      valueCents: sellCents == null ? null : market.net(sellCents),
      volume30d,
    };
  });
  const values = new Map(holdings.map((h) => [h.id, h.valueCents]));
  return Response.json({
    holdings,
    settings,
    portfolio: portfolio(holdings, (h) => values.get(h.id) ?? null),
    ...nextSteps(holdings, Date.now()),
  });
}

const id = z.number().int().positive();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), item: buySchema }),
  z.object({
    action: z.literal("sell"),
    id,
    soldCents: z.number().int().min(0),
    market: z.enum(MARKETPLACE_IDS),
    soldAt: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("tradeup"),
    inputIds: z.array(id).max(10),
    output: z.object({
      marketHashName: z.string().trim().min(1).max(200),
      float: z.number().min(0).max(1).nullish(),
    }),
    at: z.number().int().positive(),
  }),
  z.object({ action: z.literal("delete"), id }),
  z.object({
    action: z.literal("settings"),
    settings: settingsPatchSchema,
  }),
  z.object({ action: z.literal("import"), data: z.unknown() }),
]);

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbidden();
  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success)
      throw new Error(
        "Some fields are missing or wrong. Check the form and try again.",
      );
    const db = getDb();
    const a = parsed.data;
    if (a.action === "buy")
      return Response.json({ id: addHolding(db, a.item) });
    if (a.action === "sell")
      markSold(db, a.id, a.soldCents, a.market, a.soldAt);
    if (a.action === "tradeup")
      return Response.json({
        id: recordTradeUp(db, a.inputIds, a.output, a.at),
      });
    if (a.action === "delete") deleteHolding(db, a.id);
    if (a.action === "settings")
      return Response.json({ settings: saveSettings(db, a.settings) });
    if (a.action === "import")
      return Response.json({ imported: importTracker(db, a.data) });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
