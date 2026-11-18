"use client";

import { useState } from "react";

/** Copy a shopping list to the clipboard, or save it as a text file. */
export function ShoppingListButtons({
  build,
  filename,
}: {
  /** Builds the text when clicked, so it has the latest plan. */
  build: () => string;
  filename: string;
}) {
  const [status, setStatus] = useState<string | null>(null);
  /** Shown when the browser won't let the page copy: select it and copy by hand. */
  const [fallback, setFallback] = useState<string | null>(null);

  async function copy() {
    const text = build();
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setStatus("Copied. Paste it into notes or a chat.");
    } catch {
      setFallback(text);
      setStatus(
        "This browser blocked copying. The list is selected below: press Ctrl+C (Cmd+C on a Mac).",
      );
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([build()], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(null);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm font-normal">
      <button type="button" className="btn" onClick={() => void copy()}>
        Copy shopping list
      </button>
      <button type="button" className="btn" onClick={download}>
        Download
      </button>
      {status && (
        <span role="status" className="text-muted">
          {status}
        </span>
      )}
      {fallback && (
        <textarea
          className="input h-48 w-full font-mono text-xs"
          readOnly
          autoFocus
          aria-label="Shopping list"
          value={fallback}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </span>
  );
}
