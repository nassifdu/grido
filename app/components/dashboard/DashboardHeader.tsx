"use client";

import SyncControl from "./SyncControl";

export default function DashboardHeader({ blingUserId }: { blingUserId?: string }) {
  return (
    <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
      <div className="grid grid-cols-3 items-center">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-tight text-zinc-900">Grido</span>
          {blingUserId && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              Conta {blingUserId}
            </span>
          )}
        </div>
        <div className="flex items-center justify-center">
          <SyncControl />
        </div>
        <div className="flex items-center justify-end">
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
  );
}
