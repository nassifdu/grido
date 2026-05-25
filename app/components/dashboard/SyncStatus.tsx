"use client";

import { useEffect, useState } from "react";

type SyncStatusData = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync_at: string | null;
  sync_started_at: string | null;
  error_message: string | null;
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "Nunca";

  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "Agora";
    if (diffMins < 60) return `${diffMins}m atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 30) return `${diffDays}d atrás`;

    return date.toLocaleDateString("pt-BR");
  } catch {
    return "Nunca";
  }
}

export default function SyncStatus() {
  const [data, setData] = useState<SyncStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/catalog/sync/status");
        if (res.ok) {
          const statusData: SyncStatusData = await res.json();
          setData(statusData);
        }
      } catch {
        // silently ignore errors
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();

    // Refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !data) return null;

  const syncTime = formatRelativeTime(data.last_sync_at);
  const isSyncing = data.status === "syncing";
  const isError = data.status === "error";

  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
        isSyncing
          ? "bg-blue-50 border-blue-200 text-blue-700"
          : isError
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-blue-50 border-blue-200 text-blue-700"
      }`}
      title={
        isSyncing
          ? "Sincronização em andamento"
          : isError
            ? `Erro: ${data.error_message || "Desconhecido"}`
            : data.last_sync_at
              ? `Última sincronização: ${new Date(data.last_sync_at).toLocaleString("pt-BR")}`
              : "Nenhuma sincronização realizada"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full inline-block ${
          isSyncing ? "bg-blue-500 animate-pulse" : isError ? "bg-red-500" : "bg-blue-500"
        }`}
      />
      {isSyncing ? "Sincronizando…" : `Última: ${syncTime}`}
    </span>
  );
}
