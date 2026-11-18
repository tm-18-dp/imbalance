import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Guide | Imbalance" };

const SECTIONS = [
  { id: "start", title: "Start here (2 minutes)" },
  { id: "ideas", title: "How Imbalance makes money" },
  { id: "risk", title: "Pick a risk level" },
  { id: "tradeups", title: "Trade-ups" },
  { id: "deals", title: "Deals" },
  { id: "tracker", title: "Tracker" },
  { id: "alerts", title: "Alerts and the watchlist" },
  { id: "sim", title: "Practice with the Simulator" },
  { id: "keys", title: "Free API keys (optional)" },
  { id: "safety", title: "Before you spend money" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-4 space-y-3 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const Steps = ({ children }: { children: React.ReactNode }) => (
  <ol className="list-decimal space-y-2 pl-5">{children}</ol>
);
const Bullets = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc space-y-2 pl-5">{children}</ul>
);
const Page = ({ href, children }: { href: string; children: string }) => (
  <Link href={href} className="font-medium text-accent underline">
    {children}
  </Link>
);

/** A first-time guide to the important features, in the order you'd use them. */
export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 text-sm leading-relaxed">
      <div>
        <h1 className="text-2xl font-bold">Guide</h1>
        <p className="text-muted">
          How to use Imbalance, from first start to your first trade. Every
          number in the app is worked out on your PC from public market prices,
          after each marketplace&apos;s fee.
        </p>
      </div>

      <nav aria-label="On this page" className="panel p-4">
        <p className="mb-2 font-semibold">On this page</p>
        <ol className="grid gap-1 sm:grid-cols-2">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent hover:underline">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="start" title="1. Start here (2 minutes)">
        <Steps>
          <li>
            On the <Page href="/">Dashboard</Page>, click{" "}
            <strong>Update skin list</strong>, then{" "}
            <strong>Update prices</strong>. Both take a few seconds. You only
            need the skin list again when a new case comes out.
          </li>
          <li>
            Leave the price box in the top bar (&quot;Auto prices&quot; or
            &quot;Prices 2 min ago&quot;) ticked. While the app is open, prices
            update by themselves every 10 minutes.
          </li>
          <li>
            Pick your currency in the top bar. Prices are shown in it; the app
            works in US dollars behind the scenes.
          </li>
          <li>
            Choose a{" "}
            <a href="#risk" className="font-medium text-accent underline">
              risk level
            </a>
            , then try <Page href="/tradeups">Trade-ups</Page> or{" "}
            <Page href="/deals">Deals</Page>.
          </li>
        </Steps>
        <p className="text-muted">
          The API keys popup that opens on first start is optional. Close it;
          everything below works without keys except where it says so.
        </p>
      </Section>

      <Section id="ideas" title="2. How Imbalance makes money">
        <Bullets>
          <li>
            <strong>Trade-ups:</strong> in CS2 you can trade 10 skins of one
            rarity (5 for Covert into a knife or gloves) for 1 random skin of
            the next rarity. Imbalance finds mixes where the result is worth
            more, on average, than the 10 skins cost.
          </li>
          <li>
            <strong>Deals:</strong> skins listed below the price they usually
            sell for, that sell often enough to buy and resell.
          </li>
          <li>
            <strong>Float snipes and cross-market gaps</strong> (bottom of the
            Deals page): rare low or high floats priced like normal ones, and
            items cheaper on one marketplace than another.
          </li>
        </Bullets>
        <p>
          Two rules apply everywhere: <strong>fees</strong> (Skinport keeps 8%,
          CSFloat 2%, Steam 15% and pays in Steam wallet money you can&apos;t
          withdraw), and the <strong>7-day trade hold</strong>: anything you buy
          or get from a trade-up can&apos;t be sold for about a week.
        </p>
      </Section>

      <Section id="risk" title="3. Pick a risk level">
        <p>
          The risk buttons on Trade-ups and Deals decide which results you see.
          Your choice is remembered.
        </p>
        <Bullets>
          <li>
            <strong>Safe:</strong> only prices backed by regular sales. Smaller,
            steadier profits. Start here.
          </li>
          <li>
            <strong>Balanced:</strong> also counts skins that sell less often.
            More results, wider swings.
          </li>
          <li>
            <strong>Aggressive:</strong> allows rare sellers and unpriced
            results. The biggest profits on paper, and a real chance of losing
            money.
          </li>
        </Bullets>
      </Section>

      <Section id="tradeups" title="4. Trade-ups">
        <Steps>
          <li>
            On <Page href="/tradeups">Trade-ups</Page>, pick the rarity you want
            to put in, where you&apos;ll sell, and optionally a max cost. Click{" "}
            <strong>Scan</strong>.
          </li>
          <li>
            The table lists contracts by expected profit.{" "}
            <strong>Worst / best</strong> is what one try can lose or win,{" "}
            <strong>Chance to profit</strong> is how often one try comes out
            ahead, and <strong>Days</strong> is the trade hold plus the time to
            sell.
          </li>
          <li>
            Click a contract to see everything: what to buy, every possible
            result with its chance, how many tries it takes to be ahead, and any
            risks.
          </li>
          <li>
            <strong>Copy shopping list</strong> (under &quot;1. Buy these&quot;)
            gives you each item, how many, the highest float that works, the
            price to expect and links to search Skinport, CSFloat and Steam.
          </li>
          <li>
            With a CSFloat key, <strong>Pick exact floats on CSFloat</strong>{" "}
            finds real listings with low floats that can push results into a
            better wear, for more profit.
          </li>
        </Steps>
        <p className="text-muted">
          Expected profit is an average over many tries. One trade-up gives one
          random result, so single contracts swing a lot. The contract window
          says how many tries it takes before you&apos;re likely to be ahead.
        </p>
      </Section>

      <Section id="deals" title="5. Deals">
        <Steps>
          <li>
            On <Page href="/deals">Deals</Page>, set the minimum discount and
            how often it must sell, then click <strong>Find deals</strong>.
          </li>
          <li>
            <strong>Flip profit</strong> is what you keep after buying now,
            waiting out the trade hold and reselling at the usual price, after
            the fee.
          </li>
          <li>
            The badges help: <strong>dip</strong> means cheaper than usual while
            the long-term price holds (often recovers); <strong>falling</strong>{" "}
            means it has been dropping for weeks and may keep going. Click{" "}
            <strong>Chart</strong> to see the price history.
          </li>
        </Steps>
      </Section>

      <Section id="tracker" title="6. Tracker: prove it works">
        <p>
          The <Page href="/tracker">Tracker</Page> records what you really do,
          so you can see whether it actually makes money.
        </p>
        <Steps>
          <li>
            <strong>Add a purchase</strong> for everything you buy: the exact
            market name, price, float if you know it, what you bought it for
            (deal, trade-up and so on) and the risk level you found it at.
          </li>
          <li>
            When you do a trade-up, tick its 10 skins under{" "}
            <strong>What you hold</strong> and record what you got. The app
            saves what it expected from those exact skins.
          </li>
          <li>
            When you sell something, click <strong>Sold</strong> and enter the
            price. Profit is worked out after the fee.
          </li>
          <li>
            <strong>Next steps</strong> (here and on the Dashboard) tells you
            what to sell and when your next item unlocks.
          </li>
          <li>
            <strong>Results</strong> shows your real profit per strategy and per
            risk level. <strong>Expected vs what you got</strong> compares your
            trade-ups with what the app predicted; after 20 or more it says
            whether the maths is holding up.
          </li>
        </Steps>
        <p className="text-muted">
          Use <strong>Download backup</strong> now and then. Set a{" "}
          <strong>bankroll</strong> (the money you set aside for trading) and
          the app warns you when one buy is too big a share of it.
        </p>
      </Section>

      <Section id="alerts" title="7. Alerts and the watchlist">
        <Bullets>
          <li>
            <strong>Alert me</strong>, next to Scan and Find deals, saves that
            search with an optional minimum return or profit. After each price
            update the app runs it again and tells you about anything new, with
            a browser notification if you allow them, or a link in the top bar.
            Alerts only run while the app is open.
          </li>
          <li>
            <strong>The star (&#9734;)</strong> next to an item on Deals, Skins,
            Trade-ups or the Tracker adds it to the <strong>Watchlist</strong>{" "}
            on the Dashboard, with its price, trend and change since you starred
            it.
          </li>
          <li>
            Manage alerts and the watchlist on the{" "}
            <Page href="/">Dashboard</Page>.
          </li>
        </Bullets>
      </Section>

      <Section id="sim" title="8. Practice with the Simulator">
        <p>
          The <Page href="/sim">Simulator</Page> runs practice bots with pretend
          money at real Skinport prices, so you can see how a strategy does
          before risking money.
        </p>
        <Steps>
          <li>
            Pick a strategy (Trade-ups and a rarity, or Deals), a risk level,
            how much pretend money, and the most one buy may use. Click{" "}
            <strong>Start bot</strong>; it makes its first buys straight away.
          </li>
          <li>
            After each price update while the app is open, every bot sells what
            is due and looks for new buys, following the same picks you see on
            Trade-ups and Deals. Trade-up results are rolled with the app&apos;s
            odds.
          </li>
          <li>
            It plays by the real rules: buys at the lowest listing, waits out
            the 7-day trade hold and the usual time to sell, and pays the
            selling fee. Results build up over weeks.
          </li>
          <li>
            Each bot shows its value, cash, profit from sales, how often it sold
            at a profit, a value chart and every item it bought.
          </li>
        </Steps>
        <p className="text-muted">
          Run two bots side by side (say Safe deals and Aggressive trade-ups) to
          compare. A bot&apos;s value counts unsold items at their usual price;
          only sales are real profit.
        </p>
      </Section>

      <Section id="keys" title="9. Free API keys (optional)">
        <p>
          Click <strong>API keys</strong> in the top bar. Each popup entry links
          to where you get the key and a how-to video. All are free.
        </p>
        <Bullets>
          <li>
            <strong>CSFloat:</strong> real listings with exact floats. Needed
            for exact floats on trade-ups, float snipes and comparing CSFloat
            prices.
          </li>
          <li>
            <strong>Gemini, Groq or OpenRouter</strong> (any one): the
            Dashboard&apos;s plain-English search (&quot;purple trade-ups under
            20&quot;) and <strong>Ask AI</strong> buttons. The AI only explains
            numbers the app worked out; it never does the maths.
          </li>
        </Bullets>
        <p className="text-muted">
          Keys stay on your PC, in the <code>.env.local</code> file in the app
          folder.
        </p>
      </Section>

      <Section id="safety" title="10. Before you spend money">
        <Bullets>
          <li>
            Check the price and float of every item on the marketplace before
            buying. Listings change by the minute.
          </li>
          <li>
            Start on <strong>Safe</strong> with small amounts, log everything in
            the Tracker, and move to a riskier level only if your own results
            back it up.
          </li>
          <li>
            Never put in money you can&apos;t afford to lose. Prices can drop
            during the 7-day hold, and a single trade-up can lose most of its
            cost.
          </li>
          <li>Imbalance is a calculator, not financial advice.</li>
        </Bullets>
      </Section>
    </div>
  );
}
