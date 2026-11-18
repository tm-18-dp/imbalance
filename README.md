<p align="center"><img src="public/logo.svg" alt="Imbalance logo: a bullet balancing on a table edge" width="96" height="96"></p>

<h1 align="center">Imbalance</h1>

<p align="center"><b>Find profitable CS2 trade-ups and underpriced skins, on your own PC.</b></p>

Imbalance pulls CS2 skin data and live prices from free APIs, works out which trade-up
contracts make money after marketplace fees, and spots skins selling below their usual
price. It tracks what you bought and sold and tells you when to come back for the next step.
Everything runs on your computer: no account, no server, and your API keys stay in a file
on your PC.

**Version:** 0.1.0 · **Works on:** Windows, macOS, Linux with Node 24 · **Cost:** free, every API is free

> Not financial advice. Skin prices move fast and trade-ups are gambles with odds. Only
> spend what you can afford to lose.

## What it does

| Page          | What you get                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard** | Update skins and prices, your next steps ("sell this", "come back on Tue"), a plain-English search ("purple trade-ups under 20") and an AI question box |
| **Trade-ups** | Profitable contracts for any rarity, mixing collections and cheap filler skins. Exact float maths, fees, odds, days to finish, risk check               |
| **Deals**     | Skins listed below their 30-day price that sell often enough to flip, with dip and rebound signals, price charts and a Steam price check                |
| **Skins**     | Every skin with images, float ranges, prices per wear, charts and CSFloat listings with special-float badges (0.00x, best of a wear and so on)          |
| **Tracker**   | Log buys, sales and trade-ups. See what it is all worth after fees, when each item can be traded again, and back it up                                  |

Prices show in your currency (pick it in the header). Dark and light themes.

## How to run it

### 1. Install the tools (once)

- **Node.js 24 or newer:** download the LTS installer from [nodejs.org](https://nodejs.org).
- **Git:** download it from [git-scm.com](https://git-scm.com).

Check both work by opening a terminal (on Windows: PowerShell or Windows Terminal) and running:

```
node -v
git --version
```

`node -v` must print `v24` or higher.

### 2. Download and start Imbalance

```
git clone https://github.com/4bdulllahh/imbalance.git
cd imbalance
npm install
npm start
```

`npm start` builds the app, then runs it. The very first build takes about a minute; after
that it starts in a few seconds and every page loads instantly.

> **"16 high severity vulnerabilities" after `npm install`?** Safe to ignore. They are all one
> issue in `picomatch`, used only by the developer tools (linter and tests), not by the app,
> and no fixed version exists yet. Don't run `npm audit fix --force`: it downgrades those tools
> and breaks them.

> **Windows PowerShell says "running scripts is disabled on this system"?** Type `npm.cmd`
> instead of `npm` (`npm.cmd install`, then `npm.cmd start`). Or fix it once for good by
> running `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and answering `Y`.

Leave that terminal open while you use the app. Then open **http://localhost:3000** in your
browser. To stop it, press `Ctrl+C` in the terminal. To start it again later, open a terminal
in the `imbalance` folder and run `npm start`.

### 3. First run

1. A popup lists the optional API keys. You can close it and add keys later (see below).
2. On the **Dashboard**, click **Update skin list**, then **Update prices**. Both take a few
   seconds. Prices can be updated again every 5 minutes (Skinport's limit). After that,
   while the app is open, prices update by themselves every 10 minutes (switch in the
   header).
3. Open **Trade-ups**, pick a rarity and click **Scan**.

### Updating

In the `imbalance` folder run `git pull`, then `npm install`. Your tracker and saved prices
are kept.

## Setting up the API keys

**You don't need any keys to start.** Skin data (ByMykel CSGO-API), prices (Skinport) and
exchange rates are free and need no key. Keys only unlock extras, and all of them are free.

| Key                  | What it unlocks                    | Where to get it                                                  |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `CSFLOAT_API_KEY`    | Live listings with exact floats    | [csfloat.com/profile](https://csfloat.com/profile)               |
| `GEMINI_API_KEY`     | AI advisor and plain-English Find  | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY`       | AI advisor (if you have no Gemini) | [console.groq.com/keys](https://console.groq.com/keys)           |
| `OPENROUTER_API_KEY` | AI advisor (free models)           | [openrouter.ai/keys](https://openrouter.ai/keys)                 |

For the AI you need just one of Gemini, Groq or OpenRouter. Gemini is the easiest. If you
add more than one, Imbalance uses Gemini first, then Groq, then OpenRouter.

### CSFloat (exact floats)

1. Go to [csfloat.com](https://csfloat.com) and sign in with Steam.
2. Open your profile and pick the **Developers** tab.
3. Click **New Key**, give it any name, and copy the key.

Stuck? [Video guides on YouTube](https://www.youtube.com/results?search_query=how+to+get+csfloat+api+key)

### Google Gemini (AI, recommended)

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a
   Google account.
2. Click **Create API key**.
3. Copy the key.

Stuck? [Video guides on YouTube](https://www.youtube.com/results?search_query=how+to+get+gemini+api+key+free+google+ai+studio)

### Groq (AI)

1. Go to [console.groq.com](https://console.groq.com) and sign in.
2. Open **API Keys** and click **Create API Key**.
3. Copy the key.

Stuck? [Video guides on YouTube](https://www.youtube.com/results?search_query=how+to+get+groq+api+key)

### OpenRouter (AI)

1. Go to [openrouter.ai](https://openrouter.ai) and sign in.
2. Open **Keys** and click **Create Key**.
3. Copy the key.

Stuck? [Video guides on YouTube](https://www.youtube.com/results?search_query=how+to+get+openrouter+api+key)

### Adding a key to Imbalance

**Easy way:** with the app running, click **API keys** in the top right, paste the key into
its box and click **Save**. It works straight away, no restart needed.

**By hand:** copy `.env.example` to a new file called `.env.local` in the `imbalance` folder
and put your keys after the `=` signs:

```
CSFLOAT_API_KEY=your-csfloat-key
GEMINI_API_KEY=your-gemini-key
OPENROUTER_API_KEY=
GROQ_API_KEY=
```

Leave a line empty if you don't have that key. `.env.local` is ignored by git, so your keys
never get uploaded. Never paste your keys into an issue, a screenshot or a chat.

The AI only comments on numbers Imbalance worked out. It never does the maths.

## Good to know

- **Pick a risk level on Trade-ups and Deals.** Safe (the default) only trusts prices
  backed by regular sales. Balanced and Aggressive let through contracts and deals that
  lean on skins that sell less often: more and bigger results, but a real chance of losing
  money. Risky contracts are always marked **Check** in red, whatever level you pick.
  Contracts whose value comes mostly from skins that hardly ever sell look great on paper
  and often lose money in real life.
- **Set a bankroll on the Tracker page** (the money you've set aside for trading). Costs
  over 10% of it turn red, and each contract says roughly how many tries it needs before
  you're likely to be ahead. Knife trade-ups often need hundreds.
- **"Pattern matters"** marks finishes whose value depends on the pattern (Case Hardened,
  Fade, Marble Fade, Crimson Web and others). Imbalance doesn't price patterns. To flag
  patterns you know are valuable, copy `docs/patterns.example.json` to
  `data/patterns.json` and add yours; matching CSFloat listings get a green badge.
- **Charts fill up over time.** The app saves prices every 6 hours while you use it.
- **New items are trade locked for 7 days.** Change this on the Tracker page if it changes.

## Troubleshooting

| Problem                                            | Fix                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "running scripts is disabled on this system"       | In PowerShell type `npm.cmd` instead of `npm`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once |
| `npm install` fails, or `node:sqlite` is not found | Run `node -v`. You need version 24 or newer                                                                      |
| Port 3000 is in use                                | Close the other app, or run `npx next dev -H localhost -p 3001`                                                  |
| Page stuck on "Loading" or keeps reloading         | Stop the app (Ctrl+C), delete the `.next` folder, run `npm start` again                                          |
| "Too many requests"                                | Skinport allows about 8 requests per 5 minutes. Wait and try again                                               |

## Privacy

Prices, skins and your tracker are saved in `data/imbalance.db` on your PC. API keys are saved
in `.env.local`. Neither is ever uploaded or committed to git. The app only talks to the price
and skin APIs, the exchange rate API, and your chosen AI provider if you add a key. Your
tracker is only sent to the AI when you ask it a question on the Dashboard.

## For developers

```
npm install
npm run dev       # live reload while you edit (slower: compiles each page on first visit)
npm run check     # lint, format, typecheck, tests, build
```

Next.js 16, TypeScript, Tailwind 4, SQLite via `node:sqlite`. Logic lives in `src/lib/` with
tests next to it. See [handover.md](handover.md) for the full picture and
[docs/roadmap.md](docs/roadmap.md) for what is next.

## License

[MIT](LICENSE) · Made by [Abdullah](https://abdullahexe.online)
