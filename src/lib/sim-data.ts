import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./db";
import { findDeals } from "./deals";
import { MARKETPLACES } from "./fees";
import { RISK_PROFILES } from "./risk";
import {
  MAX_BOTS,
  MAX_DEAL_BUYS_PER_RUN,
  SNAPSHOT_EVERY_MS,
  pickOutcome,
  type NewBot,
  type PositionDetail,
  type SimBot,
  type SimPosition,
} from "./sim";
import { daysToSell, MAX_SELL_DAYS } from "./timeline";
import { priceLookup } from "./tradeup-data";
import { getSettings } from "./tracker";
import { marketHashName, type WearName } from "./wear";

const DAY = 86_400_000;

type BotRow = {
  id: number;
  name: string;
  strategy: SimBot["strategy"];
  risk: SimBot["risk"];
  tier: string | null;
  market: SimBot["market"];
  start_cents: number;
  cash_cents: number;
  max_buy_share: number;
  active: number;
  created_at: number;
  last_run_at: number | null;
};
const toBot = (r: BotRow): SimBot => ({
  id: Number(r.id),
  name: r.name,
  strategy: r.strategy,
  risk: r.risk,
  tier: r.tier,
  market: r.market,
  startCents: Number(r.start_cents),
  cashCents: Number(r.cash_cents),
  maxBuyShare: Number(r.max_buy_share),
  active: Boolean(r.active),
  createdAt: Number(r.created_at),
  lastRunAt: r.last_run_at == null ? null : Number(r.last_run_at),
});

export function listBots(db: DatabaseSync): SimBot[] {
  return (
    db.prepare("SELECT * FROM sim_bots ORDER BY created_at").all() as BotRow[]
  ).map(toBot);
}

export function getBot(db: DatabaseSync, id: number): SimBot {
  const r = db.prepare("SELECT * FROM sim_bots WHERE id = ?").get(id) as
    BotRow | undefined;
  if (!r) throw new Error("That bot doesn't exist any more.");
  return toBot(r);
}

export function createBot(db: DatabaseSync, b: NewBot, now = Date.now()) {
  if (listBots(db).length >= MAX_BOTS)
    throw new Error(
      `You have ${MAX_BOTS} bots already. Delete one before adding another.`,
    );
  if (b.strategy === "tradeups" && !b.tier)
    throw new Error("Pick the rarity a trade-up bot puts in.");
  const id = Number(
    db
      .prepare(
        `INSERT INTO sim_bots (name, strategy, risk, tier, market, start_cents, cash_cents, max_buy_share, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        b.name,
        b.strategy,
        b.risk,
        b.strategy === "tradeups" ? (b.tier ?? null) : null,
        b.market,
        b.startCents,
        b.startCents,
        b.maxBuyShare,
        now,
      ).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO sim_snapshots (bot_id, at, value_cents) VALUES (?, ?, ?)",
  ).run(id, now, b.startCents);
  return id;
}

export function setBotActive(db: DatabaseSync, id: number, active: boolean) {
  getBot(db, id);
  db.prepare("UPDATE sim_bots SET active = ? WHERE id = ?").run(
    active ? 1 : 0,
    id,
  );
}

/** Deletes a bot with its positions and history (cascading foreign keys). */
export function deleteBot(db: DatabaseSync, id: number) {
  getBot(db, id);
  db.prepare("DELETE FROM sim_bots WHERE id = ?").run(id);
}

type PositionRow = {
  id: number;
  bot_id: number;
  market_hash_name: string;
  version: string;
  cost_cents: number;
  bought_at: number;
  tradable_at: number;
  sell_after: number;
  status: SimPosition["status"];
  sold_net_cents: number | null;
  sold_at: number | null;
  detail: string | null;
};
const toPosition = (r: PositionRow): SimPosition => {
  let detail: PositionDetail | null = null;
  try {
    detail = r.detail ? (JSON.parse(r.detail) as PositionDetail) : null;
  } catch {}
  return {
    id: Number(r.id),
    botId: Number(r.bot_id),
    marketHashName: r.market_hash_name,
    version: r.version,
    costCents: Number(r.cost_cents),
    boughtAt: Number(r.bought_at),
    tradableAt: Number(r.tradable_at),
    sellAfter: Number(r.sell_after),
    status: r.status,
    soldNetCents: r.sold_net_cents == null ? null : Number(r.sold_net_cents),
    soldAt: r.sold_at == null ? null : Number(r.sold_at),
    detail,
  };
};

export function listPositions(db: DatabaseSync, botId: number): SimPosition[] {
  return (
    db
      .prepare(
        "SELECT * FROM sim_positions WHERE bot_id = ? ORDER BY bought_at DESC, id DESC",
      )
      .all(botId) as PositionRow[]
  ).map(toPosition);
}

export function listSnapshots(db: DatabaseSync, botId: number) {
  return (
    db
      .prepare(
        "SELECT at, value_cents FROM sim_snapshots WHERE bot_id = ? ORDER BY at",
      )
      .all(botId) as { at: number; value_cents: number }[]
  ).map((r) => ({ at: Number(r.at), valueCents: Number(r.value_cents) }));
}

/** A trade-up contract as the Trade-ups search returns it (only what bots use). */
export type SimContract = {
  inputs: {
    option: { skinName: string; marketHashName?: string };
    count: number;
  }[];
  result: {
    costCents: number;
    evCents: number;
    profitCents: number;
    outcomes: {
      skin: { name: string; phase?: string };
      wear: WearName | null;
      probability: number;
      netCents: number;
      volume30d: number;
      listed?: number;
    }[];
  };
};

export type RunDeps = {
  now: number;
  /** Random number in [0, 1): rolls trade-up results. */
  random: () => number;
  /** The Trade-ups search for this query, best first. */
  searchTradeups: (query: string) => Promise<SimContract[]>;
};

export type RunReport = {
  sold: { name: string; netCents: number; profitCents: number }[];
  bought: { name: string; costCents: number; detail: PositionDetail }[];
  /** Why nothing was bought, when nothing was. */
  note: string | null;
};

/** When an item would likely have sold: the trade hold, then the usual time to sell. */
function sellAfter(
  tradableAt: number,
  volume30d: number,
  listed: number,
): number {
  return tradableAt + (daysToSell(volume30d, listed) ?? MAX_SELL_DAYS) * DAY;
}

/**
 * One turn of a bot, with pretend money at real prices:
 * 1. Sells what has passed its trade hold and the usual time to sell, at today's sell
 *    price after the fee (no price yet: it waits).
 * 2. Buys within its limit (a share of its value, and never more than its cash): the best
 *    deals it doesn't already hold at the lowest listing, or the best trade-up it can afford,
 *    rolling the result with the app's odds.
 * 3. Notes its value (at most hourly) for the chart.
 */
export async function runBot(
  db: DatabaseSync,
  botId: number,
  deps: RunDeps,
): Promise<RunReport> {
  const bot = getBot(db, botId);
  const market = MARKETPLACES[bot.market];
  const lookup = priceLookup(db);
  const netNow = (p: Pick<SimPosition, "marketHashName" | "version">) => {
    const { sellCents } = lookup(p.marketHashName, p.version);
    return sellCents == null ? null : market.net(sellCents);
  };
  const { holdDays } = getSettings(db);
  const report: RunReport = { sold: [], bought: [], note: null };
  let cash = bot.cashCents;

  // 1. Sell what's due.
  const sell = db.prepare(
    "UPDATE sim_positions SET status = 'sold', sold_net_cents = ?, sold_at = ? WHERE id = ?",
  );
  for (const p of listPositions(db, botId)) {
    if (p.status !== "holding" || p.sellAfter > deps.now) continue;
    const net = netNow(p);
    if (net == null) continue;
    sell.run(net, deps.now, p.id);
    cash += net;
    report.sold.push({
      name: p.marketHashName,
      netCents: net,
      profitCents: net - p.costCents,
    });
  }

  // 2. Buy within the limit.
  const held = listPositions(db, botId).filter((p) => p.status === "holding");
  const value = cash + held.reduce((s, p) => s + (netNow(p) ?? p.costCents), 0);
  const limit = Math.min(cash, Math.floor(value * bot.maxBuyShare));
  const insert = db.prepare(
    `INSERT INTO sim_positions (bot_id, market_hash_name, version, cost_cents, bought_at, tradable_at, sell_after, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const tradableAt = deps.now + holdDays * DAY;
  const profile = RISK_PROFILES[bot.risk];

  if (bot.active && bot.strategy === "deals") {
    const holding = new Set(
      held.map((p) => `${p.marketHashName}|${p.version}`),
    );
    const deals = findDeals(db, {
      market,
      minDiscount: profile.dealMinDiscountPercent / 100,
      minVolume30d: profile.dealMinVolume30d,
      weaponsOnly: !profile.dealIncludeNonWeapons,
      limit: 100,
    });
    for (const d of deals) {
      if (report.bought.length >= MAX_DEAL_BUYS_PER_RUN) break;
      if (holding.has(`${d.marketHashName}|${d.version}`)) continue;
      if (d.buyCents > limit || d.buyCents > cash) continue;
      const detail: PositionDetail = {
        kind: "deal",
        expectedNetCents: d.netResaleCents,
        discount: d.discount,
      };
      insert.run(
        botId,
        d.marketHashName,
        d.version,
        d.buyCents,
        deps.now,
        tradableAt,
        sellAfter(tradableAt, d.volume30d, d.quantity),
        JSON.stringify(detail),
      );
      cash -= d.buyCents;
      holding.add(`${d.marketHashName}|${d.version}`);
      report.bought.push({
        name: d.marketHashName,
        costCents: d.buyCents,
        detail,
      });
    }
    if (!report.bought.length)
      report.note = deals.length
        ? "No deal it doesn't already hold fits its money limit right now."
        : "No deals at this risk level right now.";
  }

  if (bot.active && bot.strategy === "tradeups" && bot.tier) {
    const query = new URLSearchParams({
      tier: bot.tier,
      market: bot.market,
      risk: bot.risk,
      hideRisky: "1",
      owned: "0",
      budget: String(limit / 100),
    });
    const contract = (await deps.searchTradeups(query.toString())).find(
      (c) => c.result.profitCents > 0 && c.result.costCents <= limit,
    );
    if (contract) {
      const o = pickOutcome(contract.result.outcomes, deps.random());
      const detail: PositionDetail = {
        kind: "tradeup",
        inputs: contract.inputs
          .map((i) => `${i.count}x ${i.option.skinName}`)
          .join(" + "),
        evCents: contract.result.evCents,
        inputItems: contract.inputs.flatMap((i) =>
          i.option.marketHashName
            ? [{ count: i.count, marketHashName: i.option.marketHashName }]
            : [],
        ),
        chance: o.probability,
        rolledNetCents: o.netCents,
      };
      const name = marketHashName(o.skin.name, o.wear);
      insert.run(
        botId,
        name,
        o.skin.phase ?? "",
        contract.result.costCents,
        deps.now,
        tradableAt,
        sellAfter(tradableAt, o.volume30d, o.listed ?? 0),
        JSON.stringify(detail),
      );
      cash -= contract.result.costCents;
      report.bought.push({
        name: o.skin.phase ? `${name} ${o.skin.phase}` : name,
        costCents: contract.result.costCents,
        detail,
      });
    } else
      report.note =
        "No profitable trade-up at this risk level fits its money limit right now.";
  }

  // 3. Save cash, run time and (hourly) value.
  transaction(db, () => {
    db.prepare(
      "UPDATE sim_bots SET cash_cents = ?, last_run_at = ? WHERE id = ?",
    ).run(cash, deps.now, botId);
    const last = db
      .prepare("SELECT MAX(at) at FROM sim_snapshots WHERE bot_id = ?")
      .get(botId) as { at: number | null };
    if (last.at == null || deps.now - Number(last.at) >= SNAPSHOT_EVERY_MS) {
      const nowHeld = listPositions(db, botId).filter(
        (p) => p.status === "holding",
      );
      const v =
        cash + nowHeld.reduce((s, p) => s + (netNow(p) ?? p.costCents), 0);
      db.prepare(
        "INSERT OR REPLACE INTO sim_snapshots (bot_id, at, value_cents) VALUES (?, ?, ?)",
      ).run(botId, deps.now, v);
    }
  });
  return report;
}

/** A holding's value now after the bot's selling fee, for summaries. */
export function botValuer(db: DatabaseSync, bot: SimBot) {
  const lookup = priceLookup(db);
  const market = MARKETPLACES[bot.market];
  return (p: SimPosition) => {
    const { sellCents } = lookup(p.marketHashName, p.version);
    return sellCents == null ? null : market.net(sellCents);
  };
}
