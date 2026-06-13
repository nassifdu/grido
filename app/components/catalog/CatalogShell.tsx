"use client";

import CatalogView from "./CatalogView";
import SyncLastTime from "./SyncLastTime";

export default function CatalogShell() {
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
              <a
                href="/dashboard/inconsistencies"
                className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
              >
                Inconsistências
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
      <CatalogView />
    </div>
  );
}
