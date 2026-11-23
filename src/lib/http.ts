import type { z } from "zod";
import { throttle } from "./limiter";

/** Fetches JSON, validates it with a zod schema, and throws a plain-English error on failure. */
export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<T> {
  const host = new URL(url).host;
  await throttle(host);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(
      `Could not reach ${host}. Check your internet connection.`,
      { cause: err },
    );
  }
  if (res.status === 429)
    throw new Error(`${host} says too many requests. Wait a few minutes.`);
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${host} refused the request (${res.status}). Check the API key.`,
    );
  }
  if (!res.ok)
    throw new Error(
      `${host} answered with error ${res.status}. Try again later.`,
    );
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `${host} sent data in an unexpected format. The API may have changed.`,
      {
        cause: parsed.error,
      },
    );
  }
  return parsed.data;
}
