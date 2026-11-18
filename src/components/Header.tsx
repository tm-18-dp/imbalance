"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeysModal } from "./KeysModal";
import { CurrencyPicker } from "./Money";
import { PriceRefresher } from "./PriceRefresher";
import { AlertWatcher } from "./Alerts";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/tradeups", label: "Trade-ups" },
  { href: "/deals", label: "Deals" },
  { href: "/catalog", label: "Skins" },
  { href: "/tracker", label: "Tracker" },
  { href: "/guide", label: "Guide" },
];

function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("imbalance-theme", dark ? "dark" : "light");
  } catch {}
}

export function Header() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-extrabold tracking-tight"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, no optimizing needed */}
          <img src="/logo.svg" alt="" width={32} height={32} />
          Imbalance
        </Link>
        <nav aria-label="Main" className="flex gap-4 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
              className={
                path === l.href
                  ? "font-semibold text-accent"
                  : "text-muted hover:text-text"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <AlertWatcher />
          <PriceRefresher />
          <CurrencyPicker />
          <button
            className="btn"
            onClick={toggleTheme}
            aria-label="Switch between dark and light theme"
          >
            Theme
          </button>
          <KeysModal />
        </div>
      </div>
    </header>
  );
}
