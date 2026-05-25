"use client";

import { useState } from "react";
import CatalogView from "./CatalogView";
import SyncButton from "./SyncButton";

export default function CatalogShell() {
  const [showSubtotals, setShowSubtotals] = useState(true);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-50">
      <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="text-base font-bold tracking-tight text-zinc-900">Grido</span>
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSubtotals((v) => !v)}
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                showSubtotals
                  ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Subtotais
            </button>
            <SyncButton />
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
