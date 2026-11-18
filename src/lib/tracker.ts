import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { getMeta, setMeta, transaction } from "./db";
import { MARKETPLACE_IDS, MARKETPLACES, type MarketplaceId } from "./fees";
import { RISK_PROFILE_IDS } from "./risk";
import { STRATEGIES } from "./results";
import {
  expectationSchema,
  readExpectation,
  type Expectation,
} from "./expectation";

export const DAY = 86_400_000;

const settingFields = {
  /** Days a newly bought item can't be traded or sold elsewhere (CS2 trade protection). */
  holdDays: z.number().int().min(0).max(30),
  sellMarket: z.enum(MARKETPLACE_IDS),
  /** How much risk Trade-ups and Deals let through. Safe is how the app always worked. */
  riskProfile: z.enum(RISK_PROFILE_IDS),
  /** Money set aside for trading, in USD cents. Null when not set: no sizing warnings. */
  bankrollCents: z.number().int().min(0).max(1e10).nullable(),
};

export const settingsSchema = z.object({
  holdDays: settingFields.holdDays.default(7),
  sellMarket: settingFields.sellMarket.default("skinport"),
  riskProfile: settingFields.riskProfile.default("safe"),
  bankrollCents: settingFields.bankrollCents.default(null),
});
export type Settings = z.infer<typeof settingsSchema>;

/**
 * A change to some settings. No defaults on purpose: `settingsSchema.partial()` would fill
 * in every missing field with its default and quietly reset the user's other settings.
 */
export const settingsPatchSchema = z.object(settingFields).partial();

export function getSettings(db: DatabaseSync): Settings {
  const raw = getMeta(db, "settings");
  const parsed = settingsSchema.safeParse(raw ? JSON.parse(raw) : {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export function saveSettings(db: DatabaseSync, s: Partial<Settings>): Settings {
  const next = settingsSchema.parse({ ...getSettings(db), ...s });
  setMeta(db, "settings", JSON.stringify(next));
  return next;
}

export type Holding = {
  id: number;
  marketHashName: string;
  version: string;
  float: number | null;
  costCents: number;
  boughtAt: number;
  tradableAt: number;
  source: string;
  status: "holding" | "used" | "sold";
  usedIn: number | null;
  soldCents: number | null;
  soldNetCents: number | null;
  soldOn: string | null;
  soldAt: number | null;
  note: string | null;
  /** The strategy it was bought for (see `STRATEGIES`), null if not tagged. */
  strategy: string | null;
  /** The risk level it was picked at, null if not tagged. */
  risk: string | null;
  /** For a trade-up's result: what the app expected when it was recorded. */
  expected: Expectation | null;
};

const name = z.string().trim().min(1).max(200);
const cents = z.number().int().min(0).max(1e10);
const floatValue = z.number().min(0).max(1).nullish();
const strategy = z.enum(STRATEGIES).nullish();
const risk = z.enum(RISK_PROFILE_IDS).nullish();
export const tagSchema = z.object({ strategy, risk });

export const buySchema = z.object({
  marketHashName: name,
  version: z.string().max(50).default(""),
  float: floatValue,
  costCents: cents,
  boughtAt: z.number().int().positive(),
  source: z.string().max(40).default("skinport"),
  note: z.string().max(500).nullish(),
  strategy,
  risk,
});

export function addHolding(
  db: DatabaseSync,
  input: z.input<typeof buySchema>,
): number {
  const b = buySchema.parse(input);
  const tradableAt = b.boughtAt + getSettings(db).holdDays * DAY;
  return Number(
    db
      .prepare(
        `INSERT INTO holdings (market_hash_name, version, float_value, cost_cents, bought_at, tradable_at, source, note,
           strategy, risk)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        b.marketHashName,
        b.version,
        b.float ?? null,
        b.costCents,
        b.boughtAt,
        tradableAt,
        b.source,
        b.note ?? null,
        b.strategy ?? null,
        b.risk ?? null,
      ).lastInsertRowid,
  );
}

function getHolding(db: DatabaseSync, id: number): Holding {
  const h = listHoldings(db).find((x) => x.id === id);
  if (!h) throw new Error("That item isn't in your tracker any more.");
  return h;
}

export function markSold(
  db: DatabaseSync,
  id: number,
  soldCents: number,
  market: MarketplaceId,
  soldAt: number,
): void {
  const h = getHolding(db, id);
  if (h.status !== "holding")
    throw new Error("Only items you still hold can be sold.");
  cents.parse(soldCents);
  db.prepare(
    "UPDATE holdings SET status = 'sold', sold_cents = ?, sold_net_cents = ?, sold_on = ?, sold_at = ? WHERE id = ?",
  ).run(soldCents, MARKETPLACES[market].net(soldCents), market, soldAt, id);
}

/** Sets or clears the strategy and risk tags of one entry. */
export function tagHolding(
  db: DatabaseSync,
  id: number,
  tags: z.input<typeof tagSchema>,
): void {
  getHolding(db, id);
  const t = tagSchema.parse(tags);
  db.prepare("UPDATE holdings SET strategy = ?, risk = ? WHERE id = ?").run(
    t.strategy ?? null,
    t.risk ?? null,
    id,
  );
}

/**
 * Records a trade-up: the inputs are used up and the output becomes a new holding that cost
 * what the inputs cost. It stays locked until the latest-unlocking input would have. The
 * output is tagged as a trade-up, at the given risk level or else the one all its inputs
 * share.
 */
export function recordTradeUp(
  db: DatabaseSync,
  inputIds: number[],
  output: {
    marketHashName: string;
    version?: string;
    float?: number | null;
    risk?: (typeof RISK_PROFILE_IDS)[number] | null;
  },
  at: number,
  /** Works out what the app expects from these inputs, saved on the result. */
  expect?: (inputs: Holding[]) => Expectation | null,
): number {
  if (inputIds.length !== 10 && inputIds.length !== 5)
    throw new Error("A trade-up uses 10 skins (or 5 Coverts).");
  if (new Set(inputIds).size !== inputIds.length)
    throw new Error("Each skin can only go in once.");
  return transaction(db, () => {
    const inputs = inputIds.map((id) => getHolding(db, id));
    if (inputs.some((h) => h.status !== "holding"))
      throw new Error("Some of those skins are already used or sold.");
    const risks = new Set(inputs.map((h) => h.risk));
    const shared = risks.size === 1 ? [...risks][0] : null;
    const id = addHolding(db, {
      marketHashName: output.marketHashName,
      version: output.version ?? "",
      float: output.float ?? null,
      costCents: inputs.reduce((s, h) => s + h.costCents, 0),
      boughtAt: at,
      source: "trade-up",
      strategy: "trade-up",
      risk: output.risk ?? risk.safeParse(shared).data ?? null,
    });
    const tradableAt = Math.max(at, ...inputs.map((h) => h.tradableAt));
    const expected = expect?.(inputs) ?? null;
    db.prepare(
      "UPDATE holdings SET tradable_at = ?, expected = ? WHERE id = ?",
    ).run(tradableAt, expected ? JSON.stringify(expected) : null, id);
    const use = db.prepare(
      "UPDATE holdings SET status = 'used', used_in = ? WHERE id = ?",
    );
    for (const h of inputs) use.run(id, h.id);
    return id;
  });
}

export function deleteHolding(db: DatabaseSync, id: number): void {
  getHolding(db, id);
  db.prepare("DELETE FROM holdings WHERE id = ?").run(id);
}

type Row = Record<string, string | number | null>;
const toHolding = (r: Row): Holding => ({
  id: Number(r.id),
  marketHashName: String(r.market_hash_name),
  version: String(r.version),
  float: r.float_value == null ? null : Number(r.float_value),
  costCents: Number(r.cost_cents),
  boughtAt: Number(r.bought_at),
  tradableAt: Number(r.tradable_at),
  source: String(r.source),
  status: r.status as Holding["status"],
  usedIn: r.used_in == null ? null : Number(r.used_in),
  soldCents: r.sold_cents == null ? null : Number(r.sold_cents),
  soldNetCents: r.sold_net_cents == null ? null : Number(r.sold_net_cents),
  soldOn: r.sold_on == null ? null : String(r.sold_on),
  soldAt: r.sold_at == null ? null : Number(r.sold_at),
  note: r.note == null ? null : String(r.note),
  strategy: r.strategy == null ? null : String(r.strategy),
  risk: r.risk == null ? null : String(r.risk),
  expected: readExpectation(r.expected),
});

export function listHoldings(db: DatabaseSync): Holding[] {
  return (
    db
      .prepare("SELECT * FROM holdings ORDER BY bought_at DESC, id DESC")
      .all() as Row[]
  ).map(toHolding);
}

export type Portfolio = {
  investedCents: number;
  valueCents: number;
  unrealizedCents: number;
  realizedCents: number;
  holding: number;
};

/** Value of what you hold (after the sell fee) and profit from what you sold. */
export function portfolio(
  holdings: Holding[],
  netValue: (h: Holding) => number | null,
): Portfolio {
  const held = holdings.filter((h) => h.status === "holding");
  const investedCents = held.reduce((s, h) => s + h.costCents, 0);
  const valueCents = held.reduce((s, h) => s + (netValue(h) ?? h.costCents), 0);
  const realizedCents = holdings
    .filter((h) => h.status === "sold")
    .reduce((s, h) => s + (h.soldNetCents ?? 0) - h.costCents, 0);
  return {
    investedCents,
    valueCents,
    unrealizedCents: valueCents - investedCents,
    realizedCents,
    holding: held.length,
  };
}

const exportSchema = z.object({
  app: z.literal("imbalance"),
  version: z.literal(1),
  settings: settingsPatchSchema.optional(),
  holdings: z.array(
    z.object({
      id: z.number().int(),
      marketHashName: name,
      version: z.string().max(50),
      float: floatValue,
      costCents: cents,
      boughtAt: z.number().int(),
      tradableAt: z.number().int(),
      source: z.string().max(40),
      status: z.enum(["holding", "used", "sold"]),
      usedIn: z.number().int().nullish(),
      soldCents: cents.nullish(),
      soldNetCents: cents.nullish(),
      soldOn: z.string().max(40).nullish(),
      soldAt: z.number().int().nullish(),
      note: z.string().max(500).nullish(),
      // Backups from before tags have none.
      strategy,
      risk,
      expected: expectationSchema.nullish(),
    }),
  ),
});

export function exportTracker(db: DatabaseSync) {
  return {
    app: "imbalance" as const,
    version: 1 as const,
    settings: getSettings(db),
    holdings: listHoldings(db),
  };
}

/** Replaces the tracker with a backup. All or nothing: a bad file changes nothing. */
export function importTracker(db: DatabaseSync, data: unknown): number {
  const parsed = exportSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("That file isn't an Imbalance backup, or it's damaged.");
  const { holdings, settings } = parsed.data;
  transaction(db, () => {
    db.exec("DELETE FROM holdings");
    const ins = db.prepare(
      `INSERT INTO holdings (id, market_hash_name, version, float_value, cost_cents, bought_at, tradable_at, source,
         status, used_in, sold_cents, sold_net_cents, sold_on, sold_at, note, strategy, risk, expected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const h of holdings) {
      ins.run(
        h.id,
        h.marketHashName,
        h.version,
        h.float ?? null,
        h.costCents,
        h.boughtAt,
        h.tradableAt,
        h.source,
        h.status,
        h.usedIn ?? null,
        h.soldCents ?? null,
        h.soldNetCents ?? null,
        h.soldOn ?? null,
        h.soldAt ?? null,
        h.note ?? null,
        h.strategy ?? null,
        h.risk ?? null,
        h.expected ? JSON.stringify(h.expected) : null,
      );
    }
    if (settings) saveSettings(db, settings);
  });
  return holdings.length;
}
