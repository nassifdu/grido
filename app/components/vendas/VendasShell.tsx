"use client";

import { Fragment, useState, useMemo } from "react";

// ── types ─────────────────────────────────────────────────────────────────────

interface VendasProductSummary {
  key: string;
  nome: string;
  totalVendido: number;
  valorTotal: number;
  colorCount: number;
  variantCount: number;
}

interface VendasPivotRow {
  cor: string | null;
  cells: Record<string, { qty: number; valor: number }>;
  total: number;
}

interface VendasPivot {
  sizes: string[];
  rows: VendasPivotRow[];
  totals: Record<string, number>;
  grandTotal: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

function soldClass(val: number): string {
  if (val >= 10) return "text-emerald-700 font-medium";
  return "text-zinc-700";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = formatDate(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = formatDate(y);
      return { from: ys, to: ys };
    }
    case "week": {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return { from: formatDate(start), to: today };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: formatDate(start), to: today };
    }
    case "lastmonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: formatDate(start), to: formatDate(end) };
    }
    case "30days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { from: formatDate(start), to: today };
    }
    default:
      return { from: today, to: today };
  }
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VendasShell() {
  const defaultFrom = formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const defaultTo = formatDate(new Date());

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ message: string; current: number; total: number }>({
    message: "",
    current: 0,
    total: 0,
  });
  const [products, setProducts] = useState<VendasProductSummary[]>([]);
  const [pivots, setPivots] = useState<Record<string, VendasPivot>>({});
  const [selected, setSelected] = useState<VendasProductSummary[]>([]);
  const [showSubtotals, setShowSubtotals] = useState(true);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    setProgress({ message: "Iniciando…", current: 0, total: 0 });
    setSelected([]);
    setProducts([]);
    setPivots({});
    setSearched(true);

    try {
      const response = await fetch(`/api/vendas?from=${from}&to=${to}`);
      if (!response.body) throw new Error("Sem resposta do servidor");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (payload.type) {
            case "status":
              setProgress((p) => ({ ...p, message: payload.message as string }));
              break;
            case "progress":
              setProgress({
                message: payload.message as string,
                current: payload.current as number,
                total: payload.total as number,
              });
              break;
            case "done":
              setProducts((payload.products as VendasProductSummary[]) ?? []);
              setPivots((payload.pivots as Record<string, VendasPivot>) ?? {});
              setLoading(false);
              break;
            case "error":
              throw new Error(payload.message as string);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
      setLoading(false);
    }
  }

  function applyPreset(preset: string) {
    const { from: f, to: t } = getPreset(preset);
    setFrom(f);
    setTo(t);
  }

  function toggleProduct(product: VendasProductSummary) {
    setSelected((prev) => {
      const idx = prev.findIndex((p) => p.key === product.key);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, product];
    });
  }

  const allSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    for (const p of selected) {
      const pivot = pivots[p.key];
      if (pivot) pivot.sizes.forEach((s) => sizeSet.add(s));
    }
    return sortSizes([...sizeSet]);
  }, [selected, pivots]);

  const colSpan = allSizes.length + 2;

  const globalTotals = useMemo(() => {
    const bySize: Record<string, number> = {};
    let grand = 0;
    for (const p of selected) {
      const pivot = pivots[p.key];
      if (!pivot) continue;
      grand += pivot.grandTotal;
      for (const s of allSizes) {
        bySize[s] = (bySize[s] ?? 0) + (pivot.totals[s] ?? 0);
      }
    }
    return { bySize, grand };
  }, [selected, pivots, allSizes]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="shrink-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur px-6 py-3.5">
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-5 min-w-0">
            <span className="text-base font-bold tracking-tight text-zinc-900 shrink-0">Grido</span>
            <nav className="flex items-center gap-1 text-sm">
              <a href="/dashboard" className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors">
                Dashboard
              </a>
              <a href="/dashboard/catalog" className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors">
                Estoque
              </a>
              <a href="/dashboard/inconsistencies" className="rounded-md px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors">
                Inconsistências
              </a>
              <span className="rounded-md px-2.5 py-1.5 font-medium text-zinc-900 bg-zinc-100">
                Vendas
              </span>
            </nav>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 flex flex-col border-r border-zinc-200 bg-white overflow-hidden">

          {/* Date range section */}
          <div className="shrink-0 px-3 pt-3 pb-3 border-b border-zinc-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">Período</p>

            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1 mb-3">
              {[
                { id: "today",     label: "Hoje" },
                { id: "yesterday", label: "Ontem" },
                { id: "week",      label: "Semana" },
                { id: "month",     label: "Mês" },
                { id: "lastmonth", label: "Mês ant." },
                { id: "30days",    label: "30 dias" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => applyPreset(id)}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[11px] text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date inputs */}
            <div className="flex flex-col gap-1.5 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 w-6 shrink-0 text-right">De</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 w-6 shrink-0 text-right">Até</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-800 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 transition-all"
                />
              </div>
            </div>

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={loading || !from || !to}
              className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner className="h-3.5 w-3.5 text-white/60" />
                  Buscando…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path strokeLinecap="round" d="M16.5 16.5L21 21" />
                  </svg>
                  Buscar vendas
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          {loading && (
            <div className="shrink-0 px-3 pt-3 pb-2">
              <p className="text-xs text-zinc-500 mb-1.5 truncate">{progress.message}</p>
              <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                {progress.total > 0 ? (
                  <div
                    className="bg-zinc-700 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                ) : (
                  <div className="h-1.5 rounded-full bg-zinc-300 animate-pulse w-full" />
                )}
              </div>
              {progress.total > 0 && (
                <p className="text-[10px] text-zinc-400 mt-1 tabular-nums text-right">
                  {progress.current}/{progress.total}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mx-3 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 shrink-0">
              {error}
            </div>
          )}

          {/* Product list */}
          <div className="flex-1 overflow-y-auto">
            {!searched && !loading && (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
                <svg className="mb-3 h-8 w-8 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
                <p className="text-xs text-zinc-400">Selecione um período e busque</p>
              </div>
            )}

            {searched && !loading && !error && products.length === 0 && (
              <p className="py-10 text-center text-xs text-zinc-400">
                Nenhuma venda encontrada no período
              </p>
            )}

            {!loading && products.length > 0 && (
              <ul className="divide-y divide-zinc-50 py-1">
                {products.map((p) => {
                  const isSelected = selected.some((s) => s.key === p.key);
                  return (
                    <li key={p.key}>
                      <button
                        onClick={() => toggleProduct(p)}
                        className={`w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors group ${
                          isSelected ? "bg-zinc-50" : "hover:bg-zinc-50/80"
                        }`}
                      >
                        <span className={`mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          isSelected ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 group-hover:border-zinc-400"
                        }`}>
                          {isSelected && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 leading-snug break-words whitespace-normal">
                            {p.nome}
                          </p>
                          <p className="text-xs mt-0.5 tabular-nums">
                            <span className="text-emerald-600 font-medium">{p.totalVendido} un.</span>
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

          {/* Sidebar footer */}
          {(selected.length > 0 || products.length > 0) && (
            <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50 flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                {selected.length === 0
                  ? `${products.length} produto${products.length !== 1 ? "s" : ""}`
                  : selected.length === 1
                  ? "1 selecionado"
                  : `${selected.length} selecionados`}
              </p>
              {products.length > 0 && products.some((p) => !selected.some((s) => s.key === p.key)) && (
                <button
                  onClick={() => setSelected([...products])}
                  className="shrink-0 rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Tudo
                </button>
              )}
            </div>
          )}
        </aside>

        {/* ── Main — pivot table ─────────────────────────────────────────── */}
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
              {/* Controls bar */}
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

                {/* Subtotals toggle */}
                <div className="flex items-center rounded-lg bg-zinc-100 p-0.5">
                  <button
                    onClick={() => setShowSubtotals((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showSubtotals ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 5H6l6 7-6 7h12" />
                    </svg>
                    Subtotais
                  </button>
                </div>

                {/* Clear */}
                <button
                  onClick={() => setSelected([])}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Limpar
                </button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto p-6">
                <div className="w-fit mx-auto rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                  <table className="border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200">
                          {viewMode === "flat" ? "Variação" : "Cor"}
                        </th>
                        {allSizes.map((s) => (
                          <th key={s} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200">
                            {s}
                          </th>
                        ))}
                        <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewMode === "grouped"
                        ? selected.map((product, productIdx) => {
                            const pivot = pivots[product.key];
                            return (
                              <Fragment key={product.key}>

                                {/* Product group header */}
                                <tr className={`${productIdx > 0 ? "border-t-2 border-zinc-200" : ""} bg-zinc-50`}>
                                  <td colSpan={colSpan} className="px-5 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-semibold text-zinc-800 leading-snug">{product.nome}</span>
                                        {pivot && (
                                          <span className="flex-none text-xs text-zinc-400 tabular-nums">
                                            {pivot.grandTotal} un. vendidos
                                          </span>
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

                                {pivot?.rows.map((row, rowIdx) => (
                                  <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                    <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                      {row.cor ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                    </td>
                                    {allSizes.map((s) => {
                                      const qty = row.cells[s]?.qty ?? 0;
                                      return (
                                        <td key={s} className="px-3 py-2.5 text-center tabular-nums border-r border-zinc-100">
                                          {qty === 0
                                            ? <span className="text-zinc-200">·</span>
                                            : <span className={soldClass(qty)}>{qty}</span>
                                          }
                                        </td>
                                      );
                                    })}
                                    <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                                      {row.total}
                                    </td>
                                  </tr>
                                ))}

                                {pivot && showSubtotals && pivot.rows.length > 1 && (
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
                          })
                        : selected.map((product) => {
                            const pivot = pivots[product.key];
                            return pivot?.rows.map((row, rowIdx) => (
                              <tr key={`${product.key}-${rowIdx}`} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                <td className="px-3 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                  <div className="flex items-center gap-2">
                                    {rowIdx === 0 && (
                                      <button
                                        onClick={() => toggleProduct(product)}
                                        aria-label="Remover produto"
                                        className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    )}
                                    {rowIdx > 0 && <span className="w-4 shrink-0" />}
                                    {row.cor ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                  </div>
                                </td>
                                {allSizes.map((s) => {
                                  const qty = row.cells[s]?.qty ?? 0;
                                  return (
                                    <td key={s} className="px-3 py-2.5 text-center tabular-nums border-r border-zinc-100">
                                      {qty === 0
                                        ? <span className="text-zinc-200">·</span>
                                        : <span className={soldClass(qty)}>{qty}</span>
                                      }
                                    </td>
                                  );
                                })}
                                <td className="px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums">
                                  {row.total}
                                </td>
                              </tr>
                            )) ?? null;
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
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>

      </div>
    </div>
  );
}
