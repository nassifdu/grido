"use client";

import SyncStatus from "./SyncStatus";

export default function DashboardHeader({ blingUserId }: { blingUserId?: string }) {
  return (
    <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span className="text-base font-bold tracking-tight text-zinc-900">Grido</span>
          <div className="flex items-center gap-3">
            {blingUserId && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                Conta {blingUserId}
              </span>
            )}
            <SyncStatus />
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
