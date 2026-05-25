"use client";

import { Fragment, useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ProductSummary, ProductPivot } from "@/lib/catalog";

type PivotState = ProductPivot | "loading" | "error";

// Mirror of lib/catalog.ts sortSizes — keeps client bundle self-contained
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
  if (val <= 2) return "text-amber-500 font-semibold";
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
  const [added, setAdded] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [showDrop, setShowDrop] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // cor col + sizes + total
  const colSpan = allSizes.length + 2;

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
    setSyncError(null);
    try {
      const res = await fetch(`/api/catalog?q=${encodeURIComponent(q)}&limit=25`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 503) setSyncError(json.error);
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
      toggleProduct(results[activeIdx]);
    } else if (e.key === "Escape") {
      setShowDrop(false);
    }
  };

  const toggleProduct = async (product: ProductSummary) => {
    if (added.some((p) => p.key === product.key)) {
      removeProduct(product.key);
      return;
    }
    setAdded((prev) => [...prev, product]);
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

  const removeProduct = (key: string) => {
    setAdded((prev) => prev.filter((p) => p.key !== key));
    setPivots((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* ── Search bar ── */}
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
            placeholder="Buscar produto para adicionar à grade…"
            className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-10 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
          />
          {isSearching && (
            <Spinner className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-300" />
          )}
        </div>

        {syncError && (
          <p className="mt-2 text-xs text-amber-600 px-1">{syncError}</p>
        )}

        {/* Dropdown */}
        {showDrop && results.length > 0 && (
          <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/60">
            <ul className="max-h-80 overflow-y-auto divide-y divide-zinc-50 py-1">
              {results.map((p, idx) => {
                const isAdded = added.some((w) => w.key === p.key);
                const active = idx === activeIdx;
                return (
                  <li key={p.key}>
                    <button
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => toggleProduct(p)}
                      className={`w-full px-4 py-3 text-left flex items-start justify-between gap-4 transition-colors cursor-pointer ${
                        active ? "bg-zinc-50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Checkbox indicator */}
                        <div className={`mt-0.5 flex-none h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                          isAdded ? "bg-zinc-900 border-zinc-900" : "border-zinc-300 bg-white"
                        }`}>
                          {isAdded && (
                            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1.5 6L4.5 9L10.5 3" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          {/* Allow wrapping so long names are fully readable */}
                          <p className="text-sm font-medium text-zinc-900 leading-snug break-words whitespace-normal">
                            {p.nome}
                          </p>
                          {p.marca && (
                            <p className="text-xs text-zinc-400 mt-0.5">{p.marca}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex-none text-right space-y-0.5 mt-0.5">
                        <p className="text-xs text-zinc-400">
                          {p.variantCount === 1 ? "1 var." : `${p.variantCount} var.`}
                        </p>
                        <p className="text-xs font-semibold text-zinc-600 tabular-nums">
                          {p.totalEstoque} un.
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {added.length === 0 && (
        <div className="flex flex-col items-center justify-center py-28 text-zinc-300 select-none">
          <svg className="mb-4 h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
          </svg>
          <p className="text-sm text-zinc-400 font-medium">Grade analítica de estoque</p>
          <p className="text-xs text-zinc-300 mt-1">Busque produtos para adicionar à grade</p>
        </div>
      )}

      {/* ── Unified table ── */}
      {added.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">
                  Cor
                </th>
                {allSizes.map((s) => (
                  <th
                    key={s}
                    className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap min-w-[3.5rem]"
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
              {added.map((product, productIdx) => {
                const state = pivots.get(product.key);
                const pivot = state && state !== "loading" && state !== "error" ? state : null;

                return (
                  <Fragment key={product.key}>
                    {/* ── Product group header ── */}
                    <tr className={`${productIdx > 0 ? "border-t-2 border-zinc-200" : ""} bg-zinc-50`}>
                      <td colSpan={colSpan} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-semibold text-zinc-800 leading-snug break-words">
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
                            onClick={() => removeProduct(product.key)}
                            aria-label="Remover produto"
                            className="flex-none rounded-md p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Loading */}
                    {state === "loading" && (
                      <tr>
                        <td colSpan={colSpan} className="py-10 text-center">
                          <Spinner className="h-5 w-5 text-zinc-300 mx-auto" />
                        </td>
                      </tr>
                    )}

                    {/* Error */}
                    {state === "error" && (
                      <tr>
                        <td colSpan={colSpan} className="py-8 text-center text-xs text-zinc-400">
                          Erro ao carregar dados
                        </td>
                      </tr>
                    )}

                    {/* Childless (no variants) */}
                    {pivot?.isChildless && (
                      <tr className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-5 py-2.5 text-xs text-zinc-400 italic">
                          {pivot.childlessCodigo ?? "sem variações"}
                        </td>
                        {allSizes.map((s) => (
                          <td key={s} className="px-3 py-2.5 text-center text-zinc-200">·</td>
                        ))}
                        <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                          {pivot.grandTotal}
                        </td>
                      </tr>
                    )}

                    {/* Color rows */}
                    {pivot && !pivot.isChildless && pivot.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap">
                          {row.cor ?? (
                            <span className="text-zinc-400 italic text-xs">sem cor</span>
                          )}
                        </td>
                        {allSizes.map((s) => {
                          const val = row.cells[s]?.estoque ?? 0;
                          return (
                            <td key={s} className="px-3 py-2.5 text-center tabular-nums">
                              <span className={stockClass(val)}>
                                {val === 0 ? <span className="opacity-30">·</span> : val}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                          {row.total}
                        </td>
                      </tr>
                    ))}

                    {/* Product subtotal */}
                    {pivot && !pivot.isChildless && (
                      <tr className="border-t border-zinc-100 bg-zinc-50/60">
                        <td className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Total
                        </td>
                        {allSizes.map((s) => (
                          <td key={s} className="px-3 py-2 text-center text-xs font-semibold text-zinc-500 tabular-nums">
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
          </table>
        </div>
      )}
    </div>
  );
}
