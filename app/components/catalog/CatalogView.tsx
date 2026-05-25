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
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [selected, setSelected] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [showSubtotals, setShowSubtotals] = useState(true);
  const [showZeros, setShowZeros] = useState(true);
  const [starredCells, setStarredCells] = useState<Set<string>>(new Set());
  const [cellAnnotations, setCellAnnotations] = useState<Map<string, number>>(new Map());
  const [annotatingCell, setAnnotatingCell] = useState<string | null>(null);
  const [annotationInput, setAnnotationInput] = useState("");
  const skipBlurRef = useRef(false);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // cor + sizes + total
  const colSpan = allSizes.length + 2;

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

  // ── cell star / annotation ───────────────────────────────────────────────────

  function toggleStar(key: string) {
    setStarredCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openAnnotation(key: string, current: number | undefined) {
    setAnnotatingCell(key);
    setAnnotationInput(current !== undefined ? String(current) : "");
  }

  function commitAnnotation(key: string, input: string) {
    const num = parseInt(input, 10);
    setCellAnnotations((prev) => {
      const next = new Map(prev);
      if (!input.trim() || isNaN(num) || num <= 0) next.delete(key); else next.set(key, num);
      return next;
    });
    setAnnotatingCell(null);
  }

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">

        {/* search input */}
        <div className="shrink-0 p-3 border-b border-zinc-100">
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
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Buscar produto…"
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
            />
            {isSearching && (
              <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-300" />
            )}
          </div>
        </div>

        {/* results list */}
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
                          {p.nome}
                        </p>
                        <p className="text-xs mt-0.5 tabular-nums">
                          <span className={p.totalEstoque === 0 ? "text-red-400" : "text-zinc-400"}>
                            {p.totalEstoque} un.
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

        {/* footer count */}
        {selected.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50">
            <p className="text-xs text-zinc-400">
              {selected.length === 1 ? "1 produto selecionado" : `${selected.length} produtos selecionados`}
            </p>
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
            <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-2.5 flex items-center gap-6">
              {/* Subtotais */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <svg className="h-3.5 w-3.5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18M3 10h18M3 15h18M3 20h10" />
                </svg>
                <span className="text-sm text-zinc-500">Subtotais</span>
                <button
                  role="switch"
                  aria-checked={showSubtotals}
                  onClick={() => setShowSubtotals((v) => !v)}
                  className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full p-0 transition-colors duration-200 ${showSubtotals ? "bg-zinc-900" : "bg-zinc-300"}`}
                >
                  <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showSubtotals ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              </label>

              {/* Mostrar zeros */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <svg className="h-3.5 w-3.5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm text-zinc-500">Mostrar zeros</span>
                <button
                  role="switch"
                  aria-checked={showZeros}
                  onClick={() => setShowZeros((v) => !v)}
                  className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full p-0 transition-colors duration-200 ${showZeros ? "bg-zinc-900" : "bg-zinc-300"}`}
                >
                  <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${showZeros ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              </label>
            </div>

            <div className="flex-1 overflow-auto p-6">
            <div className="w-fit mx-auto rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <table className="border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200">
                      Cor
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
                  </tr>
                </thead>
                <tbody>
                  {selected.map((product, productIdx) => {
                    const state = pivots.get(product.key);
                    const pivot = state && state !== "loading" && state !== "error" ? state : null;

                    return (
                      <Fragment key={product.key}>

                        {/* product group header */}
                        <tr className={`${productIdx > 0 ? "border-t-2 border-zinc-200" : ""} bg-zinc-50`}>
                          <td colSpan={colSpan} className="px-5 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-semibold text-zinc-800 leading-snug">
                                  {product.nome}
                                </span>
                                {pivot && (
                                  <span className="flex-none text-xs text-zinc-400 tabular-nums">
                                    {pivot.grandTotal} un.
                                  </span>
                                )}
                                {state === "loading" && (
                                  <Spinner className="h-3.5 w-3.5 text-zinc-400" />
                                )}
                              </div>
                              <button
                                onClick={() => toggleProduct(product)}
                                aria-label="Remover produto"
                                className="flex-none rounded-md p-1 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* loading */}
                        {state === "loading" && (
                          <tr>
                            <td colSpan={colSpan} className="py-10 text-center">
                              <Spinner className="h-5 w-5 text-zinc-300 mx-auto" />
                            </td>
                          </tr>
                        )}

                        {/* error */}
                        {state === "error" && (
                          <tr>
                            <td colSpan={colSpan} className="py-8 text-center text-xs text-zinc-400">
                              Erro ao carregar dados
                            </td>
                          </tr>
                        )}

                        {/* childless product (no variants) */}
                        {pivot?.isChildless && (
                          <tr className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                            <td className="px-5 py-2.5 text-xs text-zinc-400 italic border-r border-zinc-100">
                              {pivot.childlessCodigo ?? "sem variações"}
                            </td>
                            {allSizes.map((s) => (
                              <td key={s} className="px-3 py-2.5 text-center text-zinc-200 border-r border-zinc-100">·</td>
                            ))}
                            <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                              {pivot.grandTotal}
                            </td>
                          </tr>
                        )}

                        {/* color rows */}
                        {pivot && !pivot.isChildless && pivot.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                            <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                              {row.cor ?? (
                                <span className="text-zinc-400 italic text-xs">sem cor</span>
                              )}
                            </td>
                            {allSizes.map((s) => {
                              const val = row.cells[s]?.estoque ?? 0;
                              const cellKey = `${product.key}|||${row.cor ?? ""}|||${s}`;
                              const isStarred = starredCells.has(cellKey);
                              const annotation = cellAnnotations.get(cellKey);
                              const isAnnotating = annotatingCell === cellKey;
                              return (
                                <td
                                  key={s}
                                  className={`relative px-3 py-2.5 text-center tabular-nums border-r border-zinc-100 group${isStarred ? " bg-amber-50" : ""}`}
                                >
                                  {/* star button — top-left */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleStar(cellKey); }}
                                    title="Destacar"
                                    className={`absolute top-0.5 left-0.5 rounded transition-opacity ${isStarred ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                  >
                                    <svg className="h-3 w-3 text-amber-500" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                  </button>

                                  {/* annotation "+N" — top-right, visible when set and not editing */}
                                  {annotation !== undefined && !isAnnotating && (
                                    <span className="absolute top-0 right-0.5 text-[8px] font-bold leading-none text-amber-500 pointer-events-none">
                                      +{annotation}
                                    </span>
                                  )}

                                  {/* plus button — top-right, on hover (or always if annotation set) */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openAnnotation(cellKey, annotation); }}
                                    title="Anotar"
                                    className={`absolute top-0.5 right-0.5 rounded transition-opacity ${annotation !== undefined ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                  >
                                    <svg className="h-3 w-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
                                    </svg>
                                  </button>

                                  {/* annotation input overlay */}
                                  {isAnnotating && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
                                      <input
                                        ref={(el) => { if (el) { el.focus(); el.select(); } }}
                                        type="number"
                                        min="1"
                                        value={annotationInput}
                                        onChange={(e) => setAnnotationInput(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") { skipBlurRef.current = true; commitAnnotation(cellKey, annotationInput); }
                                          else if (e.key === "Escape") { skipBlurRef.current = true; setAnnotatingCell(null); }
                                        }}
                                        onBlur={() => {
                                          if (skipBlurRef.current) { skipBlurRef.current = false; return; }
                                          commitAnnotation(cellKey, annotationInput);
                                        }}
                                        className="w-10 py-0.5 text-center text-xs border border-amber-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-400"
                                      />
                                    </div>
                                  )}

                                  {/* value */}
                                  {!isAnnotating && (
                                    val === 0 ? (
                                      showZeros
                                        ? <span className="text-red-400">0</span>
                                        : <span className="opacity-30">·</span>
                                    ) : (
                                      <span className={stockClass(val)}>{val}</span>
                                    )
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                              {row.total}
                            </td>
                          </tr>
                        ))}

                        {/* per-product subtotal */}
                        {pivot && !pivot.isChildless && showSubtotals && (
                          <tr className="border-t border-zinc-200 bg-zinc-50/60">
                            <td className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 border-r border-zinc-100">
                              Subtotal
                            </td>
                            {allSizes.map((s) => (
                              <td key={s} className="px-3 py-2 text-center text-xs font-semibold text-zinc-500 tabular-nums border-r border-zinc-100">
                                {pivot.totals[s] ?? 0}
                              </td>
                            ))}
                            <td className="px-5 py-2 text-center text-sm font-bold text-zinc-900 tabular-nums">
                              {pivot.grandTotal}
                            </td>
                          </tr>
                        )}

                      </Fragment>
                    );
                  })}
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
