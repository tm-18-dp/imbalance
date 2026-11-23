import type { DatabaseSync } from "node:sqlite";
import { getMeta } from "./db";
import { marketHashName, type WearName } from "./wear";

export type Status = {
  skins: number;
  collections: number;
  prices: number;
  snapshots: number;
  catalogSyncedAt: number | null;
  pricesSyncedAt: number | null;
};

export function getStatus(db: DatabaseSync): Status {
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
  const time = (key: string) =>
    getMeta(db, key) ? Number(getMeta(db, key)) : null;
  return {
    // Distinct names: Doppler phases are stored as separate rows.
    skins: (
      db.prepare("SELECT COUNT(DISTINCT name) n FROM skins").get() as {
        n: number;
      }
    ).n,
    collections: count("collections"),
    prices: count("prices"),
    snapshots: count("price_snapshots"),
    catalogSyncedAt: time("catalog_synced_at"),
    pricesSyncedAt: time("skinport_synced_at"),
  };
}

type SkinRow = {
  id: string;
  name: string;
  weapon: string | null;
  rarity_name: string;
  rarity_color: string | null;
  min_float: number | null;
  max_float: number | null;
  stattrak: number;
  souvenir: number;
  image: string | null;
  wears: string;
  collections: string | null;
};

export type SkinSummary = {
  id: string;
  name: string;
  weapon: string | null;
  rarity: string;
  rarityColor: string | null;
  minFloat: number | null;
  maxFloat: number | null;
  stattrak: boolean;
  souvenir: boolean;
  image: string | null;
  wears: WearName[];
  collections: string[];
  fromCents: number | null;
};

export const PAGE_SIZE = 48;

export const SKIN_SORTS = [
  "name",
  "price-asc",
  "price-desc",
  "rarity",
] as const;
export type SkinSort = (typeof SKIN_SORTS)[number];

export type SkinSearch = {
  q?: string;
  rarity?: string;
  category?: string;
  weapon?: string;
  collection?: string;
  /** Cheapest normal-wear Skinport price, in USD cents. */
  minCents?: number;
  maxCents?: number;
  stattrak?: boolean;
  sort?: SkinSort;
  page?: number;
};

const RARITY_ORDER = `CASE s.rarity_name WHEN 'Consumer Grade' THEN 1 WHEN 'Industrial Grade' THEN 2
  WHEN 'Mil-Spec Grade' THEN 3 WHEN 'Restricted' THEN 4 WHEN 'Classified' THEN 5
  WHEN 'Covert' THEN 6 ELSE 7 END`;

/**
 * Catalog search with the cheapest Skinport price across the skin's normal wears. The price
 * is a range scan on the prices primary key ("Name (" up to "Name )"), so it stays fast.
 */
export function searchSkins(db: DatabaseSync, opts: SkinSearch) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (sql: string, ...v: (string | number)[]) => {
    where.push(sql);
    args.push(...v);
  };
  if (opts.q)
    add(
      "(s.name LIKE ? OR EXISTS (SELECT 1 FROM skin_collections sc2 JOIN collections c2 ON c2.id = sc2.collection_id WHERE sc2.skin_id = s.id AND c2.name LIKE ?))",
      `%${opts.q}%`,
      `%${opts.q}%`,
    );
  if (opts.rarity) add("s.rarity_name = ?", opts.rarity);
  if (opts.category) add("s.category = ?", opts.category);
  if (opts.weapon) add("s.weapon = ?", opts.weapon);
  if (opts.collection)
    add(
      "EXISTS (SELECT 1 FROM skin_collections sc3 WHERE sc3.skin_id = s.id AND sc3.collection_id = ?)",
      opts.collection,
    );
  if (opts.stattrak) add("s.stattrak = 1");
  if (opts.minCents != null) add("f.from_cents >= ?", opts.minCents);
  if (opts.maxCents != null) add("f.from_cents <= ?", opts.maxCents);
  // Doppler phases (and a few others) are separate rows with the same name: one card each
  // showed "★ Ursus Knife | Doppler" seven times. The detail view lists every phase.
  add("s.id IN (SELECT MIN(id) FROM skins GROUP BY name)");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const from = `FROM skins s JOIN (
      SELECT s0.id, (SELECT MIN(p.min_cents) FROM prices p
        WHERE p.source = 'skinport' AND p.min_cents > 0
          AND ((p.market_hash_name >= s0.name || ' (' AND p.market_hash_name < s0.name || ' )')
            OR p.market_hash_name = s0.name)) AS from_cents
      FROM skins s0
    ) f ON f.id = s.id ${whereSql}`;
  const order = {
    name: "s.name",
    "price-asc": "f.from_cents IS NULL, f.from_cents",
    "price-desc": "f.from_cents IS NULL, f.from_cents DESC",
    rarity: `${RARITY_ORDER} DESC, s.name`,
  }[opts.sort ?? "name"];

  const total = (
    db.prepare(`SELECT COUNT(*) n ${from}`).get(...args) as { n: number }
  ).n;
  const page = Math.max(1, opts.page ?? 1);
  const rows = db
    .prepare(
      `SELECT s.*, f.from_cents,
         (SELECT GROUP_CONCAT(c.name, '|') FROM skin_collections sc JOIN collections c ON c.id = sc.collection_id
          WHERE sc.skin_id = s.id) AS collections
       ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
    )
    .all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE) as (SkinRow & {
    from_cents: number | null;
  })[];

  const skins: SkinSummary[] = rows.map((r) => {
    const wears = JSON.parse(r.wears) as WearName[];
    return {
      id: r.id,
      name: r.name,
      weapon: r.weapon,
      rarity: r.rarity_name,
      rarityColor: r.rarity_color,
      minFloat: r.min_float,
      maxFloat: r.max_float,
      stattrak: r.stattrak === 1,
      souvenir: r.souvenir === 1,
      image: r.image,
      wears,
      collections: r.collections ? [...new Set(r.collections.split("|"))] : [],
      fromCents: r.from_cents,
    };
  });
  return { total, page, pageSize: PAGE_SIZE, skins };
}

/** Choices for the catalog filter dropdowns. */
export function skinFacets(db: DatabaseSync) {
  const list = (sql: string) =>
    (db.prepare(sql).all() as { v: string }[]).map((r) => r.v);
  return {
    categories: list(
      "SELECT DISTINCT category v FROM skins WHERE category IS NOT NULL ORDER BY 1",
    ),
    weapons: list(
      "SELECT DISTINCT weapon v FROM skins WHERE weapon IS NOT NULL ORDER BY 1",
    ),
    collections: (
      db.prepare("SELECT id, name FROM collections ORDER BY name").all() as {
        id: string;
        name: string;
      }[]
    ).map((c) => ({ id: c.id, name: c.name })),
  };
}

export type WearPrice = {
  wear: WearName | null;
  variant: "normal" | "stattrak" | "souvenir";
  marketHashName: string;
  minCents: number | null;
  medianCents: number | null;
  quantity: number;
  median7d: number | null;
  median30d: number | null;
  volume7d: number;
};

/** Every wear and variant of one skin, with Skinport price and history. */
export function skinDetail(db: DatabaseSync, id: string) {
  const summary = searchSkinsById(db, id);
  if (!summary) return null;
  const variants = [
    "normal",
    ...(summary.stattrak ? ["stattrak"] : []),
    ...(summary.souvenir ? ["souvenir"] : []),
  ] as WearPrice["variant"][];
  const wears: (WearName | null)[] = summary.wears.length
    ? summary.wears
    : [null];
  const row = db.prepare(
    `SELECT p.min_cents, p.median_cents, p.quantity, h.median_7d, h.median_30d, h.volume_7d
     FROM prices p LEFT JOIN price_history h
       ON h.market_hash_name = p.market_hash_name AND h.source = p.source AND h.version = p.version
     WHERE p.source = 'skinport' AND p.market_hash_name = ? ORDER BY p.min_cents LIMIT 1`,
  );
  const prices: WearPrice[] = variants.flatMap((variant) =>
    wears.map((wear) => {
      const name = marketHashName(summary.name, wear, variant);
      const r = row.get(name) as
        | {
            min_cents: number | null;
            median_cents: number | null;
            quantity: number;
            median_7d: number | null;
            median_30d: number | null;
            volume_7d: number | null;
          }
        | undefined;
      return {
        wear,
        variant,
        marketHashName: name,
        minCents: r?.min_cents ?? null,
        medianCents: r?.median_cents ?? null,
        quantity: r?.quantity ?? 0,
        median7d: r?.median_7d ?? null,
        median30d: r?.median_30d ?? null,
        volume7d: r?.volume_7d ?? 0,
      };
    }),
  );
  return { skin: summary, prices };
}

function searchSkinsById(
  db: DatabaseSync,
  id: string,
): SkinSummary | undefined {
  const r = db.prepare("SELECT name FROM skins WHERE id = ?").get(id) as
    { name: string } | undefined;
  if (!r) return undefined;
  return searchSkins(db, { q: r.name }).skins.find((s) => s.id === id);
}
