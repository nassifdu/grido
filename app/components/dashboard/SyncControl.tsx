"use client";

import { useEffect, useState } from "react";

const STALE_MS = 10 * 60 * 1000; // 10 minutes — max route duration is 300s

type SyncState =
  | { status: "idle" }
  | { status: "syncing_remote" }
  | { status: "syncing_local"; step: "produtos"; count: number }
  | { status: "syncing_local"; step: "variacoes"; current: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

type ServerStatus = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync_at: string | null;
  sync_started_at: string | null;
  error_message: string | null;
};

function formatLastSync(isoString: string | null): string {
  if (!isoString) return "Nunca";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diffMs / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (secs < 60) return "Agora";
  if (mins < 60) return `${mins}m atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days === 1) return "1 dia atrás";
  if (days < 7) return `${days} dias atrás`;
  if (weeks === 1) return "1 semana atrás";
  if (weeks < 4) return `${weeks} semanas atrás`;
  if (months === 1) return "1 mês atrás";
  return `${months} meses atrás`;
}

export default function SyncControl() {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  async function fetchStatus(): Promise<ServerStatus | null> {
    try {
      const res = await fetch("/api/catalog/sync/status");
      if (res.ok) return res.json();
    } catch {
      // ignore
    }
    return null;
  }

  // Initialize from server on mount
  useEffect(() => {
    fetchStatus().then((data) => {
      if (!data) return;
      setLastSyncAt(data.last_sync_at);
      if (data.status === "syncing") {
        const isStale = data.sync_started_at
          ? Date.now() - new Date(data.sync_started_at).getTime() > STALE_MS
          : false;
        if (!isStale) setState({ status: "syncing_remote" });
      } else if (data.status === "error") {
        setState({ status: "error", message: data.error_message || "Erro desconhecido" });
      }
    });
  }, []);

  // Poll when a remote sync is in progress (we didn't start it, no SSE)
  useEffect(() => {
    if (state.status !== "syncing_remote") return;

    const interval = setInterval(async () => {
      const data = await fetchStatus();
      if (!data) return;
      if (data.status === "done" || data.status === "idle") {
        setLastSyncAt(data.last_sync_at);
        setState({ status: "done" });
        setTimeout(() => setState({ status: "idle" }), 3000);
        clearInterval(interval);
      } else if (data.status === "error") {
        setState({ status: "error", message: data.error_message || "Erro" });
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state.status]);

  async function startSync() {
    setState({ status: "syncing_local", step: "produtos", count: 0 });

    let response: Response;
    try {
      response = await fetch("/api/catalog/sync", { method: "POST" });
    } catch {
      setState({ status: "error", message: "Falha ao conectar" });
      return;
    }

    if (!response.ok || !response.body) {
      setState({ status: "error", message: `HTTP ${response.status}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamActive = true;

    const fallbackPoll = setInterval(async () => {
      if (!streamActive) return;
      const data = await fetchStatus();
      if (!data) return;
      if (data.status !== "syncing") {
        streamActive = false;
        clearInterval(fallbackPoll);
        setLastSyncAt(data.last_sync_at);
        if (data.status === "done" || data.status === "idle") {
          setState({ status: "done" });
          setTimeout(() => setState({ status: "idle" }), 3000);
        } else if (data.status === "error") {
          setState({ status: "error", message: data.error_message || "Erro" });
        }
      }
    }, 2000);

    try {
      while (streamActive) {
        const { done, value } = await reader.read();
        if (done) { streamActive = false; break; }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(chunk.slice(6)); } catch { continue; }

          if (event.type === "progress") {
            if (event.step === "produtos") {
              setState({ status: "syncing_local", step: "produtos", count: (event.count as number) ?? 0 });
            } else if (event.step === "variacoes") {
              setState({
                status: "syncing_local",
                step: "variacoes",
                current: (event.current as number) ?? 0,
                total: (event.total as number) ?? 0,
              });
            }
          } else if (event.type === "done") {
            streamActive = false;
            setState({ status: "done" });
            fetchStatus().then((d) => {
              if (d) setLastSyncAt(d.last_sync_at);
            });
            setTimeout(() => setState({ status: "idle" }), 3000);
          } else if (event.type === "error") {
            streamActive = false;
            setState({ status: "error", message: (event.message as string) ?? "Erro" });
          }
        }
      }
    } catch {
      // stream closed — fallback poll handles recovery
    } finally {
      clearInterval(fallbackPoll);
      try { reader.cancel(); } catch { /* already closed */ }
    }
  }

  const isSyncing = state.status === "syncing_remote" || state.status === "syncing_local";
  const isError = state.status === "error";
  const isDone = state.status === "done";

  return (
    <div className="flex items-center gap-3">
      {/* Last sync label */}
      {!isSyncing && !isDone && (
        <span className="text-xs text-zinc-400 tabular-nums">
          {lastSyncAt ? `Última: ${formatLastSync(lastSyncAt)}` : "Nunca sincronizado"}
        </span>
      )}

      {/* Progress indicators when syncing locally */}
      {state.status === "syncing_local" && state.step === "produtos" && (
        <span className="text-xs tabular-nums text-zinc-500">
          {state.count > 0 ? `${state.count.toLocaleString("pt-BR")} produtos…` : "Buscando produtos…"}
        </span>
      )}
      {state.status === "syncing_local" && state.step === "variacoes" && (
        <div className="flex items-center gap-2">
          <div className="w-24 overflow-hidden rounded-full bg-zinc-100 h-1.5">
            <div
              className="h-full rounded-full bg-zinc-700 transition-all duration-200"
              style={{ width: `${state.total > 0 ? Math.round((state.current / state.total) * 100) : 0}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-zinc-500">
            {state.current.toLocaleString("pt-BR")}/{state.total.toLocaleString("pt-BR")} var.
          </span>
        </div>
      )}

      {/* Done flash */}
      {isDone && (
        <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Sincronizado
        </span>
      )}

      {/* Button */}
      {isError ? (
        <button
          onClick={startSync}
          title={state.message}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          Tentar novamente
        </button>
      ) : isSyncing ? (
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-500">
          <svg className="h-3.5 w-3.5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {state.status === "syncing_remote" ? "Sincronizando…" : null}
        </div>
      ) : !isDone ? (
        <button
          onClick={startSync}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.5L20 9M4 15l1 4.5A9 9 0 0 0 20 15" />
          </svg>
          Sincronizar
        </button>
      ) : null}
    </div>
  );
}
