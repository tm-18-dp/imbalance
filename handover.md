# Imbalance: handover

For the next Claude session. The user starts it with **"continue read the handover"**: read
this file, check `git status` and `git log --oneline -5`, say in 2 or 3 lines where things
stand, then carry on with the next milestone. The plan below is already approved.

## What it is

A local CS2 market scanner: free skin data and prices in, profitable trade-ups and
underpriced skins out, plus a tracker and "come back on" dates. It runs on the user's PC with
`npm start`. Friends clone the repo and add their own free keys through a popup. No
hosting, no accounts, everything in a local SQLite file.

| What                 | Where                                                                               |
| -------------------- | ----------------------------------------------------------------------------------- |
| Folder               | `E:\Github Repos\imbalance`, branch `main`                                          |
| Remote               | https://github.com/4bdulllahh/imbalance (not created yet)                           |
| Live site / download | none, friends `git clone`                                                           |
| CI                   | `.github/workflows/ci.yml`: lint, format, typecheck, tests, build on push to `main` |

## Starting a session

```
npm install
npm run check      # lint, format:check, typecheck, test, build
npm start          # build then run, fast pages (friends use this)
npm run dev        # http://localhost:3000 (bound to localhost only), live reload
```

## How the code is organised

| Folder / file                | What's in it                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/db.ts`              | `node:sqlite` connection, `MIGRATIONS` list, `PRAGMA user_version`, meta helpers                           |
| `src/lib/catalog.ts`         | ByMykel skins, collections, crates (zod) into `skins`, `skin_collections`, `rare_pool`                     |
| `src/lib/prices/skinport.ts` | Skinport items + sales history, snapshots every 6 h (weapon skins only)                                    |
| `src/lib/prices/csfloat.ts`  | CSFloat listings with floats, cached 10 min in `listings`                                                  |
| `src/lib/keys.ts`            | Key guide data (`KEY_DEFS`), read/write `.env.local`                                                       |
| `src/lib/queries.ts`         | Status, catalog search, skin detail with prices per wear                                                   |
| `src/lib/wear.ts`            | Wear tiers, `wearForFloat`, `marketHashName`, `toCents`                                                    |
| `src/lib/http.ts`            | `fetchJson` with timeout, zod check and plain-English errors                                               |
| `src/lib/same-origin.ts`     | Blocks POSTs from other websites                                                                           |
| `src/lib/currency.ts`        | Daily FX rates (open.er-api.com) cached in `meta`. `formatIn` lives in `format.ts`                         |
| `src/lib/fees.ts`            | Marketplaces and net-after-fee (Steam per-fee rounding, Skinport 8%, CSFloat 2%)                           |
| `src/lib/tradeup.ts`         | Pure maths: pool odds, normalized floats, wear, EV, ROI, odds to profit                                    |
| `src/lib/tradeup-data.ts`    | Loads input options, outcome pools, `sellPrice` (7/30/90-day median) and 30d volume                        |
| `src/lib/finder.ts`          | Target + filler mixes (1..N-1), listing quantity check, budget                                             |
| `src/lib/risk.ts`            | Risky = missing prices, or >25% of EV from skins sold under 3 times in 30 days                             |
| `src/lib/deals.ts`           | Items under their 30-day median that flip for profit, with trend signal                                    |
| `src/lib/trend.ts`           | `classifyTrend` (dip, rebounding, falling, rising), snapshot series and pruning                            |
| `src/lib/prices/steam.ts`    | Steam priceoverview per item on demand, cached 10 min as source `steam`                                    |
| `src/lib/special-float.ts`   | `floatFlags`: 0.00x, best of a wear, lowest/highest possible                                               |
| `src/lib/tracker.ts`         | Holdings (buy, sell, trade-up), settings (hold days, sell market), portfolio, backup/restore               |
| `src/lib/timeline.ts`        | `daysToSell`, `contractTimeline`, `nextSteps` (sell, hold, wait, come back on)                             |
| `src/lib/filters.ts`         | Plain-English search: filters schema, AI prompt, URL build and read back                                   |
| `src/lib/ai.ts`              | User-key AI: picks provider and model from the live model list, `SYSTEM_PROMPT`, `askAi`                   |
| `src/app/api/*`              | status, sync/*, skins, keys, listings, currency, tradeups, deals, steam-price, history, tracker, names, ai |
| `src/components/`            | Header, KeysModal, Money, Dashboard, Catalog, TradeUps, Deals, PriceHistory, Tracker, AskAi, FloatBadges   |
| `tools/screenshot.mjs`       | playwright-core + installed Edge screenshots, see Checking your work                                       |

Pages are client components that call the API routes. Logic stays in `src/lib/` with tests
next to it.

## Data and storage

- `data/imbalance.db` (gitignored). Schema v2 (v2 added `holdings`). New tables or columns: add an entry to
  `MIGRATIONS` in `src/lib/db.ts`, never edit an old one.
- Money is integer USD cents. Skinport `version` (Doppler phase) is part of price keys.
- `price_snapshots`: ~15k rows every 6 h, thinned on each snapshot to one a day after 7 days
  and one a week after 90 days.
- Tracker settings are JSON in `meta` key `settings`.
- Keys live in `.env.local` (then `.env`), read fresh on each call. `process.env` is ignored
  on purpose: Next copies `.env.local` into it and keeps deleted keys.

## Rules that must not break

- **Skinport rate limit** (about 8 requests per 5 min): every price sync goes through the
  5-minute cooldown, or the user's IP gets blocked.
- **POST routes check `isSameOrigin`.** Without it any website could overwrite keys.
- **GET routes that read the DB use the request or `await connection()`**, otherwise
  `cacheComponents` may prerender them at build time.
- **Don't call `Date.now()` during render** of a prerendered page: the build fails.
- **Souvenir skins can't go into trade-ups.** Covert trade-ups give an item from the
  collection's `rare_pool` (43 collections have one).

## Checking your work

`npm run check`, then `npm run dev` and screenshot with the installed Edge:

```
node tools/screenshot.mjs <outDir> tradeups --scan --click-first-row
node tools/screenshot.mjs <outDir> deals --scan --click=Chart --width=390
node tools/screenshot.mjs <outDir> tracker --light
```

Pass page names without a leading slash (Git Bash rewrites `/deals`). If the dev overlay
shows hydration errors after many edits, restart `npm run dev` before debugging: hot
reloads leave stale HTML.

POSTs from curl need `-H "Origin: http://localhost:3000"`.

## Milestones

| #   | Milestone                                                                      | Size | Status  |
| --- | ------------------------------------------------------------------------------ | ---- | ------- |
| M1  | Project setup                                                                  | S    | ✅ done |
| M2  | Local database with migrations                                                 | S    | ✅ done |
| M3  | Skin catalog (ByMykel) + catalog page with images                              | M    | ✅ done |
| M4  | Skinport prices, sales history, snapshots, rate-limit cooldown                 | M    | ✅ done |
| M5  | API keys popup + guide, `.env.local` saving, CSFloat listings                  | M    | ✅ done |
| M6  | Currency conversion (free FX rates, picker)                                    | S    | ✅ done |
| M7  | Trade-up maths engine (rules, odds, scaled float, wear, fees, EV, ROI)         | M    | ✅ done |
| M8  | Trade-up finder (cross-collection, fillers, float targets, tiers, owned skins) | M    | ✅ done |
| M9  | Trade-up dashboard                                                             | M    | ✅ done |
| M10 | Market imbalance scanner (below usual price, cross-market gaps)                | M    | ✅ done |
| M11 | Price charts, dip and rebound detection, snapshot pruning                      | M    | ✅ done |
| M12 | Special float flags                                                            | S    | ✅ done |
| M13 | Tracker and portfolio                                                          | M    | ✅ done |
| M14 | Timeline, cooldowns, "come back on", next steps                                | M    | ✅ done |
| M15 | AI advisor (Gemini / OpenRouter / Groq, user keys)                             | M    | ✅ done |
| M16 | Ask box: plain English to filters                                              | S    | ✅ done |
| M17 | Design pass: taste-skill, then impeccable                                      | M    | ✅ done |
| M18 | Ready for friends: full README, fresh-clone test                               | S    | ✅ done |

## Current state

- **Last done:** all milestones M1 to M18. 86 tests pass. M16 finished: the Dashboard
  "Find" box sends plain English to the AI with `FILTERS_PROMPT`, `parseFilters` validates
  the JSON with zod, and the page opens with filters in the URL (`/tradeups?tier=...&max=20`).
  Trade-ups and Deals read them with `useSearchParams` inside `<Suspense>`. Amounts stay in the
  shown currency; the user clicks Scan, so exchange rates are loaded before converting.
- **After M18 (2026-11-17):**
  - A one-click `Start Imbalance.bat` was built, then removed at the owner's request: keep
    setup to `npm install` and `npm start`. Don't bring it back unless asked.
  - `npm start` is `next build && next start -H localhost`. A cached rebuild takes ~6 s,
    then pages answer in 5 to 20 ms (dev mode: 150 to 1500 ms per first visit on the E: drive).
  - The keys popup scrolled twice; `<dialog>` is now `overflow-hidden` and only the inner
    div scrolls. `color-scheme` plus a thin themed scrollbar in `globals.css`.
  - `npm audit` shows 16 high: all one `picomatch` ReDoS (<=4.0.7) in eslint and vitest
    deps only. No fixed version exists yet. Never run `npm audit fix --force` (it downgrades
    eslint-config-next and vitest). Recheck when picomatch 4.0.8+ ships.
  - Windows PowerShell blocks `npm.ps1` by default: README tells friends to use `npm.cmd`
    or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Fork improvements (2026-11-18):**
  - Trade-up inputs: only the first copy costs the cheapest listing. Further copies cost
    `nextCostCents` = max(cheapest, `sellPrice`), since Skinport only reports the lowest
    listing. `optionCost` in `finder.ts` is the one place this is summed.
  - `src/proxy.ts` returns 403 unless Host is localhost, 127.0.0.1 or [::1] (DNS rebinding).
    `isSameOrigin` also requires a local Host. Opening the app from another device won't work.
  - Security headers and a CSP in `next.config.ts`. Pages are prerendered, so scripts use
    `'unsafe-inline'` (no nonces); all outside calls happen on the server.
  - Deals resell at `resalePrice`: the 30-day median, pulled down by the 7-day or 24-hour
    median when lower with 3+ sales.
  - **R1 risk profiles** (`RISK_PROFILES` in `risk.ts`): Safe, Balanced, Aggressive, saved
    as `riskProfile` in settings (`/api/settings`), picked with `RiskPicker` on Trade-ups
    and Deals, and settable from the plain-English search (`risk` in filters). A profile
    only decides what `withinProfile` lets through; `riskNotes` warnings always use Safe's
    rules. On Deals a profile fills in the filters, which stay editable.
  - **Bug fixed: Doppler phases.** The rare pool lists each phase (with its own skin id)
    as a separate knife, so Ruby was as likely as Phase 2 and knife pools looked twice as
    big. `outcomeProbabilities` now groups phased knives by name into one draw and splits
    it with `phaseShares`: gems (Ruby, Sapphire, Black Pearl, Emerald) get
    `GEM_PHASE_CHANCE` = 1.5% each, a cautious community estimate (Valve publishes none).
    Covert best ROI fell from about 100 to 158% (fake) to 9% Safe, 35% Aggressive.
  - **R2 outcome spread:** `ContractResult.spread` from `contractSpread` (worst and best
    case as profit, standard deviation of the amount back, chance to lose over half,
    chance to at least double). Unpriced outcomes count as 0, so a contract with one has
    a worst case of minus the full cost. Shown as tiles in the contract panel
    (`SpreadSummary`) and a "Worst / best" column.
  - **R3 sorts:** `rankContracts` in `rank.ts` (profit, ROI, odds, profit per day, best
    case, chance to double), used by `/api/tradeups` (`sort` param, default from the risk
    profile) before the top-50 cut and by the page. Every sort except expected profit
    drops contracts that lose money on average. Changing the sort scans again.
  - **R4 sizing:** `bankrollCents` setting (Tracker page, typed in the shown currency).
    `sizingWarning` flags buys over 10% of it (`SizedCost` on Trade-ups and Deals);
    `triesToBeAhead` = (1.2816 x sd / profit)^2, shown in the contract panel as a rough
    guide (bell-curve assumption, capped at 1,000).
  - **Bug fixed: settings resets.** `settingsSchema.partial()` filled every missing field
    with its default, so saving one setting reset the rest (changing the sell market reset
    the trade hold to 7). API routes and backup restore now use `settingsPatchSchema`,
    which has no defaults.
  - **R5 knife pricing:** `sellPrice` falls back to the lower of the lowest listing and the
    most recent median from 1 or 2 sales (a lone listing was $6,113 on a knife selling near
    $109). `floorEstimate` gives a cautious "worth at least" price (gem phase: cheapest
    normal phase; better wear: nearest worse wear), `priceSource` "estimate". Knife/glove
    coverage 84% to 98%; the rest (mostly Battle-Scarred) stay unpriced and count as $0.
    `riskNotes` reports the chance of unpriced and estimated outcomes. `valueDrivers`
    groups outcomes by knife type for the "Where the value comes from" bars.
  - **E1 exact floats:** `/api/tradeups/exact` (needs `CSFLOAT_API_KEY`) loads CSFloat
    listings for each input's wear and the next better wear (`fetchFloatListings`: cheapest
    plus `lowest_float`, merged, cached 10 min), then `planExactFloats` tries "any float"
    and every better-wear threshold of the outcomes. `floatSolver` is a DP over
    (listings picked, normalized float sum on a 1/1000 grid, rounded up so plans never
    overshoot), built once per contract; thresholds keep a 0.001 safety margin for the
    game's 32-bit floats. UI: `ExactFloats.tsx`, section 3 of the contract panel.
    **Unverified:** no CSFloat key was available, so the real response shape and the
    `lowest_float` sort value were never checked (tested with synthetic saved listings).
  - **E2 float snipes:** `/api/snipes` (needs `CSFLOAT_API_KEY`) takes the most traded
    weapon skins with a wear (`snipeCandidates`, min price $1 by default, at most 20) and
    runs `findSnipes` on their CSFloat listings: special floats priced within `maxOver`
    (15% default) of the lower of Skinport's sale price and CSFloat's cheapest ordinary
    listing. Sequential calls with a 400 ms gap, reusing listings saved in the last 10
    minutes, and it stops (keeping results) on the first CSFloat error. UI:
    `FloatSnipes.tsx` at the bottom of Deals. Premiums are deliberately not priced.
  - **E3 cross-market gaps:** `/api/gaps` compares saved prices only (`savedQuotes`:
    Skinport always; Steam and CSFloat when saved in the last hour) with `findGaps`
    (every buy-here, sell-there pair after the selling fee). The page
    (`CrossMarketGaps.tsx`) first looks up `missingSteam` through `/api/steam-price`
    3.5 s apart, and CSFloat listings through `/api/listings` when a key is set, then asks
    again. Selling on Steam is opt-in and scaled by a wallet value (% of cash). Steam
    purchases are still counted at full cash.
  - **E4 patterns:** `patterns.ts` (pure): `patternFinish` (exact finish names, so "Amber
    Fade" is not "Fade"), `BUILT_IN_PATTERNS` kept tiny on purpose (a wrong seed costs
    money), `patternFlag` (user list wins). `patterns-data.ts` reads `data/patterns.json`
    with zod and returns a readable error for a broken file; `/api/patterns` serves it.
    `PatternBadge` shows on Skins-page CSFloat listings, Float snipes and trade-up
    outcomes. Patterns are never priced, and fade % is not calculated.
  - **E5 more mixes:** `findContracts` now runs, after the simple search, a three-skin
    step (best target+filler pairs with every split and a second filler) and a swap
    search (`bestSwap`, first improvement, up to 20 steps per seed), memoised by mix key.
    `deadline` (route: start + 2.5 s) stops both; `accept` (route: `withinProfile` when
    hiding risky) filters seeds, swaps and the returned list. Without `accept`, risky
    high-profit mixes crowded every allowed contract out of the top 2000. Covert scans
    spend the whole budget on the simple search, so they gain nothing yet.
  - **D1 trend in trade-ups:** `trendCut` (trend.ts) lowers a falling outcome's sell
    price by the 30-day to 7-day median drop, capped at 25%, only with 5+ sales in 30
    days. Applied in `loadTierData`'s `realPrice`, so Steam prices, floor estimates and
    exact-float plans inherit it; rising items are never raised. Outcomes carry
    `trend: { signal, cut }`; the table shows `TrendBadge` and "lowered X%, falling".
    Real data: about 1 in 7 priced outcomes is cut (7 to 12% on average), but the best
    contract per tier and risk level barely moved: top contracts rarely lean on falling
    items.
  - **D2 liquidity:** `liquidity.ts` (pure): `thinness` (0 at 10+ sales in 30 days, 1 at
    none) and `liquidSellPrice`, which leans the price towards a cheaper lowest listing by
    `thinness`. `tradeup-data.ts` splits `salesPrice` (the old median logic, still used
    for `nextCostCents`) from `sellPrice` (liquidity-aware, used for outcomes and tracker
    values). `daysToSell(volume30d, listed)` queues behind 3 sales, growing by `thinness`
    towards a quarter of the Skinport listings; the cap and the never-sold count are now
    both `MAX_SELL_DAYS` (90; they were 60 and 30, so a 1-sale item counted slower than an
    unsold one). Real data: Covert Aggressive best $27.77 to $19.08, Restricted Safe $1.23
    to $1.10, Classified unchanged; many contracts now take 40 to 70 days.
  - **D3 real responses (partly):** `npm run record-fixtures` (`tools/record-fixtures.mjs`)
    saves one real response per API into `src/lib/fixtures/`, trimmed, keys never written,
    other people's account fields (sellers, Steam ids, avatars) removed.
    `api-fixtures.test.ts` parses each with the app's own zod schemas (now exported from
    `ai.ts`) and skips fixtures that don't exist. Only `openrouter-models` is recorded so
    far (public). Gemini, Groq, OpenRouter chat and CSFloat need keys: run the script once
    keys are in `.env.local`, then commit the new files. Finding: OpenRouter has only 14
    free models and none are Llama, Qwen, DeepSeek or Mistral, so `pickModel` falls back
    to the highest version number (`nvidia/nemotron-3.5-lightning:free`). Gemma is
    skipped by `pickModel` even though Gemma 4 is a usable chat model.
  - **D4 background refresh:** `PriceRefresher` (header) POSTs `/api/sync/prices?auto=1`
    every minute while the page is visible; the server runs an update only when
    `autoRefreshDue` (auto-refresh.ts): prices 10+ minutes old, no try (failed ones
    included, `skinport_auto_tried_at` meta) in the last 10 minutes, and never before the
    first manual update. A module-level `running` flag stops two updates at once (many
    tabs). Done updates fire the `imbalance:prices-updated` window event; the Dashboard
    reloads its status on it. Deals and Trade-ups keep their results until you scan
    again. On/off is per browser (`imbalance-auto-refresh` in localStorage, on by default).
  - **T1 results per strategy:** migration v3 adds nullable `strategy` and `risk` to
    `holdings` (old entries stay untagged). `results.ts` (pure): `STRATEGIES` (deal,
    trade-up, float-snipe, cross-market, other), `resultsBy` (sold, profit after fees,
    ROI on sold cost, held, profit if sold now; `used` inputs skipped because the
    trade-up result carries their cost) and `monthlyRealized` (UTC months). The tracker
    GET returns both groupings; `tag` action edits tags. `recordTradeUp` tags the output
    "trade-up", at the form's risk level or else the one all inputs share. Backups keep
    tags and older backups still restore. UI: `StrategyResults.tsx` (panel, pickers,
    `TagPicker` on held and sold rows); the buy form defaults to Trade-up at the saved
    risk level. Entries are still only logged on the Tracker page.
  - **T2 expected vs actual:** migration v4 adds `holdings.expected` (JSON,
    `expectationSchema` in expectation.ts). On the `tradeup` action the route passes an
    `expect` callback to `recordTradeUp`; `tradeup-expect.ts` rebuilds the contract from
    the inputs that really went in (skin list lookup by name, logged floats, else the worst
    float of the wear, flagged `floatsEstimated`) and runs `evaluateContract` at that
    day's prices after the `sellMarket` fee. When it can't (unknown skin, mixed rarity or
    StatTrak), the reply's `noExpectation` says why and the message shows it.
    `expectedVsActual` (pure) totals expected vs got (sale, or value now while held), a
    z-score from the summed variances (|z| < 2 is luck), the verdict (needs 20) and
    results that weren't predicted. Checked on real data: logging the top Classified
    contract's inputs gave exactly the scan's EV ($61.48 on $48.43).
  - **T3 alerts:** `alerts.ts`: saved searches in meta `alerts` (max 10), each an API
    query (`cleanQuery` whitelists keys), an optional min ROI % and min profit, the keys
    already reported (`seen`, last 500) and `lastHit`. `newHits` is pure. Routes:
    `/api/alerts` (list without `seen`; add, which runs the search once so what's on
    screen now never alerts; delete) and `/api/alerts/check` (reruns every alert, one
    check at a time, saves `seen`). `api/alerts/run.ts` calls the Trade-ups and Deals
    route handlers directly so alerts match the pages exactly. Deal keys include the buy
    price, so a cheaper relisting is new. UI (`Alerts.tsx`): `AlertMe` next to Scan and
    Find deals (asks for notification permission on save), `AlertWatcher` in the header
    (checks 3 s after load and on `imbalance:prices-updated`; browser notification if
    allowed, else an "N new finds" link), `AlertList` on the Dashboard. Checks only run
    while a page is open: nothing runs in the background with the app closed.
  - **U1 watchlist:** migration v5 adds `watchlist` (name, version, `added_at`,
    `added_cents` = lowest Skinport listing when starred). `watchlist.ts`: `addWatch`
    (keeps the first star, max 100), `removeWatch`, `listWatch` (today's listing, 7/30-day
    medians, 30-day sales, `classifyTrend`, image). `/api/watchlist` GET and add/remove.
    `Watchlist.tsx`: one shared store (`useSyncExternalStore`) for every `WatchStar`
    (Deals rows, Skins price rows, Trade-up outcomes, held Tracker items) and
    `WatchlistPanel` on the Dashboard (this week = 7-day vs 30-day median, since starred,
    chart in its own row; reloads on `imbalance:prices-updated`). Not in tracker backups.
  - **U2 shopping list:** `shopping-list.ts` (pure): `shoppingListText` (tick box per
    input, first copy at the cheapest listing then the going price, max float rounded
    down by `floorFloat` so 0.449999 never reads 0.450, owned inputs marked, the CSFloat
    exact-float plan appended when picked) and `searchLinks`. Links checked Nov 2026:
    Skinport `market?search=` and CSFloat `search?market_hash_name=&max_float=` work
    (CSFloat needs sign-in to show results); Steam item pages by name redirected and
    returned 500, so Steam uses `market/search?appid=730&q=`. `ShoppingListButtons`
    (Copy, Download .txt) next to "1. Buy these"; when the clipboard is blocked the text
    shows selected in a textarea. `ExactFloats` reports its best plan via `onBest`.
- **Next:** the owner continues tomorrow. Open items: test the AI (Find box, Ask AI) and
  CSFloat with real keys, then pick from `docs/roadmap.md`. taste-skill and impeccable were
  not installed, so M17 was done by hand; run them later if wanted.
- **Logo:** `src/app/icon.svg` (favicon) and `public/logo.svg` (header, README) are the same
  file. Edit both.
- **AI:** provider order Gemini, Groq, OpenRouter (first saved key wins). The model comes
  from the provider's live `/models` list via `pickModel` (cached a day), so renamed
  models don't break it. The AI gets only app-computed numbers and is told never to do maths.
- **Trade hold:** 7 days by default, a setting on the Tracker page. A trade-up output
  inherits the latest unlock of its inputs.
- **Open questions:** none.
- **Known issues:** AI calls untested with real keys. CSFloat response shape not checked
  against a real key. Key guide steps for CSFloat are from memory. When "Sell on Steam" is
  picked, outcomes use Steam prices only where one was checked in the last 7 days (the
  contract panel has a "Get Steam prices" button); the rest still use Skinport's price. After many hot reloads the dev page
  can loop on full reloads: kill node, delete `.next`, restart (`npm start` is not affected).
- **Not pushed:** see `git log origin/main..main`.
