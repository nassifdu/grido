"use client";

import { useState, useCallback, useRef } from "react";
import type { ProductSummary, ProductPivot } from "@/lib/catalog";
import PivotTable from "./PivotTable";

type PivotState = ProductPivot | "loading" | "error";

export default function CatalogView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [widgets, setWidgets] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [isSearching, setIsSearching] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();
      setResults(res.ok ? (json.products ?? []) : []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(val), 280);
  };

  const toggleWidget = async (product: ProductSummary) => {
    const selected = widgets.some((w) => w.key === product.key);

    if (selected) {
      setWidgets((prev) => prev.filter((w) => w.key !== product.key));
      setPivots((prev) => {
        const next = new Map(prev);
        next.delete(product.key);
        return next;
      });
      return;
    }

    setWidgets((prev) => [...prev, product]);
    setPivots((prev) => new Map(prev).set(product.key, "loading"));
    try {
      const res = await fetch(`/api/catalog/${product.groupId}`);
      if (!res.ok) throw new Error();
      const pivot: ProductPivot = await res.json();
      setPivots((prev) => new Map(prev).set(product.key, pivot));
    } catch {
      setPivots((prev) => new Map(prev).set(product.key, "error"));
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">
        {/* Search input */}
        <div className="shrink-0 p-3 border-b border-zinc-100">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.65 10.65z"
              />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
            />
            {isSearching && (
              <svg
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-300"
                viewBox="0 0 24 24" fill="none"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {!query && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
              <svg className="mb-3 h-8 w-8 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.65 10.65z"
                />
              </svg>
              <p className="text-xs text-zinc-400">Busque um produto para começar</p>
            </div>
          )}

          {query && !isSearching && results.length === 0 && (
            <p className="py-10 text-center text-xs text-zinc-400">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-zinc-50 py-1">
              {results.map((p) => {
                const selected = widgets.some((w) => w.key === p.key);
                return (
                  <li key={p.key}>
                    <button
                      onClick={() => toggleWidget(p)}
                      className={`w-full px-3 py-2.5 text-left flex items-center gap-2.5 transition-colors group ${
                        selected ? "bg-zinc-50" : "hover:bg-zinc-50/80"
                      }`}
                    >
                      {/* Checkbox */}
                      <span className={`shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        selected
                          ? "border-zinc-900 bg-zinc-900"
                          : "border-zinc-300 group-hover:border-zinc-400"
                      }`}>
                        {selected && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>

                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900 leading-snug">{p.nome}</p>
                        <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                          {p.totalEstoque} un.
                          {p.variantCount > 1 && (
                            <span className="ml-1.5 text-zinc-300">· {p.variantCount} var.</span>
                          )}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer: selected count */}
        {widgets.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50">
            <p className="text-xs text-zinc-400">
              {widgets.length === 1
                ? "1 produto selecionado"
                : `${widgets.length} produtos selecionados`}
            </p>
          </div>
        )}
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto bg-zinc-50">
        {widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full select-none">
            <svg className="mb-4 h-12 w-12 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
            </svg>
            <p className="text-sm text-zinc-400">Selecione produtos na barra lateral</p>
          </div>
        ) : (
          <div className="p-6 columns-2 gap-5">
            {widgets.map((w) => {
              const state = pivots.get(w.key);
              const pivot = state && state !== "loading" && state !== "error" ? state : null;

              return (
                <div key={w.key} className="break-inside-avoid mb-5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {/* Widget header */}
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-zinc-900 leading-snug">{w.nome}</h2>
                      {w.marca && <p className="text-xs text-zinc-400 mt-0.5">{w.marca}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {pivot && (
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Estoque</p>
                          <p className="text-xl font-bold text-zinc-900 tabular-nums leading-tight">
                            {pivot.grandTotal}
                          </p>
                        </div>
                      )}
                      <button
                        onClick={() => toggleWidget(w)}
                        aria-label="Fechar"
                        className="rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500 transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Widget body */}
                  {!state || state === "loading" ? (
                    <div className="flex items-center justify-center py-14">
                      <svg className="h-5 w-5 animate-spin text-zinc-300" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  ) : state === "error" ? (
                    <div className="flex items-center justify-center py-14 text-xs text-zinc-400">
                      Erro ao carregar dados
                    </div>
                  ) : (
                    <PivotTable pivot={state} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
