import { z } from "zod";
import { fetchJson } from "./http";
import { getKey, type KeyId } from "./keys";

export const PROVIDERS = {
  gemini: { label: "Gemini", key: "GEMINI_API_KEY" },
  groq: { label: "Groq", key: "GROQ_API_KEY" },
  openrouter: { label: "OpenRouter", key: "OPENROUTER_API_KEY" },
} as const satisfies Record<string, { label: string; key: KeyId }>;
export type ProviderId = keyof typeof PROVIDERS;

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const OPENAI_BASE = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/** The AI comments, the app counts. Every number it sees was computed by Imbalance. */
export const SYSTEM_PROMPT = `You advise a CS2 skin trader inside the Imbalance app.
Every number in the message was computed by the app and is correct. Never calculate, estimate or
invent numbers: only quote the ones given. If asked to work something out, say the app does the
maths and name the page (Trade-ups, Deals, Tracker). Money is in US dollars.
Answer in plain English, at most 6 short bullet points. Point out risks: outcomes that rarely
sell, missing prices, trade holds, falling prices, thin profit after fees. Say plainly when
something does not look worth doing. Do not use em dashes or en dashes.`;

/** First provider with a saved key, in the order Gemini, Groq, OpenRouter. */
export function pickProvider(
  file?: string,
): { id: ProviderId; key: string } | null {
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const key = getKey(PROVIDERS[id].key, file);
    if (key) return { id, key };
  }
  return null;
}

/**
 * Picks a chat model from the provider's live list, so the app keeps working when providers
 * rename models. Prefers fast, free, general chat models; skips audio, image, embedding,
 * guard and preview models.
 */
export function pickModel(provider: ProviderId, ids: string[]): string | null {
  const skip =
    /embed|image|tts|audio|whisper|guard|live|vision|preview|exp|aqa|learnlm|gemma|nano|search|compound/i;
  let pool = ids.filter((id) => !skip.test(id));
  if (provider === "openrouter")
    pool = pool.filter((id) => id.endsWith(":free"));
  const prefer =
    provider === "gemini"
      ? [/flash(?!.*lite)/, /flash/, /pro/]
      : [/llama.*70b/, /llama/, /qwen|deepseek|mistral/];
  // Newest first: higher version numbers in the name sort first.
  const version = (id: string) => Number(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  pool.sort((a, b) => version(b) - version(a) || a.localeCompare(b));
  for (const re of prefer) {
    const hit = pool.find((id) => re.test(id));
    if (hit) return hit;
  }
  return pool[0] ?? null;
}

export const geminiModels = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
});
export const openaiModels = z.object({
  data: z.array(z.object({ id: z.string() })),
});

const modelCache = new Map<ProviderId, { model: string; at: number }>();

async function chooseModel(provider: ProviderId, key: string): Promise<string> {
  const cached = modelCache.get(provider);
  if (cached && Date.now() - cached.at < 86_400_000) return cached.model;
  let ids: string[];
  if (provider === "gemini") {
    const r = await fetchJson(
      `${GEMINI}/models?pageSize=200`,
      geminiModels,
      { headers: { "x-goog-api-key": key } },
      20_000,
    );
    ids = r.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
  } else {
    const r = await fetchJson(
      `${OPENAI_BASE[provider]}/models`,
      openaiModels,
      { headers: { Authorization: `Bearer ${key}` } },
      20_000,
    );
    ids = r.data.map((m) => m.id);
  }
  const model = pickModel(provider, ids);
  if (!model)
    throw new Error(
      `${PROVIDERS[provider].label} has no free chat model for this key right now.`,
    );
  modelCache.set(provider, { model, at: Date.now() });
  return model;
}

export const geminiReply = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
export const openaiReply = z.object({
  choices: z.array(
    z.object({ message: z.object({ content: z.string().nullish() }) }),
  ),
});

/** Removes dashes the house style bans, in case the model ignores the prompt. */
const DASHES = new RegExp(
  `\\s*[${String.fromCharCode(0x2013, 0x2014)}]\\s*`,
  "g",
);
const ELLIPSIS = String.fromCharCode(0x2026);
export const cleanReply = (text: string) =>
  text.replace(DASHES, ", ").replaceAll(ELLIPSIS, "...").trim();

export type AiAnswer = { text: string; provider: string; model: string };

export async function askAi(
  prompt: string,
  system = SYSTEM_PROMPT,
  file?: string,
): Promise<AiAnswer> {
  const picked = pickProvider(file);
  if (!picked)
    throw new Error(
      "Add a Gemini, Groq or OpenRouter key (API keys button) to use the AI advisor.",
    );
  const { id, key } = picked;
  const model = await chooseModel(id, key);
  let text: string;
  if (id === "gemini") {
    const r = await fetchJson(
      `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`,
      geminiReply,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
        }),
      },
      60_000,
    );
    text =
      r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";
  } else {
    const r = await fetchJson(
      `${OPENAI_BASE[id]}/chat/completions`,
      openaiReply,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 800,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
      },
      60_000,
    );
    text = r.choices[0]?.message.content ?? "";
  }
  if (!text.trim()) throw new Error("The AI sent an empty answer. Try again.");
  return { text: cleanReply(text), provider: PROVIDERS[id].label, model };
}
