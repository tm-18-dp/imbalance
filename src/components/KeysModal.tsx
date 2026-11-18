"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyDef, KeyId } from "@/lib/keys";

const DISMISSED = "imbalance-keys-dismissed";

type KeysResponse = { defs: KeyDef[]; status: Record<KeyId, boolean> };

/** "API keys" button plus the setup popup. Opens by itself on first run when keys are missing. */
export function KeysModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<KeysResponse | null>(null);
  const [values, setValues] = useState<Partial<Record<KeyId, string>>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/keys");
    const json = (await res.json()) as KeysResponse;
    setData(json);
    return json;
  }, []);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json() as Promise<KeysResponse>)
      .then((json) => {
        setData(json);
        const missing = !Object.values(json.status).some(Boolean);
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(DISMISSED) === "1";
        } catch {}
        if (missing && !dismissed) dialog.current?.showModal();
      })
      .catch((err: unknown) => console.error(err));
  }, []);

  function close() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    dialog.current?.close();
  }

  async function save(ids: KeyId[], clear = false) {
    setSaving(true);
    setMessage(null);
    try {
      const body = Object.fromEntries(
        ids.map((id) => [id, clear ? "" : (values[id] ?? "")]),
      );
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save the key.");
      setValues({});
      await load();
      setMessage({
        ok: true,
        text: clear
          ? "Key removed."
          : "Saved to .env.local. It works right away.",
      });
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Could not save the key.",
      });
    } finally {
      setSaving(false);
    }
  }

  const anySet = data ? Object.values(data.status).some(Boolean) : true;

  return (
    <>
      <button
        className="btn whitespace-nowrap"
        onClick={() => dialog.current?.showModal()}
      >
        API keys
        {!anySet && (
          <span
            className="ml-1.5 inline-block size-2 rounded-full bg-bad"
            aria-label="none set"
          />
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="keys-title"
        className="m-auto w-[min(42rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-line bg-panel p-0 text-text backdrop:bg-black/60"
        onCancel={close}
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="keys-title" className="text-lg font-semibold">
                Add your free API keys
              </h2>
              <p className="mt-1 text-sm text-muted">
                Imbalance already works with Skinport prices, no key needed.
                These free keys unlock more. They are saved in{" "}
                <code>.env.local</code> on this PC and never uploaded.
              </p>
            </div>
            <button className="btn shrink-0" onClick={close}>
              Close
            </button>
          </div>

          {message && (
            <p
              role="status"
              className={`mb-3 text-sm ${message.ok ? "text-good" : "text-bad"}`}
            >
              {message.text}
            </p>
          )}

          {(["market", "ai"] as const).map((group) => (
            <section key={group} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {group === "market"
                  ? "Market data"
                  : "AI advisor (optional, any one is enough)"}
              </h3>
              <div className="space-y-3">
                {data?.defs
                  .filter((d) => d.group === group)
                  .map((d) => (
                    <div
                      key={d.id}
                      className="rounded-md border border-line p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{d.label}</span>
                        <span
                          className={`text-xs font-medium ${data.status[d.id] ? "text-good" : "text-muted"}`}
                        >
                          {data.status[d.id] ? "Added" : "Not added"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted">{d.unlocks}</p>
                      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
                        {d.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        <a
                          className="text-accent underline"
                          href={d.signupUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Get the key
                        </a>
                        <a
                          className="text-accent underline"
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(d.videoSearch)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Watch a how-to video
                        </a>
                      </div>
                      <form
                        className="mt-3 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void save([d.id]);
                        }}
                      >
                        <label className="sr-only" htmlFor={`key-${d.id}`}>
                          {d.label} key
                        </label>
                        <input
                          id={`key-${d.id}`}
                          type="password"
                          autoComplete="off"
                          className="input min-w-0 flex-1"
                          placeholder={
                            data.status[d.id]
                              ? "Paste a new key to replace it"
                              : "Paste your key"
                          }
                          value={values[d.id] ?? ""}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [d.id]: e.target.value }))
                          }
                        />
                        <button
                          className="btn-primary"
                          disabled={saving || !values[d.id]?.trim()}
                        >
                          Save
                        </button>
                        {data.status[d.id] && (
                          <button
                            type="button"
                            className="btn"
                            disabled={saving}
                            onClick={() => void save([d.id], true)}
                          >
                            Remove
                          </button>
                        )}
                      </form>
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
