import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Each entry upgrades the schema by one version. Never edit a shipped entry: friends update
 * with `git pull`, so add a new one instead. PRAGMA user_version holds the current version.
 */
const MIGRATIONS: string[] = [
  // v1: catalog, prices, history, snapshots, listings, key/value meta
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image TEXT
  );

  CREATE TABLE skins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    weapon TEXT,
    category TEXT,
    rarity_id TEXT NOT NULL,
    rarity_name TEXT NOT NULL,
    rarity_color TEXT,
    min_float REAL,
    max_float REAL,
    stattrak INTEGER NOT NULL,
    souvenir INTEGER NOT NULL,
    image TEXT,
    wears TEXT NOT NULL
  );
  CREATE INDEX skins_rarity ON skins (rarity_id);

  CREATE TABLE skin_collections (
    skin_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    PRIMARY KEY (skin_id, collection_id)
  );
  CREATE INDEX skin_collections_col ON skin_collections (collection_id);

  -- Knives and gloves a Covert trade-up from this collection can give.
  CREATE TABLE rare_pool (
    collection_id TEXT NOT NULL,
    skin_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT '',
    image TEXT,
    PRIMARY KEY (collection_id, skin_id, phase)
  );

  -- Latest price per item and source. version = Doppler phase etc., '' when none.
  CREATE TABLE prices (
    market_hash_name TEXT NOT NULL,
    source TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    min_cents INTEGER,
    suggested_cents INTEGER,
    median_cents INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (market_hash_name, source, version)
  );

  -- Sales history from the source (Skinport: 24h/7d/30d/90d windows).
  CREATE TABLE price_history (
    market_hash_name TEXT NOT NULL,
    source TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    median_24h INTEGER, volume_24h INTEGER NOT NULL DEFAULT 0,
    median_7d INTEGER, volume_7d INTEGER NOT NULL DEFAULT 0,
    median_30d INTEGER, volume_30d INTEGER NOT NULL DEFAULT 0,
    median_90d INTEGER, volume_90d INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (market_hash_name, source, version)
  );

  -- Our own snapshots, so charts get richer the longer the app runs.
  CREATE TABLE price_snapshots (
    market_hash_name TEXT NOT NULL,
    source TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    taken_at INTEGER NOT NULL,
    min_cents INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX price_snapshots_item ON price_snapshots (market_hash_name, taken_at);

  -- Individual listings with exact floats (CSFloat).
  CREATE TABLE listings (
    id TEXT NOT NULL,
    source TEXT NOT NULL,
    market_hash_name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    float_value REAL,
    paint_seed INTEGER,
    url TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (source, id)
  );
  CREATE INDEX listings_item ON listings (market_hash_name, price_cents);
  `,
  // v2: tracker. Each row is one item the user owns or owned.
  `
  CREATE TABLE holdings (
    id INTEGER PRIMARY KEY,
    market_hash_name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    float_value REAL,
    cost_cents INTEGER NOT NULL,
    bought_at INTEGER NOT NULL,
    tradable_at INTEGER NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'holding' CHECK (status IN ('holding', 'used', 'sold')),
    used_in INTEGER,
    sold_cents INTEGER,
    sold_net_cents INTEGER,
    sold_on TEXT,
    sold_at INTEGER,
    note TEXT
  );
  CREATE INDEX holdings_status ON holdings (status);
  `,
  // v3: tag each tracker entry with the strategy and risk level it came from, so results
  // can be compared. Null for entries logged before this.
  `
  ALTER TABLE holdings ADD COLUMN strategy TEXT;
  ALTER TABLE holdings ADD COLUMN risk TEXT;
  `,
  // v4: what the app expected from a recorded trade-up (JSON, see expectation.ts), saved on
  // its result so it can be compared with what you got.
  `
  ALTER TABLE holdings ADD COLUMN expected TEXT;
  `,
  // v5: starred items, with the price when starred to show the change since.
  `
  CREATE TABLE watchlist (
    market_hash_name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    added_at INTEGER NOT NULL,
    added_cents INTEGER,
    PRIMARY KEY (market_hash_name, version)
  );
  `,
  // v6: practice bots that trade pretend money at real prices (sim.ts, sim-data.ts).
  `
  CREATE TABLE sim_bots (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    strategy TEXT NOT NULL CHECK (strategy IN ('tradeups', 'deals')),
    risk TEXT NOT NULL,
    tier TEXT,
    market TEXT NOT NULL DEFAULT 'skinport',
    start_cents INTEGER NOT NULL,
    cash_cents INTEGER NOT NULL,
    max_buy_share REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_run_at INTEGER
  );
  CREATE TABLE sim_positions (
    id INTEGER PRIMARY KEY,
    bot_id INTEGER NOT NULL REFERENCES sim_bots (id) ON DELETE CASCADE,
    market_hash_name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    cost_cents INTEGER NOT NULL,
    bought_at INTEGER NOT NULL,
    tradable_at INTEGER NOT NULL,
    sell_after INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'holding' CHECK (status IN ('holding', 'sold')),
    sold_net_cents INTEGER,
    sold_at INTEGER,
    detail TEXT
  );
  CREATE INDEX sim_positions_bot ON sim_positions (bot_id, status);
  CREATE TABLE sim_snapshots (
    bot_id INTEGER NOT NULL REFERENCES sim_bots (id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    value_cents INTEGER NOT NULL,
    PRIMARY KEY (bot_id, at)
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DatabaseSync): void {
  const { user_version } = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  if (user_version > SCHEMA_VERSION) {
    throw new Error(
      `Database is version ${user_version} but this app only knows ${SCHEMA_VERSION}. Run git pull.`,
    );
  }
  for (let v = user_version; v < SCHEMA_VERSION; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:")
    mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), {
      recursive: true,
    });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

/** Runs fn inside one transaction, rolling back on error. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

const globalForDb = globalThis as unknown as { imbalanceDb?: DatabaseSync };

/** The app's shared database. Cached on globalThis so dev hot reloads reuse one connection. */
export function getDb(): DatabaseSync {
  globalForDb.imbalanceDb ??= openDb(
    process.env.IMBALANCE_DB ??
      path.join(process.cwd(), "data", "imbalance.db"),
  );
  return globalForDb.imbalanceDb;
}

export function getMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    { value: string } | undefined;
  return row?.value;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
