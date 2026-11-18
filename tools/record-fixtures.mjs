// Records one real response from each outside API the app parses, so the zod schemas are
// tested against what the services really send (src/lib/api-fixtures.test.ts).
// Usage: npm run record-fixtures
// Reads keys from .env.local. Calls without a key are skipped, except OpenRouter's model
// list, which is public. Keys only travel in request headers and are never written; other
// people's account details (CSFloat sellers) are removed before saving.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join("src", "lib", "fixtures");
mkdirSync(OUT, { recursive: true });

const env = new Map();
for (const file of [".env", ".env.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2]) env.set(m[1], m[2].replace(/^(["'])(.*)\1$/, "$2"));
  }
}
const key = (id) => env.get(id);

/** Removes other people's account details, anywhere in the response. */
const PERSONAL =
  /seller|buyer|owner|steam_?id|avatar|username|user_?id|^user$|stall|profile|email|online|away|trade_url/i;
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !PERSONAL.test(k))
        .map(([k, v]) => [k, scrub(v)]),
    );
  return value;
}

/** Keeps responses small: the first `n` entries of the main list. */
function trim(body, n, keep = () => false) {
  const cut = (list) => [
    ...list.slice(0, n),
    ...list.slice(n).filter(keep).slice(0, n),
  ];
  if (Array.isArray(body)) return cut(body);
  for (const k of ["data", "models"])
    if (Array.isArray(body?.[k])) return { ...body, [k]: cut(body[k]) };
  return body;
}

async function record(name, url, init, shape = (b) => b) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      console.log(`${name}: HTTP ${res.status}, not saved`);
      return;
    }
    const body = shape(scrub(await res.json()));
    writeFileSync(
      path.join(OUT, `${name}.json`),
      JSON.stringify(body, null, 2) + "\n",
    );
    console.log(`${name}: saved`);
  } catch (err) {
    console.log(`${name}: failed (${err.message})`);
  }
}

const QUESTION = "In one short sentence: what is a CS2 trade-up contract?";
const openaiChat = (model) => ({
  model,
  temperature: 0.3,
  max_tokens: 100,
  messages: [{ role: "user", content: QUESTION }],
});
const isFree = (m) => typeof m?.id === "string" && m.id.endsWith(":free");

// OpenRouter: the model list is public; the chat reply needs a key.
const orKey = key("OPENROUTER_API_KEY");
await record(
  "openrouter-models",
  "https://openrouter.ai/api/v1/models",
  {},
  // Model descriptions are long marketing text the app never reads.
  (b) => {
    const t = trim(b, 15, isFree);
    for (const m of t.data) delete m.description;
    return t;
  },
);
if (orKey) {
  const list = await fetch("https://openrouter.ai/api/v1/models").then((r) =>
    r.json(),
  );
  const model = list.data.find(isFree)?.id;
  if (model)
    await record(
      "openrouter-reply",
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${orKey}`,
        },
        body: JSON.stringify(openaiChat(model)),
      },
    );
} else console.log("openrouter-reply: no OPENROUTER_API_KEY, skipped");

// Groq
const groqKey = key("GROQ_API_KEY");
if (groqKey) {
  const auth = { Authorization: `Bearer ${groqKey}` };
  await record(
    "groq-models",
    "https://api.groq.com/openai/v1/models",
    { headers: auth },
    (b) => trim(b, 30),
  );
  const list = await fetch("https://api.groq.com/openai/v1/models", {
    headers: auth,
  }).then((r) => r.json());
  const model = list.data?.find((m) => /llama/.test(m.id))?.id;
  if (model)
    await record(
      "groq-reply",
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(openaiChat(model)),
      },
    );
} else console.log("groq: no GROQ_API_KEY, skipped");

// Gemini
const geminiKey = key("GEMINI_API_KEY");
if (geminiKey) {
  const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
  const auth = { "x-goog-api-key": geminiKey };
  await record(
    "gemini-models",
    `${GEMINI}/models?pageSize=200`,
    { headers: auth },
    (b) => trim(b, 30),
  );
  const list = await fetch(`${GEMINI}/models?pageSize=200`, {
    headers: auth,
  }).then((r) => r.json());
  const model =
    list.models
      ?.filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .find(
        (id) => /flash/.test(id) && !/lite|image|tts|live|preview/.test(id),
      ) ?? "gemini-flash-latest";
  await record(
    "gemini-reply",
    `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: QUESTION }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      }),
    },
  );
} else console.log("gemini: no GEMINI_API_KEY, skipped");

// CSFloat: both sort orders the app uses.
const csKey = key("CSFLOAT_API_KEY");
if (csKey) {
  const name = "AK-47 | Redline (Field-Tested)";
  for (const sort of ["lowest_price", "lowest_float"]) {
    const q = new URLSearchParams({
      market_hash_name: name,
      sort_by: sort,
      type: "buy_now",
      limit: "5",
    });
    await record(
      `csfloat-listings-${sort.replace("_", "-")}`,
      `https://csfloat.com/api/v1/listings?${q}`,
      { headers: { Authorization: csKey } },
      (b) => trim(b, 5),
    );
  }
} else console.log("csfloat: no CSFLOAT_API_KEY, skipped");
