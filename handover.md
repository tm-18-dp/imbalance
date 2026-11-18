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
