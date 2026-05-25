"use client";

import { useEffect, useState } from "react";

type ServerStatus = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync_at: string | null;
  sync_started_at: string | null;
};

function formatRelative(isoString: string | null): string {
  if (!isoString) return "nunca sincronizado";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diffMs / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (secs < 60) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days === 1) return "1 dia atrás";
  if (days < 7) return `${days} dias atrás`;
  if (weeks === 1) return "1 semana atrás";
  if (weeks < 4) return `${weeks} semanas atrás`;
  if (months === 1) return "1 mês atrás";
  return `${months} meses atrás`;
}

export default function SyncLastTime() {
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/catalog/sync/status");
        if (res.ok) {
          const data: ServerStatus = await res.json();
          setLastSyncAt(data.last_sync_at);
          const isStale = data.sync_started_at
            ? Date.now() - new Date(data.sync_started_at).getTime() > 10 * 60 * 1000
            : false;
          setIsSyncing(data.status === "syncing" && !isStale);
        }
      } catch {
        // silently ignore
      } finally {
        setLoaded(true);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!loaded) return null;

  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
      {isSyncing ? (
        <svg className="h-3 w-3 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.5L20 9M4 15l1 4.5A9 9 0 0 0 20 15" />
        </svg>
      )}
      {isSyncing ? "Sincronizando…" : `Última sincronização: ${formatRelative(lastSyncAt)}`}
    </span>
  );
}
