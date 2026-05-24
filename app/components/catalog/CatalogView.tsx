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

  // drag state
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<{ idx: number; before: boolean } | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── search ──────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
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

  // ── widget toggle ────────────────────────────────────────────────────────────

  const toggleWidget = async (product: ProductSummary) => {
    const selected = widgets.some((w) => w.key === product.key);
    if (selected) {
      setWidgets((prev) => prev.filter((w) => w.key !== product.key));
      setPivots((prev) => { const n = new Map(prev); n.delete(product.key); return n; });
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

  // ── drag & drop ──────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragging(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDragOver((prev) =>
      prev?.idx === idx && prev?.before === before ? prev : { idx, before }
    );
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragging === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    let insertAt = before ? idx : idx + 1;
    if (dragging < insertAt) insertAt--;
    if (insertAt !== dragging) {
      setWidgets((prev) => {
        const next = [...prev];
        const [item] = next.splice(dragging, 1);
        next.splice(insertAt, 0, item);
        return next;
      });
    }
    setDragging(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragging(null);
    setDragOver(null);
  };

  // ── widget card ──────────────────────────────────────────────────────────────

  const renderWidget = (w: ProductSummary, flatIdx: number) => {
    const state = pivots.get(w.key);
    const pivot = state && state !== "loading" && state !== "error" ? state : null;
    const isDragging = dragging === flatIdx;
    const isOver = dragOver?.idx === flatIdx;

    return (
      <div key={w.key} className="relative select-none">
        {/* drop indicator: above */}
        {isOver && dragOver?.before && (
          <div className="absolute -top-[11px] inset-x-3 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10" />
        )}

        <div
          draggable
          onDragStart={(e) => handleDragStart(e, flatIdx)}
          onDragOver={(e) => handleDragOver(e, flatIdx)}
          onDrop={(e) => handleDrop(e, flatIdx)}
          onDragEnd={handleDragEnd}
          className={`rounded-xl border border-zinc-200 bg-white shadow-sm transition-opacity duration-150 ${
            isDragging ? "opacity-30" : "opacity-100"
          }`}
        >
          {/* header */}
          <div className="flex items-start gap-2 border-b border-zinc-100 px-3 py-4">
            {/* grip handle */}
            <div className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-400 transition-colors">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="5"  cy="3.5" r="1.5" />
                <circle cx="5"  cy="8"   r="1.5" />
                <circle cx="5"  cy="12.5" r="1.5" />
                <circle cx="11" cy="3.5" r="1.5" />
                <circle cx="11" cy="8"   r="1.5" />
                <circle cx="11" cy="12.5" r="1.5" />
              </svg>
            </div>

            <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 leading-snug">{w.nome}</h2>
                {w.marca && <p className="text-xs text-zinc-400 mt-0.5">{w.marca}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {pivot && (
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Estoque</p>
                    <p className="text-xl font-bold text-zinc-900 tabular-nums leading-tight">{pivot.grandTotal}</p>
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
          </div>

          {/* body */}
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

        {/* drop indicator: below */}
        {isOver && !dragOver?.before && (
          <div className="absolute -bottom-[11px] inset-x-3 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10" />
        )}
      </div>
    );
  };

  // even flat indices → left column, odd → right column
  const leftWidgets  = widgets.filter((_, i) => i % 2 === 0);
  const rightWidgets = widgets.filter((_, i) => i % 2 === 1);

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">
        {/* search */}
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

        {/* results */}
        <div className="flex-1 overflow-y-auto">
          {!query && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
              <svg className="mb-3 h-8 w-8 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path strokeLinecap="round" d="M16.5 16.5L21 21" />
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
                          {p.colorCount > 0 && (
                            <span className="ml-1.5 text-zinc-300">· {p.colorCount} cor.</span>
                          )}
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

        {/* footer */}
        {widgets.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50">
            <p className="text-xs text-zinc-400">
              {widgets.length === 1 ? "1 produto selecionado" : `${widgets.length} produtos selecionados`}
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
          <div className="p-6 flex gap-5 items-start">
            {/* left column: items at even flat indices (0, 2, 4…) */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">
              {leftWidgets.map((w, colIdx) => renderWidget(w, colIdx * 2))}
            </div>
            {/* right column: items at odd flat indices (1, 3, 5…) */}
            <div className="flex-1 flex flex-col gap-5 min-w-0">
              {rightWidgets.map((w, colIdx) => renderWidget(w, colIdx * 2 + 1))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
