"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ProductSummary, ProductPivot } from "@/lib/catalog";
import PivotTable from "./PivotTable";

type PivotState = ProductPivot | "loading" | "error";

export default function CatalogView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [widgets, setWidgets] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [showDrop, setShowDrop] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}&limit=25`);
      const json = await res.json();
      if (!res.ok) {
        setResults([]);
        setShowDrop(false);
        return;
      }
      setResults(json.products ?? []);
      setShowDrop(true);
      setActiveIdx(-1);
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

  const addWidget = async (product: ProductSummary) => {
    if (widgets.some((w) => w.key === product.key)) return;
    setWidgets((prev) => [...prev, product]);
    setShowDrop(false);
    setQuery("");
    setResults([]);

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

  const removeWidget = (key: string) => {
    setWidgets((prev) => prev.filter((w) => w.key !== key));
    setPivots((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDrop || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      addWidget(results[activeIdx]);
    } else if (e.key === "Escape") {
      setShowDrop(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search bar */}
      <div ref={wrapRef} className="relative">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
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
            onFocus={() => results.length > 0 && setShowDrop(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar produto por nome…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-10 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
          />
          {isSearching && (
            <svg
              className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-300"
              viewBox="0 0 24 24" fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {/* Dropdown */}
        {showDrop && results.length > 0 && (
          <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60">
            <ul className="max-h-80 overflow-y-auto divide-y divide-zinc-50 py-1">
              {results.map((p, idx) => {
                const active = idx === activeIdx;
                const already = widgets.some((w) => w.key === p.key);
                return (
                  <li key={p.key}>
                    <button
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => !already && addWidget(p)}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-4 transition-colors ${
                        active ? "bg-zinc-50" : "hover:bg-zinc-50"
                      } ${already ? "opacity-40 cursor-default" : "cursor-pointer"}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">{p.nome}</p>
                        {p.marca && <p className="text-xs text-zinc-400 truncate">{p.marca}</p>}
                      </div>
                      <div className="shrink-0 text-right space-y-0.5">
                        <p className="text-xs text-zinc-400">
                          {p.variantCount === 1 ? "1 variante" : `${p.variantCount} variantes`}
                        </p>
                        <p className="text-xs font-semibold text-zinc-600">{p.totalEstoque} un.</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Empty state */}
      {widgets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-300 select-none">
          <svg className="mb-4 h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
          <p className="text-sm text-zinc-400 font-medium">Grade analítica de estoque</p>
          <p className="text-xs text-zinc-300 mt-1">Busque um produto para começar</p>
        </div>
      )}

      {/* Widget grid */}
      {widgets.length > 0 && (
        <div className="grid gap-5" style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 560px), 1fr))",
        }}>
          {widgets.map((w) => {
            const state = pivots.get(w.key);
            const pivot = state && state !== "loading" && state !== "error" ? state : null;

            return (
              <div
                key={w.key}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
              >
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
                      onClick={() => removeWidget(w.key)}
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
    </div>
  );
}
