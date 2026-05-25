"use client";

import { useState } from "react";
import CatalogView from "./CatalogView";
import SyncLastTime from "./SyncLastTime";

export default function CatalogShell() {
  const [showSubtotals, setShowSubtotals] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-50">
      <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-5 min-w-0">
            <span className="text-base font-bold tracking-tight text-zinc-900 shrink-0">Grido</span>
            <nav className="flex items-center gap-1 text-sm">
              <a
                href="/dashboard"
                className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
              >
                Dashboard
              </a>
              <span className="rounded-md px-2.5 py-1.5 font-medium text-zinc-900 bg-zinc-100">
                Estoque
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500 select-none">Subtotais</span>
              <button
                role="switch"
                aria-checked={showSubtotals}
                onClick={() => setShowSubtotals((v) => !v)}
                className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full p-0 transition-colors duration-200 ${
                  showSubtotals ? "bg-zinc-900" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    showSubtotals ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <SyncLastTime />
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <CatalogView showSubtotals={showSubtotals} />
    </div>
  );
}
