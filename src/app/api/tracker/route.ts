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
  tagHolding,
  tagSchema,
} from "@/lib/tracker";
import { RISK_PROFILE_IDS } from "@/lib/risk";
import { monthlyRealized, resultsBy } from "@/lib/results";
import { chanceOfResult, expectedVsActual } from "@/lib/expectation";
import { expectTradeUp } from "@/lib/tradeup-expect";
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
    results: {
      strategy: {
        rows: resultsBy(holdings, "strategy"),
        ...monthlyRealized(holdings, "strategy"),
      },
      risk: {
        rows: resultsBy(holdings, "risk"),
        ...monthlyRealized(holdings, "risk"),
      },
    },
    expectedVsActual: expectedVsActual(
      holdings.flatMap((h) =>
        h.expected && h.status !== "used"
          ? [
              {
                id: h.id,
                marketHashName: h.marketHashName,
                costCents: h.costCents,
                expectedCents: h.expected.evCents,
                sdCents: h.expected.sdCents,
                actualCents:
                  h.status === "sold" ? h.soldNetCents : h.valueCents,
                sold: h.status === "sold",
                chance: chanceOfResult(h.expected, h.marketHashName),
                floatsEstimated: h.expected.floatsEstimated,
              },
            ]
          : [],
      ),
    ),
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
      risk: z.enum(RISK_PROFILE_IDS).nullish(),
    }),
    at: z.number().int().positive(),
  }),
  z.object({ action: z.literal("tag"), id, tags: tagSchema }),
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
    if (a.action === "tradeup") {
      // What the app expects from these exact inputs at today's prices, for T2.
      let reason: string | null = null;
      const id = recordTradeUp(db, a.inputIds, a.output, a.at, (inputs) => {
        const e = expectTradeUp(db, inputs, getSettings(db).sellMarket);
        if ("reason" in e) reason = e.reason;
        return "expectation" in e ? e.expectation : null;
      });
      return Response.json({ id, noExpectation: reason });
    }
    if (a.action === "delete") deleteHolding(db, a.id);
    if (a.action === "tag") tagHolding(db, a.id, a.tags);
    if (a.action === "settings")
      return Response.json({ settings: saveSettings(db, a.settings) });
    if (a.action === "import")
      return Response.json({ imported: importTracker(db, a.data) });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
