# Next steps: prompt and to-do list

Paste the prompt below into a new Claude Code session opened in the `imbalance` folder. The
to-do list after it is the same work broken into steps you can tick off.

---

## The prompt

```
Read CLAUDE.md, AGENTS.md and handover.md first, then docs/next-steps-prompt.md (this file).
Follow every rule in CLAUDE.md (integer USD cents, logic in src/lib with tests, zod on every
API response, Skinport rate limit, new DB changes as new MIGRATIONS entries, free APIs only,
no em dashes, en dashes or ellipsis characters). Read node_modules/next/dist/docs before
using any Next.js API.

Goal: Imbalance currently finds only thin, safe profits (about 1 to 6% per trade-up). I want
an optional, clearly labelled higher-risk mode that surfaces bigger-upside opportunities,
plus the improvements that create real edge instead of just loosening filters. Never hide
the risk: every risky result must show its downside as clearly as its upside.

Work through the to-do list in docs/next-steps-prompt.md in order, one milestone at a time.
For each milestone:
1. Plan it briefly and tell me the plan in 3 to 5 lines.
2. Put the maths in pure functions in src/lib with vitest tests, including edge cases.
3. Wire it into the API route and the page.
4. Run `npm run check` until it passes.
5. Run `npm start`, open the page in the browser, update prices, and check the feature
   with real data. Check the console for errors (the CSP must not break anything).
6. Update handover.md (what changed, any new known issues) and docs/roadmap.md.
7. Commit with a clear message, then move to the next milestone. Push when I say so.

Risk mode design (milestone R1 below is the most important one):
- Three profiles: Safe (today's behaviour), Balanced, Aggressive. Stored in the tracker
  settings in `meta` and picked in the Trade-ups and Deals headers.
- Each profile is a plain object in src/lib/risk.ts: minimum chance to profit, thin-market
  threshold (sales in 30 days), max share of EV from thin markets, minimum 30-day volume for
  deals, minimum discount, whether to include non-weapon items, and the sort order.
- Aggressive may rank by upside, but every contract and deal must show: worst case, best
  case, chance to lose more than half the cost, and the standard deviation of the result.
- Add a bankroll setting. Warn (in plain English) when one contract or deal costs more than
  10% of the bankroll, and suggest how many tries the expected value needs to show up.
- The AI may comment on these numbers but never computes them.

Be honest in the UI text: higher risk means a wider spread of results, not more money on
average. Expected value is what matters over many tries; a single try can lose.
```

---

## To-do list

Sizes: S = an hour or two, M = a session, L = more than a session.

### R. Risk and upside (do these first)

- [x] **R1. Risk profiles (M).** Done. Values after tuning with real data (a minimum
      chance to profit was dropped: a floor doesn't add upside, the sort order does):

      | Setting                         | Safe   | Balanced | Aggressive |
      | ------------------------------- | ------ | -------- | ---------- |
      | Thin market (sales in 30 days)  | 3      | 3        | 2          |
      | Max share of EV from thin items | 25%    | 40%      | 60%        |
      | Allow unpriced outcomes         | no     | no       | yes        |
      | Default sort                    | profit | profit   | ROI        |
      | Deals: min 30-day volume        | 10     | 5        | 2          |
      | Deals: min discount             | 10%    | 7%       | 5%         |
      | Include stickers, cases, charms | no     | yes      | yes        |

- [x] **R2. Outcome spread on every contract (S).** Done: `contractSpread` in
      `src/lib/tradeup.ts` (worst case, best case, standard deviation, chance to lose over
      50%, chance to at least double), four tiles in the contract panel, a "Worst / best"
      table column, and passed to the AI.
- [x] **R3. Sort by upside (S).** Done: `src/lib/rank.ts` adds profit per day, best case
      and chance to double. The API ranks every candidate before the top-50 cut, sorts
      other than expected profit keep only contracts that make money on average, and the
      table has a "Per day" column.
- [x] **R4. Bankroll and sizing (S).** Done: bankroll on the Tracker page (saved in USD
      cents), costs over 10% of it turn red on Trade-ups and Deals, and the contract panel
      shows rough tries needed to be 9 in 10 likely ahead (`src/lib/sizing.ts`). Also
      fixed: saving one setting used to reset all the others to their defaults.

- [x] **R5. Covert to knife/gloves focus (M).** Done. Knife and glove price coverage went
      from 84% to 98%: sparse sales (1 or 2 in 90 days) now count, and a cautious "worth at
      least" floor fills the rest (gem phase: cheapest normal phase; better wear: nearest
      worse wear). Unpriced and estimated outcomes show as "Unknown" and "at least", with
      their chance in the warnings. The contract panel shows which knife types the value
      rests on. Also: a lone wishful listing no longer beats real sales.

### E. Real edge (where bigger, more reliable profit comes from)

- [x] **E1. Exact-float trade-ups from CSFloat listings (L).** Built: section 3 of the
      contract panel. `src/lib/exact-float.ts` solves, for every better-wear threshold,
      the cheapest set of real listings (input wear plus the next better wear, cheapest
      and lowest-float) that keeps the average float under it, then prices the contract
      with the real floats. Tested end to end with synthetic listings. **Still to do:**
      check against real CSFloat responses once a key is added (response shape and the
      `lowest_float` sort were never seen).

- [x] **E2. Float sniping deals (M).** Built: "Float snipes" on the Deals page. For the
      most traded skins (or a search), CSFloat listings with a special float (`floatFlags`)
      priced within a set % of an ordinary float (the lower of Skinport's sale price and
      CSFloat's cheapest ordinary listing). The premium itself is not priced: that needs
      sales at the exact float. Tested end to end with synthetic listings; **still to do:**
      a run with a real CSFloat key.

- [x] **E3. Cross-market gaps (M).** Built: "Cross-market gaps" on the Deals page.
      Skinport and Steam (no key, looked up slowly) plus CSFloat with a key. Selling on
      Steam is opt-in and valued at a user-set share of cash. Real result: Skinport to
      Steam shows +29 to 38% on cases in wallet money, which disappears once wallet money
      is valued at 70% of cash; no cash-only gap between Skinport and Steam. Possible
      follow-up: value Steam purchases made with wallet money the same way.

- [x] **E4. Pattern premiums (L).** Done, flags only. "Pattern matters" on finishes whose
      value depends on the pattern (Case Hardened, Heat Treated, Fade, Marble Fade, Crimson
      Web, Slaughter, Doppler), on CSFloat listings, Float snipes and trade-up outcomes.
      Known premium patterns: a deliberately tiny built-in list (AK-47 CH 661, Karambit CH
      387, Five-SeveN CH 278) plus your own in `data/patterns.json` (example in
      `docs/patterns.example.json`). Fade % is not calculated.

- [x] **E5. Search more mixes (M).** Done: after the simple target-plus-filler search, a
      three-skin step (every split of the best pairs with a second filler) and a swap
      search (one copy at a time while profit rises), both stopping 2.5 s into the scan
      and both kept within the chosen risk level. Real data: Restricted Safe best
      $0.99 to $1.23, Balanced $0.99 to $1.40; most top-50 contracts now use 3+ skins.
      Knife scans gain nothing yet: their simple search uses the whole budget.

### D. Data quality (better numbers, fewer fake profits)

- [x] **D1. Use the price trend in trade-ups (S).** Done: falling outcomes (5+ sales in 30
      days) are lowered by their 30-day to 7-day median drop, at most 25%, with the trend
      badge and a "lowered X%" note in the outcome table.
- [x] **D2. Liquidity-aware sell price (S).** Done: under 10 sales a month the sell price
      leans towards a cheaper lowest listing (all the way at none), and `daysToSell` queues
      behind up to a quarter of the listings, capped at 90 days.
- [ ] **D3. Real API response tests (S).** Partly done: `npm run record-fixtures` records
      and `api-fixtures.test.ts` checks them. OpenRouter's model list is recorded; run the
      script again once CSFloat, Gemini, Groq or OpenRouter keys are set, and commit the
      new fixtures. Then tighten `listingsResponseSchema` to the shape CSFloat really uses.
- [x] **D4. Background price refresh (S).** Done: while a page is open and visible,
      Skinport prices update every 10 minutes (switch in the header, on by default).

### T. Tracking results (prove it works)

- [x] **T1. Results per strategy (M).** Done: tracker entries carry a strategy and risk
      level (set when adding, editable on each row), and a Results panel shows profit per
      strategy or risk level, and per month.
- [x] **T2. Expected vs actual (S).** Done: recording a trade-up saves what the app
      expected from the exact inputs; the Tracker compares it with what you got and says,
      after 20 contracts, whether the gap is more than luck.
- [x] **T3. Alerts (S).** Done: "Alert me" on Trade-ups and Deals saves the search with a
      minimum return or profit; after each price update the app reruns it and sends a
      browser notification (or shows a header link) for anything new.

### U. Usability

- [ ] **U1. Watchlist (S).** Star skins and see their price and trend on the Dashboard.
- [ ] **U2. Export contract shopping list (S).** Copy the list of exact items and floats to
      buy, with marketplace search links.
- [ ] **U3. Mobile layout pass (S).** Check every page at 390 px wide.

---

## A word on risk

Loosening filters doesn't create profit by itself. It shows more contracts with a wider
spread of results. Some will look great because their prices come from items that hardly
ever sell, and those prices are often not real. The items that add real edge are E1 to E3:
they find value the market has mispriced. Use T1 and T2 to check with your own results
before putting more money in.
