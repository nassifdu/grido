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
  const [selected, setSelected] = useState<ProductSummary[]>([]);
  const [pivots, setPivots] = useState<Map<string, PivotState>>(new Map());
  const [isSearching, setIsSearching] = useState(false);

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
      <main className="flex-1 overflow-auto bg-zinc-50">
        {selected.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full select-none">
            <svg className="mb-4 h-12 w-12 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
            </svg>
            <p className="text-sm text-zinc-400">Selecione produtos na barra lateral</p>
          </div>
        ) : (
          <div className="p-6">
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap w-px border-r border-zinc-200">
                      Cor
                    </th>
                    {allSizes.map((s) => (
                      <th
                        key={s}
                        className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap min-w-[2rem] border-r border-zinc-200"
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
                            <td className="px-5 py-2.5 text-xs text-zinc-400 italic w-px border-r border-zinc-100">
                              {pivot.childlessCodigo ?? "sem variações"}
                            </td>
                            {allSizes.map((s) => (
                              <td key={s} className="px-2 py-2.5 text-center text-zinc-200 border-r border-zinc-100">·</td>
                            ))}
                            <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                              {pivot.grandTotal}
                            </td>
                          </tr>
                        )}

                        {/* color rows */}
                        {pivot && !pivot.isChildless && pivot.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                            <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap w-px border-r border-zinc-100">
                              {row.cor ?? (
                                <span className="text-zinc-400 italic text-xs">sem cor</span>
                              )}
                            </td>
                            {allSizes.map((s) => {
                              const val = row.cells[s]?.estoque ?? 0;
                              return (
                                <td key={s} className="px-2 py-2.5 text-center tabular-nums border-r border-zinc-100">
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

                        {/* per-product subtotal */}
                        {pivot && !pivot.isChildless && (
                          <tr className="border-t border-zinc-200 bg-zinc-50/60">
                            <td className="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 w-px border-r border-zinc-100">
                              Total
                            </td>
                            {allSizes.map((s) => (
                              <td key={s} className="px-2 py-2 text-center text-xs font-semibold text-zinc-500 tabular-nums border-r border-zinc-100">
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
          </div>
        )}
      </main>

    </div>
  );
}
