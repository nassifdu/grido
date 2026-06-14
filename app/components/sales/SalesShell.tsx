"use client";

import { Fragment, useState, useMemo, useRef } from "react";

// ── types ──────────────────────────────────────────────────────────────────────

interface SalesProductSummary {
  key: string;
  name: string;
  totalSold: number;
  totalValor: number;
  colorCount: number;
  variantCount: number;
}

interface SalesPivotRow {
  color: string | null;
  cells: Record<string, number>;
  total: number;
  totalValor: number;
}

interface SalesPivot {
  sizes: string[];
  rows: SalesPivotRow[];
  totals: Record<string, number>;
  grandTotal: number;
  grandValor: number;
}

// ── size ordering ──────────────────────────────────────────────────────────────

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

// ── variation name normalization (mirrored from lib/transform.ts) ──────────────

function isCorrectVariation(s: string): boolean {
  return (
    /^Cor:[^;]+;Tamanho:[^;]+$/.test(s) ||
    /^Tamanho:[^;]+;Cor:[^;]+$/.test(s)
  );
}

function hasBothDimensions(s: string): boolean {
  const l = s.toLowerCase();
  return l.includes("cor") && l.includes("tamanho");
}

function fixVariationName(s: string): string {
  s = s.replace(/\s*;\s*/g, ";");
  s = s.replace(/^Cor;([^;]+);/, "Cor:$1;");
  s = s.replace(/((?:Cor|Tamanho):[^;:]+):(?=(?:[Cc]or|[Tt]amanho):)/, "$1;");
  s = s.replace(/([^;])([Tt]amanho:)/, "$1;$2");
  s = s.replace(/(?:^|(?<=[^A-Za-z]))[Tt]amanho\s+([^:;\s])/g, "Tamanho:$1");
  s = s.replace(/(?<![A-Za-z])[Tt]amanho([^:;\s])/g, "Tamanho:$1");
  s = s.replace(/([Tt]amanho:)(\d+)\s+(\d+)/g, "$1$2$3");
  s = s.replace(/(?<![A-Za-z])tamanho:/g, "Tamanho:");
  s = s.replace(/(?<![A-Za-z])cor:/g, "Cor:");
  return s;
}

function normalizeVariation(vn: string | null | undefined): string | null {
  if (vn == null) return null;
  const s = String(vn).trim();
  if (!s) return null;
  if (!hasBothDimensions(s) || isCorrectVariation(s)) return s;
  return fixVariationName(s);
}

function extractVariationFromName(name: string): string | null {
  const m = name.match(/\s+((?:(?:Cor|Tamanho):[^;]+)(?:;(?:Cor|Tamanho):[^;]+)*)$/i);
  if (!m) return null;
  return normalizeVariation(m[1]);
}

function normalizeSize(raw: string): string {
  const s = raw.trim();
  const brMatch = s.match(/(\d+)\s*BR/i);
  if (brMatch) return brMatch[1];
  const pairMatch = s.match(/^\s*\d+\s*[-/]\s*(\d+)\s*$/);
  if (pairMatch) return pairMatch[1];
  const numMatch = s.match(/^\s*(\d+)\s*$/);
  if (numMatch) return numMatch[1];
  return s.toUpperCase();
}

function parseVariationName(vn: string | null): { color: string | null; size: string | null } {
  if (!vn) return { color: null, size: null };
  const parts = vn.split(";");
  let color: string | null = null;
  let size: string | null = null;
  for (const part of parts) {
    const m = part.match(/^(Cor|Tamanho):(.+)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "cor") color = m[2].trim();
    else size = normalizeSize(m[2].trim());
  }
  if (!color && !size) size = normalizeSize(vn.trim());
  return { color, size };
}

function soldClass(val: number): string {
  if (val >= 10) return "text-emerald-700 font-medium";
  return "text-zinc-700";
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── CSV parser ─────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ';') i++;
    } else {
      const end = line.indexOf(';', i);
      if (end < 0) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseBRL(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function processCSV(text: string): { products: SalesProductSummary[]; pivots: Record<string, SalesPivot> } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  type GroupAcc = {
    name: string;
    colorMap: Map<string | null, Map<string, number>>;
    valorByColor: Map<string | null, number>;
    totalSold: number;
    totalValor: number;
  };

  const groups = new Map<string, GroupAcc>();

  for (const line of lines.slice(1, -1)) {
    const fields = parseCSVLine(line);
    if (fields.length < 4) continue;

    const rawProduct = fields[0].trim();
    const qty = Math.round(parseFloat((fields[3] ?? "0").replace(',', '.')));
    if (qty <= 0 || !rawProduct) continue;

    const valor = parseBRL(fields[5] ?? "0");

    const variationName = extractVariationFromName(rawProduct);
    const { color, size } = parseVariationName(variationName);

    const varSuffixMatch = rawProduct.match(/\s+(?:(?:Cor|Tamanho):[^;]+)(?:;(?:Cor|Tamanho):[^;]+)*$/i);
    const baseName = varSuffixMatch
      ? rawProduct.slice(0, rawProduct.length - varSuffixMatch[0].length).trim()
      : rawProduct;

    if (!baseName) continue;

    if (!groups.has(baseName)) {
      groups.set(baseName, { name: baseName, colorMap: new Map(), valorByColor: new Map(), totalSold: 0, totalValor: 0 });
    }

    const group = groups.get(baseName)!;
    group.totalSold += qty;
    group.totalValor += valor;

    const sizeKey = size ?? "único";
    const colorKey = color ?? null;

    if (!group.colorMap.has(colorKey)) group.colorMap.set(colorKey, new Map());
    const sizeMap = group.colorMap.get(colorKey)!;
    sizeMap.set(sizeKey, (sizeMap.get(sizeKey) ?? 0) + qty);

    group.valorByColor.set(colorKey, (group.valorByColor.get(colorKey) ?? 0) + valor);
  }

  const products: SalesProductSummary[] = [];
  const pivots: Record<string, SalesPivot> = {};

  for (const [key, group] of groups.entries()) {
    const sizesSet = new Set<string>();
    for (const sizeMap of group.colorMap.values()) {
      for (const s of sizeMap.keys()) sizesSet.add(s);
    }
    const sizes = sortSizes([...sizesSet]);

    const rows: SalesPivotRow[] = [];
    for (const [color, sizeMap] of group.colorMap.entries()) {
      const cells: Record<string, number> = {};
      let rowTotal = 0;
      for (const [s, qty] of sizeMap.entries()) {
        cells[s] = qty;
        rowTotal += qty;
      }
      const totalValor = group.valorByColor.get(color) ?? 0;
      rows.push({ color, cells, total: rowTotal, totalValor });
    }

    const totals: Record<string, number> = {};
    for (const s of sizes) {
      totals[s] = rows.reduce((sum, r) => sum + (r.cells[s] ?? 0), 0);
    }

    const colorCount = [...group.colorMap.keys()].filter((c) => c !== null).length;
    const variantCount = [...group.colorMap.values()].reduce((sum, m) => sum + m.size, 0);

    products.push({ key, name: group.name, totalSold: group.totalSold, totalValor: group.totalValor, colorCount, variantCount });
    pivots[key] = { sizes, rows, totals, grandTotal: group.totalSold, grandValor: group.totalValor };
  }

  products.sort((a, b) => b.totalSold - a.totalSold);
  return { products, pivots };
}

// ── component ──────────────────────────────────────────────────────────────────

export default function SalesShell() {
  const [products, setProducts] = useState<SalesProductSummary[]>([]);
  const [pivots, setPivots] = useState<Record<string, SalesPivot>>({});
  const [selected, setSelected] = useState<SalesProductSummary[]>([]);
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [showZeros, setShowZeros] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { products: p, pivots: pv } = processCSV(e.target?.result as string);
        setProducts(p);
        setPivots(pv);
        setSelected([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar arquivo");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function toggleProduct(product: SalesProductSummary) {
    setSelected((prev) => {
      const idx = prev.findIndex((p) => p.key === product.key);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, product];
    });
  }

  const allSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    for (const p of selected) {
      pivots[p.key]?.sizes.forEach((s) => sizeSet.add(s));
    }
    return sortSizes([...sizeSet]);
  }, [selected, pivots]);

  const colSpan = allSizes.length + 2 + (showPrice ? 1 : 0);

  const globalTotals = useMemo(() => {
    const bySize: Record<string, number> = {};
    let grand = 0;
    let grandValor = 0;
    for (const p of selected) {
      const pivot = pivots[p.key];
      if (!pivot) continue;
      grand += pivot.grandTotal;
      grandValor += pivot.grandValor;
      for (const s of allSizes) {
        bySize[s] = (bySize[s] ?? 0) + (pivot.totals[s] ?? 0);
      }
    }
    return { bySize, grand, grandValor };
  }, [selected, pivots, allSizes]);

  function renderDataCell(s: string, row: SalesPivotRow) {
    const qty = row.cells[s] ?? 0;
    if (qty === 0) {
      return showZeros
        ? <span className="text-zinc-200">·</span>
        : null;
    }
    return <span className={soldClass(qty)}>{qty}</span>;
  }

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

          {/* Upload area */}
          <div className="shrink-0 px-3 pt-3 pb-3 border-b border-zinc-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">Relatório CSV</p>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-white transition-colors px-4 py-5 text-center"
            >
              <svg className="mx-auto mb-2 h-6 w-6 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {fileName ? (
                <p className="text-xs text-zinc-600 font-medium truncate px-1">{fileName}</p>
              ) : (
                <>
                  <p className="text-xs text-zinc-500">Arraste ou clique para selecionar</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">arquivo .csv do Bling</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 shrink-0">
              {error}
            </div>
          )}

          {/* Product list */}
          <div className="flex-1 overflow-y-auto">
            {products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center select-none">
                <svg className="mb-3 h-8 w-8 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
                <p className="text-xs text-zinc-400">Carregue um relatório para começar</p>
              </div>
            ) : (
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
                            {p.name}
                          </p>
                          <p className="text-xs mt-0.5 tabular-nums">
                            <span className="text-emerald-600 font-medium">{p.totalSold} un.</span>
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
          {products.length > 0 && (
            <div className="shrink-0 border-t border-zinc-100 px-3 py-2 bg-zinc-50 flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                {selected.length === 0
                  ? `${products.length} produto${products.length !== 1 ? "s" : ""}`
                  : selected.length === 1
                  ? "1 selecionado"
                  : `${selected.length} selecionados`}
              </p>
              {products.some((p) => !selected.some((s) => s.key === p.key)) && (
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

                {/* Option toggles: Zeros | Preço */}
                <div className="flex items-center rounded-lg bg-zinc-100 p-0.5 gap-0.5">
                  <button
                    onClick={() => setShowZeros((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showZeros ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="3" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h1m16 0h1M12 3v1m0 16v1" />
                    </svg>
                    Zeros
                  </button>
                  <button
                    onClick={() => setShowPrice((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${showPrice ? "bg-white shadow-sm text-zinc-700" : "text-zinc-500 hover:bg-zinc-200/70"}`}
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
                    </svg>
                    Preço
                  </button>
                </div>

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
                          Cor
                        </th>
                        {allSizes.map((s) => (
                          <th key={s} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap border-r border-zinc-200">
                            {s}
                          </th>
                        ))}
                        <th className={`px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap ${showPrice ? "border-r border-zinc-200" : ""}`}>
                          Total
                        </th>
                        {showPrice && (
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                            Valor
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {viewMode === "grouped" ? (
                        selected.map((product, productIdx) => {
                          const pivot = pivots[product.key];
                          return (
                            <Fragment key={product.key}>
                              {/* Product group header */}
                              <tr className={`${productIdx > 0 ? "border-t-2 border-zinc-200" : ""} bg-zinc-50`}>
                                <td colSpan={colSpan} className="px-5 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="font-semibold text-zinc-800 leading-snug">{product.name}</span>
                                      {pivot && (
                                        <span className="flex-none text-xs text-zinc-400 tabular-nums">
                                          {pivot.grandTotal} un. vendidos
                                          {showPrice && ` · R$ ${fmtBRL(pivot.grandValor)}`}
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

                              {/* Color rows */}
                              {pivot?.rows.map((row, rowIdx) => (
                                <tr key={rowIdx} className="hover:bg-zinc-50/70 transition-colors border-b border-zinc-100">
                                  <td className="px-5 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                    {row.color ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                  </td>
                                  {allSizes.map((s) => (
                                    <td key={s} className="px-3 py-2.5 text-center tabular-nums border-r border-zinc-100">
                                      {renderDataCell(s, row)}
                                    </td>
                                  ))}
                                  <td className={`px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums ${showPrice ? "border-r border-zinc-100" : ""}`}>
                                    {row.total}
                                  </td>
                                  {showPrice && (
                                    <td className="px-5 py-2.5 text-right text-zinc-600 tabular-nums text-xs">
                                      {fmtBRL(row.totalValor)}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })
                      ) : (
                        // Flat view
                        selected.map((product, productIdx) => {
                          const pivot = pivots[product.key];
                          return pivot?.rows.map((row, rowIdx) => (
                            <tr
                              key={`${product.key}-${rowIdx}`}
                              className={`hover:bg-zinc-50/70 transition-colors border-b border-zinc-100 ${productIdx > 0 && rowIdx === 0 ? "border-t-2 border-zinc-200" : ""}`}
                            >
                              <td className="px-3 py-2.5 text-sm text-zinc-700 whitespace-nowrap border-r border-zinc-100">
                                <div className="flex items-center gap-2">
                                  {rowIdx === 0 && (
                                    <button
                                      onClick={() => toggleProduct(product)}
                                      aria-label="Remover produto"
                                      className="flex-none rounded-md p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  )}
                                  {rowIdx > 0 && <span className="w-4 shrink-0" />}
                                  {row.color ?? <span className="text-zinc-400 italic text-xs">sem cor</span>}
                                </div>
                              </td>
                              {allSizes.map((s) => (
                                <td key={s} className="px-3 py-2.5 text-center tabular-nums border-r border-zinc-100">
                                  {renderDataCell(s, row)}
                                </td>
                              ))}
                              <td className={`px-5 py-2.5 text-center font-semibold text-zinc-800 tabular-nums ${showPrice ? "border-r border-zinc-100" : ""}`}>
                                {row.total}
                              </td>
                              {showPrice && (
                                <td className="px-5 py-2.5 text-right text-zinc-600 tabular-nums text-xs">
                                  {fmtBRL(row.totalValor)}
                                </td>
                              )}
                            </tr>
                          ));
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 bg-zinc-100">
                        <td className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap border-r border-zinc-100">
                          Total
                        </td>
                        {allSizes.map((s) => (
                          <td key={s} className="px-3 py-3 text-center text-xs font-bold text-zinc-700 tabular-nums border-r border-zinc-100">
                            {globalTotals.bySize[s] ?? 0}
                          </td>
                        ))}
                        <td className={`px-5 py-3 text-center text-sm font-black text-zinc-900 tabular-nums ${showPrice ? "border-r border-zinc-100" : ""}`}>
                          {globalTotals.grand}
                        </td>
                        {showPrice && (
                          <td className="px-5 py-3 text-right text-sm font-bold text-zinc-700 tabular-nums">
                            {fmtBRL(globalTotals.grandValor)}
                          </td>
                        )}
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
