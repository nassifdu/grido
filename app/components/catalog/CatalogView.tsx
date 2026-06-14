"use client";

import { Fragment, useState, useCallback, useRef, useMemo } from "react";
import type { ProductSummary, ProductPivot } from "@/lib/catalog";

type PivotState = ProductPivot | "loading" | "error";

// Mirror of lib/catalog.ts sortSizes for client-side column ordering
const LETTER_SIZES = [
  "RN", "PP", "P", "M", "G", "GG", "GGG", "XGG", "XG",
  "EG", "EGG", "XS", "S", "L", "XL", "XXL", "XXXL",
];
const LETTER_ORDER = new Map(LETTER_SIZES.map((s, i) => [s, i]));

function sortSizes(sizes: string[]): string[] {
  const allNumeric = sizes.every((s) => /^\d+$/.test(s));
  if (allNumeric) return [...sizes].sort((a, b) => +a - +b);
  return [...sizes].sort((a, b) => {
    const ai = LETTER_ORDER.get(a) ?? 999;
    const bi = LETTER_ORDER.get(b) ?? 999;
    return ai !== bi ? ai - bi : a.localeCompare(b, "pt-BR");
  });
}

function stockClass(val: number): string {
  if (val === 0) return "text-zinc-300";
  if (val >= 10) return "text-emerald-700 font-medium";
  return "text-zinc-700";
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function CatalogView() {
  const [query, setQuery] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [minimo, setMinimo] = useState(0);
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [selected, setSelected] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [showSubtotals, setShowSubtotals] = useState(true);
  const [showZeros, setShowZeros] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [starredCells, setStarredCells] = useState<Set<string>>(new Set());
  const [incomingAnnotations, setIncomingAnnotations] = useState<Map<string, number>>(new Map());
  const [toBuyAnnotations, setToBuyAnnotations] = useState<Map<string, number>>(new Map());
  const [annotatingCell, setAnnotatingCell] = useState<{ key: string; type: "incoming" | "toBuy" } | null>(null);
  const [annotationInput, setAnnotationInput] = useState("");
  const skipBlurRef = useRef(false);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queryRef = useRef(query);
  const colorRef = useRef(colorFilter);
  const sizeRef = useRef(sizeFilter);

  // Union of all sizes from every loaded pivot, sorted
  const allSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    for (const [, state] of pivots) {
      if (state && state !== "loading" && state !== "error") {
        for (const s of state.sizes) sizeSet.add(s);
      }
    }
    return sortSizes([...sizeSet]);
  }, [pivots]);

  // color + sizes + total + optional price
  const colSpan = allSizes.length + 2 + (showPrice ? 1 : 0);

  // Global totals across all loaded pivots
  const globalTotals = useMemo(() => {
    const bySize: Record<string, number> = {};
    let grand = 0;
    for (const [, state] of pivots) {
      if (!state || state === "loading" || state === "error") continue;
      grand += state.grandTotal;
      for (const s of allSizes) {
        bySize[s] = (bySize[s] ?? 0) + (state.totals[s] ?? 0);
      }
    }
    return { bySize, grand };
  }, [pivots, allSizes]);

  // ── search ──────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string, color: string, size: string) => {
    if (!q.trim() && !color.trim() && !size.trim()) { setResults([]); return; }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q, limit: "50" });
      if (color.trim()) params.set("color", color.trim());
      if (size.trim()) params.set("size", size.trim());
      const res = await fetch(`/api/catalog?${params}`);
      const json = await res.json();
      setResults(res.ok ? (json.products ?? []) : []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    queryRef.current = val;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(val, colorRef.current, sizeRef.current), 280);
  };

  const handleColorChange = (val: string) => {
    setColorFilter(val);
    colorRef.current = val;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(queryRef.current, val, sizeRef.current), 280);
  };

  const handleSizeChange = (val: string) => {
    setSizeFilter(val);
    sizeRef.current = val;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => doSearch(queryRef.current, colorRef.current, val), 280);
  };

  // ── filtered results (client-side minimo filter) ─────────────────────────────

  const filteredResults = useMemo(
    () => results.filter((p) => p.totalStock >= minimo),
    [results, minimo]
  );

  // ── toggle product in/out of table ──────────────────────────────────────────

  const toggleProduct = async (product: ProductSummary) => {
    if (selected.some((p) => p.key === product.key)) {
      setSelected((prev) => prev.filter((p) => p.key !== product.key));
      setPivots((prev) => { const n = new Map(prev); n.delete(product.key); return n; });
      return;
    }
    setSelected((prev) => [...prev, product]);
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

  const selectAll = async () => {
    const toAdd = filteredResults.filter((p) => !selected.some((s) => s.key === p.key));
    if (toAdd.length === 0) return;
    setSelected((prev) => [...prev, ...toAdd]);
    for (const product of toAdd) {
      setPivots((prev) => new Map(prev).set(product.key, "loading"));
    }
    // Concurrency-limited queue — 3 at a time so we don't flood the server
    const CONCURRENCY = 3;
    let idx = 0;
    async function worker() {
      while (idx < toAdd.length) {
        const product = toAdd[idx++];
        try {
          const res = await fetch(`/api/catalog/${product.groupId}`);
          if (!res.ok) throw new Error();
          const pivot: ProductPivot = await res.json();
          setPivots((prev) => new Map(prev).set(product.key, pivot));
        } catch {
          setPivots((prev) => new Map(prev).set(product.key, "error"));
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  };

  // ── cell star / annotation ───────────────────────────────────────────────────

  function toggleStar(key: string) {
    setStarredCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openAnnotation(key: string, type: "incoming" | "toBuy", current: number | undefined) {
    setAnnotatingCell({ key, type });
    setAnnotationInput(current !== undefined ? String(current) : "");
  }

  function commitAnnotation(input: string) {
    if (!annotatingCell) return;
    const { key, type } = annotatingCell;
    const num = parseInt(input, 10);
    const setter = type === "incoming" ? setIncomingAnnotations : setToBuyAnnotations;
    setter((prev) => {
      const next = new Map(prev);
      if (!input.trim() || isNaN(num) || num <= 0) next.delete(key); else next.set(key, num);
      return next;
    });
    setAnnotatingCell(null);
  }

  // ── cell renderer (shared by grouped + flat views) ───────────────────────────

  function renderDataCell(s: string, cellKey: string, val: number) {
    const isStarred = starredCells.has(cellKey);
    const incoming = incomingAnnotations.get(cellKey);
    const toBuy = toBuyAnnotations.get(cellKey);
    const isAnnotating = annotatingCell?.key === cellKey;
    const annotatingType = isAnnotating ? annotatingCell!.type : null;

    return (
      <td key={s} className={`relative px-3 py-2.5 text-center tabular-nums border-r border-zinc-100 group${isStarred ? " bg-amber-50" : ""}`}>

        {/* Top-left: Star */}
        <button onClick={(e) => { e.stopPropagation(); toggleStar(cellKey); }} title="Destacar"
          className={`absolute top-0.5 left-0.5 rounded transition-opacity ${isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <svg className="h-3 w-3 text-amber-500" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        {/* Top-right: Incoming stock (download icon, blue) */}
        {incoming !== undefined && !isAnnotating ? (
          <button onClick={(e) => { e.stopPropagation(); openAnnotation(cellKey, "incoming", incoming); }} title="Editar chegada"
            className="absolute top-0 right-0.5 flex items-center gap-px text-[10px] font-bold leading-none text-blue-500 hover:text-blue-600">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
            </svg>
            {incoming}
          </button>
        ) : !isAnnotating && (
          <button onClick={(e) => { e.stopPropagation(); openAnnotation(cellKey, "incoming", undefined); }} title="Registrar chegada"
            className="absolute top-0.5 right-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="h-3 w-3 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
            </svg>
          </button>
        )}

        {/* Bottom-right: To buy ($ circle, amber) */}
        {toBuy !== undefined && !isAnnotating ? (
          <button onClick={(e) => { e.stopPropagation(); openAnnotation(cellKey, "toBuy", toBuy); }} title="Editar compra"
            className="absolute bottom-0 right-0.5 flex items-center gap-px text-[10px] font-bold leading-none text-amber-500 hover:text-amber-600">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M14.5 9.5C14 8.5 13.1 8 12 8c-1.4 0-2.5.7-2.5 1.8 0 1.1.9 1.6 2.5 2.1s2.5 1.1 2.5 2.3c0 1.2-1.1 2-2.5 2s-2.5-.8-2.5-2" />
            </svg>
            {toBuy}
          </button>
        ) : !isAnnotating && (
          <button onClick={(e) => { e.stopPropagation(); openAnnotation(cellKey, "toBuy", undefined); }} title="Registrar compra"
            className="absolute bottom-0.5 right-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10M14.5 9.5C14 8.5 13.1 8 12 8c-1.4 0-2.5.7-2.5 1.8 0 1.1.9 1.6 2.5 2.1s2.5 1.1 2.5 2.3c0 1.2-1.1 2-2.5 2s-2.5-.8-2.5-2" />
            </svg>
          </button>
        )}

        {/* Input overlay — shared by both annotation types */}
        {isAnnotating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
            <input
              ref={(el) => { if (el && document.activeElement !== el) { el.focus(); el.select(); } }}
              type="number" min="1" value={annotationInput}
              onChange={(e) => setAnnotationInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { skipBlurRef.current = true; commitAnnotation(annotationInput); }
                else if (e.key === "Escape") { skipBlurRef.current = true; setAnnotatingCell(null); }
              }}
              onBlur={() => { if (skipBlurRef.current) { skipBlurRef.current = false; return; } commitAnnotation(annotationInput); }}
              className={`w-10 py-0.5 text-center text-xs border rounded focus:outline-none focus:ring-1 ${
                annotatingType === "incoming"
                  ? "border-blue-300 focus:ring-blue-400"
                  : "border-amber-300 focus:ring-amber-400"
              }`}
            />
          </div>
        )}

        {/* Cell value */}
        {!isAnnotating && (
          val === 0
            ? (showZeros ? <span className="text-red-400">0</span> : <span className="opacity-30">·</span>)
            : <span className={stockClass(val)}>{val}</span>
        )}
      </td>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">

        {/* row 1 — main search */}
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path strokeLinecap="round" d="M16.5 16.5L21 21" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
            />
            {isSearching && (
              <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-300" />
            )}
          </div>
        </div>

        {/* row 2 — color + size */}
        <div className="shrink-0 px-3 pb-2 flex gap-2">
          <input
            type="text"
            value={colorFilter}
            onChange={(e) => handleColorChange(e.target.value)}
            placeholder="Cor"
            className="w-1/2 rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
          />
          <input
            type="text"
            value={sizeFilter}
            onChange={(e) => handleSizeChange(e.target.value)}
            placeholder="Tamanho"
            className="w-1/2 rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 px-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
          />
        </div>

        {/* row 3 — mínimo slider */}
        <div className="shrink-0 px-3 pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[11px] text-zinc-400 tracking-wider shrink-0">MÍNIMO</span>
            <input
              type="range"
              min={0}
              max={10}
              value={minimo}
              onChange={(e) => setMinimo(Number(e.target.value))}
              className="flex-1 accent-zinc-700 h-1 cursor-pointer"
            />
            <span className="font-mono text-[11px] text-zinc-400 w-4 text-right shrink-0">{minimo}</span>
          </div>
        </div>

        {/* results list */}
        <div className="flex-1 overflow-y-auto">
          {!query && !colorFilter && !sizeFilter && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
              <svg className="mb-3 h-8 w-8 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path strokeLinecap="round" d="M16.5 16.5L21 21" />
              </svg>
              <p className="text-xs text-zinc-400">Busque um produto para começar</p>
            </div>
          )}

          {(query || colorFilter || sizeFilter) && !isSearching && filteredResults.length === 0 && (
            <p className="py-10 text-center text-xs text-zinc-400">
              Nenhum resultado
            </p>
          )}

          {filteredResults.length > 0 && (
            <ul className="divide-y divide-zinc-50 py-1">
              {filteredResults.map((p) => {
                const isSelected = selected.some((w) => w.key === p.key);
                return (
                  <li key={p.key}>
                    <button
                      onClick={() => toggleProduct(p)}
                      className={`w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors group ${
                        isSelected ? "bg-zinc-50" : "hover:bg-zinc-50/80"
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-zinc-900 bg-zinc-900"
                          : "border-zinc-300 group-hover:border-zinc-400"
                      }`}>
                        {isSelected && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        {/* break-words so long names wrap instead of truncating */}
                        <p className="text-sm font-medium text-zinc-900 leading-snug break-words whitespace-normal">
                          {p.name}
                        </p>
                        <p className="text-xs mt-0.5 tabular-nums">
                          <span className={p.totalStock === 0 ? "text-red-400" : "text-zinc-400"}>
                            {p.totalStock} un.
                          </span>
                          {p.colorCount > 0 && (
                            <span className="ml-1.5 text-zinc-400">· {p.colorCount} cor.</span>
                          )}
                          {p.variantCount > 1 && (
                            <span className="ml-1.5 text-zinc-400">· {p.variantCount} var.</span>
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

        {/* footer count + tudo */}
        {(selected.length > 0 || filteredResults.length > 0) && (
          <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50 flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-400">
              {selected.length === 0
                ? ""
                : selected.length === 1
                ? "1 produto selecionado"
                : `${selected.length} produtos selecionados`}
            </p>
            {filteredResults.length > 0 && filteredResults.some((p) => !selected.some((s) => s.key === p.key)) && (
              <button
                onClick={selectAll}
                className="shrink-0 rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
              >
                Tudo
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Main — unified table ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50">
        {selected.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full select-none">
            <svg className="mb-4 h-12 w-12 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
            </svg>
            <p className="text-sm text-zinc-400">Selecione produtos na barra lateral</p>
          </div>
        ) : (
          <>
            {/* ── Controls bar ──────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-2.5 flex items-center gap-2">

              {/* View mode toggle */}
              <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode("grouped")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "grouped" ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="5" cy="6" r="2" />
                    <path strokeLinecap="round" d="M9 6h11M5 8v9M5 13h3M10 13h9M5 17h3M10 17h9" />
                  </svg>
                  Agrupada
                </button>
                <button
                  onClick={() => setViewMode("flat")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "flat" ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Plana
                </button>
              </div>

              {/* Options toggles: Subtotais | Zeros | Preço */}
              <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 gap-0.5">
                <button
                  onClick={() => setShowSubtotals((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showSubtotals ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 5H6l6 7-6 7h12" />
                  </svg>
                  Subtotais
                </button>
                <button
                  onClick={() => setShowZeros((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showZeros ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <ellipse cx="12" cy="12" rx="5.5" ry="7.5" />
                    <path strokeLinecap="round" d="M8 17l8-10" />
                  </svg>
                  Zeros
                </button>
                <button
                  onClick={() => setShowPrice((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showPrice ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                >
                  <span className="text-[11px] font-semibold leading-none">R$</span>
                  Preço
                </button>
              </div>

              {/* Limpar */}
              <button
                onClick={() => { setSelected([]); setPivots(new Map()); }}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Limpar
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
            <div className="w-fit mx-auto rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <table className="border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200">
                      {viewMode === "flat" ? "Variação" : "Cor"}
                    </th>
                    {allSizes.map((s) => (
                      <th
                        key={s}
                        className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200"
                      >
                        {s}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      Total
                    </th>
                    {showPrice && (
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-l border-zinc-200">
                        R$
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {viewMode === "grouped"
                    ? selected.map((product, productIdx) => {
                        const state = pivots.get(product.key);
                        const pivot = state && state !== "loading" && state !== "error" ? state : null;
                        return (
                          <Fragment key={product.key}>

                            {/* product group header */}
                            <tr className={`${productIdx > 0 ? "border-t-2 border-zinc-200" : ""} bg-zinc-50`}>
                              <td colSpan={colSpan} className="px-5 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-semibold text-zinc-800 leading-snug">{product.name}</span>
                                    {pivot && <span className="flex-none text-xs text-zinc-400 tabular-nums">{pivot.grandTotal} un.</span>}
                                    {state === "loading" && <Spinner className="h-3.5 w-3.5 text-zinc-400" />}
                                  </div>
                                  <button onClick={() => toggleProduct(product)} aria-label="Remover produto"
                                    className="flex-none rounded-md p-1 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {state === "loading" && (
                              <tr><td colSpan={colSpan} className="py-10 text-center"><Spinner className="h-5 w-5 text-zinc-300 mx-auto" /></td></tr>
                            )}
                            {state === "error" && (
                              <tr><td colSpan={colSpan} className="py-8 text-center text-xs text-zinc-400">Erro ao carregar dados</td></tr>
                            )}

                            {pivot?.isChildless && (
                              <tr className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                <td className="px-5 py-2.5 text-xs text-zinc-400 italic border-r border-zinc-100">{pivot.childlessCodigo ?? "sem variações"}</td>
                                {allSizes.map((s) => <td key={s} className="px-3 py-2.5 text-center text-zinc-200 border-r border-zinc-100">·</td>)}
                                <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">{pivot.grandTotal}</td>
                                {showPrice && <td className="px-4 py-2.5 text-center tabular-nums text-zinc-500 border-l border-zinc-200">{pivot.childlessPrice != null ? pivot.childlessPrice.toFixed(1).replace(".", ",") : <span className="text-zinc-300">—</span>}</td>}
                              </tr>
                            )}

                            {pivot && !pivot.isChildless && pivot.rows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                  {row.color ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                </td>
                                {allSizes.map((s) => renderDataCell(s, `${product.key}|||${row.color ?? ""}|||${s}`, row.cells[s]?.stock ?? 0))}
                                <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">{row.total}</td>
                                {showPrice && <td className="px-4 py-2.5 text-center tabular-nums text-zinc-500 border-l border-zinc-200">{row.rowPrice != null ? row.rowPrice.toFixed(1).replace(".", ",") : <span className="text-zinc-300">—</span>}</td>}
                              </tr>
                            ))}

                            {pivot && !pivot.isChildless && showSubtotals && (
                              <tr className="border-t border-zinc-200 bg-zinc-50/60">
                                <td className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 border-r border-zinc-100">Subtotal</td>
                                {allSizes.map((s) => (
                                  <td key={s} className="px-3 py-2 text-center text-xs font-semibold text-zinc-500 tabular-nums border-r border-zinc-100">{pivot.totals[s] ?? 0}</td>
                                ))}
                                <td className="px-5 py-2 text-center text-sm font-bold text-zinc-900 tabular-nums">{pivot.grandTotal}</td>
                                {showPrice && <td className="px-4 py-2 border-l border-zinc-200" />}
                              </tr>
                            )}

                          </Fragment>
                        );
                      })
                    : selected.map((product) => {
                        const state = pivots.get(product.key);
                        const pivot = state && state !== "loading" && state !== "error" ? state : null;
                        return (
                          <Fragment key={product.key}>

                            {state === "loading" && (
                              <tr><td colSpan={colSpan} className="py-4 text-center"><Spinner className="h-4 w-4 text-zinc-300 mx-auto" /></td></tr>
                            )}
                            {state === "error" && (
                              <tr><td colSpan={colSpan} className="py-4 text-center text-xs text-zinc-400">Erro ao carregar {product.name}</td></tr>
                            )}

                            {pivot?.isChildless && (
                              <tr className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                <td className="px-3 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => toggleProduct(product)} aria-label="Remover produto"
                                      className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                    {pivot.parentCodigo && <code className="font-mono text-xs text-zinc-400">{pivot.parentCodigo}</code>}
                                    <span className="text-zinc-400 italic text-xs">{pivot.childlessCodigo ?? "sem variações"}</span>
                                  </div>
                                </td>
                                {allSizes.map((s) => <td key={s} className="px-3 py-2.5 text-center text-zinc-200 border-r border-zinc-100">·</td>)}
                                <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">{pivot.grandTotal}</td>
                                {showPrice && <td className="px-4 py-2.5 text-center tabular-nums text-zinc-500 border-l border-zinc-200">{pivot.childlessPrice != null ? pivot.childlessPrice.toFixed(1).replace(".", ",") : <span className="text-zinc-300">—</span>}</td>}
                              </tr>
                            )}

                            {pivot && !pivot.isChildless && pivot.rows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                <td className="px-3 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                  <div className="flex items-center gap-2">
                                    {rowIdx === 0 && (
                                      <button onClick={() => toggleProduct(product)} aria-label="Remover produto"
                                        className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                    {rowIdx > 0 && <span className="w-4 shrink-0" />}
                                    {pivot.parentCodigo && <code className="font-mono text-xs text-zinc-400">{pivot.parentCodigo}</code>}
                                    {row.color ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                  </div>
                                </td>
                                {allSizes.map((s) => renderDataCell(s, `${product.key}|||${row.color ?? ""}|||${s}`, row.cells[s]?.stock ?? 0))}
                                <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">{row.total}</td>
                                {showPrice && <td className="px-4 py-2.5 text-center tabular-nums text-zinc-500 border-l border-zinc-200">{row.rowPrice != null ? row.rowPrice.toFixed(1).replace(".", ",") : <span className="text-zinc-300">—</span>}</td>}
                              </tr>
                            ))}

                          </Fragment>
                        );
                      })
                  }
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-300 bg-zinc-100">
                    <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      Total
                    </td>
                    {allSizes.map((s) => (
                      <td key={s} className="px-3 py-3 text-center text-xs font-bold text-zinc-700 tabular-nums">
                        {globalTotals.bySize[s] ?? 0}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-center text-sm font-black text-zinc-900 tabular-nums">
                      {globalTotals.grand}
                    </td>
                    {showPrice && <td className="px-4 py-3 border-l border-zinc-300" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
        )}
      </main>

    </div>
  );
}
