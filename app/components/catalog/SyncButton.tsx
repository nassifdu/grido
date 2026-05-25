"use client";

import { useEffect, useState } from "react";

type SyncState =
  | { status: "idle" }
  | { status: "syncing"; step: "produtos"; count: number }
  | { status: "syncing"; step: "variacoes"; current: number; total: number }
  | { status: "done" }
  | { status: "error"; message: string };

type ServerSyncStatus = {
  status: "idle" | "syncing" | "done" | "error";
  last_sync_at: string | null;
  sync_started_at: string | null;
  error_message: string | null;
};

export default function SyncButton() {
  const [state, setState] = useState<SyncState>({ status: "idle" });
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch status from server on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/catalog/sync/status");
        if (res.ok) {
          const data: ServerSyncStatus = await res.json();
          if (data.status === "syncing") {
            setState({ status: "syncing", step: "produtos", count: 0 });
          } else if (data.status === "error") {
            setState({ status: "error", message: data.error_message || "Erro desconhecido" });
          }
        }
      } catch {
        // silently ignore fetch errors on mount
      }
    };

    fetchStatus();
  }, []);

  // Poll server status while syncing or show error
  useEffect(() => {
    if (state.status !== "syncing" && state.status !== "error") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/catalog/sync/status");
        if (res.ok) {
          const data: ServerSyncStatus = await res.json();
          if (data.status === "idle") {
            setState({ status: "done" });
            setTimeout(() => setState({ status: "idle" }), 3000);
            clearInterval(interval);
          } else if (data.status === "error") {
            setState({ status: "error", message: data.error_message || "Erro" });
          }
        }
      } catch {
        // continue polling on fetch errors
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status]);

  async function startSync() {
    setState({ status: "syncing", step: "produtos", count: 0 });

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

    // Set up fallback polling in case stream closes
    const fallbackPoll = setInterval(async () => {
      if (!streamActive) return;
      try {
        const res = await fetch("/api/catalog/sync/status");
        if (res.ok) {
          const data: ServerSyncStatus = await res.json();
          if (data.status !== "syncing") {
            streamActive = false;
            clearInterval(fallbackPoll);
            if (data.status === "done") {
              setState({ status: "done" });
              setTimeout(() => setState({ status: "idle" }), 3000);
            } else if (data.status === "error") {
              setState({ status: "error", message: data.error_message || "Erro" });
            }
          }
        }
      } catch {
        // continue polling
      }
    }, 2000);

    try {
      while (streamActive) {
        const { done, value } = await reader.read();
        if (done) {
          streamActive = false;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(chunk.slice(6));
          } catch {
            continue;
          }

          if (event.type === "progress") {
            if (event.step === "produtos") {
              setState({ status: "syncing", step: "produtos", count: (event.count as number) ?? 0 });
            } else if (event.step === "variacoes") {
              setState({
                status: "syncing",
                step: "variacoes",
                current: (event.current as number) ?? 0,
                total: (event.total as number) ?? 0,
              });
            }
          } else if (event.type === "done") {
            streamActive = false;
            setState({ status: "done" });
            setTimeout(() => setState({ status: "idle" }), 3000);
          } else if (event.type === "error") {
            streamActive = false;
            setState({ status: "error", message: (event.message as string) ?? "Erro" });
          }
        }
      }
    } catch {
      // Stream closed or error - will fall back to polling
    } finally {
      clearInterval(fallbackPoll);
      try {
        reader.cancel();
      } catch {
        // already closed
      }
    }
  }

  if (state.status === "idle") {
    return (
      <button
        onClick={startSync}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
      >
        <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0 1 15-4.5L20 9M4 15l1 4.5A9 9 0 0 0 20 15" />
        </svg>
        Sincronizar
      </button>
    );
  }

  if (state.status === "done") {
    return (
      <div className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium text-emerald-600">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Sincronizado
      </div>
    );
  }

  if (state.status === "error") {
    return (
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
    );
  }

  // syncing
  if (state.step === "produtos") {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm text-zinc-500">
        <svg className="h-3.5 w-3.5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="tabular-nums">
          {state.count > 0 ? `${state.count.toLocaleString("pt-BR")} produtos…` : "Buscando produtos…"}
        </span>
      </div>
    );
  }

  // variacoes phase — show progress bar
  const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-28 overflow-hidden rounded-full bg-zinc-100 h-1.5">
        <div
          className="h-full rounded-full bg-zinc-700 transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-zinc-500">
        {state.current.toLocaleString("pt-BR")}/{state.total.toLocaleString("pt-BR")} var.
      </span>
    </div>
  );
}
