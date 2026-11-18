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
- [ ] **R3. Sort by upside (S).** New sort options: best case, chance to double, and
      "EV per day" (profit divided by `timeline.totalDays`) so quick small wins can beat
      slow big ones.
- [ ] **R4. Bankroll and sizing (S).** Bankroll setting on the Tracker page. Warn when a
      single buy is over 10% of it. Show "tries needed": roughly how many repeats before the
      average result is likely positive, from the mean and standard deviation.
- [ ] **R5. Covert to knife/gloves focus (M).** These have the biggest swings. Make sure
      rare-pool prices cover every Doppler phase and glove wear, flag outcomes with no price
      as unknown (not zero) in Aggressive mode, and show which knives drive the EV.

### E. Real edge (where bigger, more reliable profit comes from)

- [ ] **E1. Exact-float trade-ups from CSFloat listings (L).** Today inputs assume the worst
      float of their wear. Real profit often comes from buying specific low-float inputs so
      outcomes land in a better wear (for example Field-Tested to Minimal Wear, often 2x the
      price). Use CSFloat listings (with a key) to pick real inputs by float and price, solve
      for the cheapest set whose average normalized float hits the `betterWear.maxAvgNorm`
      target, and show the exact listings to buy.
- [ ] **E2. Float sniping deals (M).** Find CSFloat listings priced like an average float
      but with a special float (`floatFlags`: 0.00x, best in wear, lowest possible). Price
      the premium from past sales of similar floats where data exists, and label it as an
      estimate.
- [ ] **E3. Cross-market gaps (M).** Buy on Skinport, sell on CSFloat (2% fee) or the other
      way round. Show the gap after both fees and the trade lock. Note in the UI that Steam
      Market money stays in the Steam wallet and can't be withdrawn as cash, so a Steam
      price is worth less than its number.
- [ ] **E4. Pattern premiums (L).** Case Hardened blue gems and Fade percentages. Start
      with a small hand-made table of known premium patterns and only flag them; don't
      price them automatically.
- [ ] **E5. Search more mixes (M).** The finder tries one target plus one filler. Add
      three-way mixes and a greedy improve step (swap one input at a time while profit
      rises), with a time limit so a scan stays under about 3 seconds.

### D. Data quality (better numbers, fewer fake profits)

- [ ] **D1. Use the price trend in trade-ups (S).** `classifyTrend` exists for deals. Apply
      it to outcomes: lower the expected sell price for "falling" items and show the badge.
- [ ] **D2. Liquidity-aware sell price (S).** For thin items, sell price should lean
      towards the lower of median and lowest listing, and `daysToSell` should grow.
- [ ] **D3. Real API response tests (S).** Record one real response each from CSFloat,
      Gemini, Groq and OpenRouter (keys removed) and test the zod schemas against them.
- [ ] **D4. Background price refresh (S).** While the app is open, refresh Skinport prices
      every 10 minutes (inside the existing cooldown) so deals stay current.

### T. Tracking results (prove it works)

- [ ] **T1. Results per strategy (M).** Tag each tracker entry as deal, trade-up, float
      snipe or cross-market, and show actual profit per strategy and per risk profile over
      time. This is how to tell whether Aggressive is really earning more.
- [ ] **T2. Expected vs actual (S).** For logged trade-ups, compare what the app expected
      with what you got. Over 20 or more contracts this shows whether the maths is right.
- [ ] **T3. Alerts (S).** A browser notification when a saved search (for example
      "Aggressive Covert trade-ups over 20% ROI") finds something new.

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
