import { buildTransformed, TransformedItem } from "./transform";

// ── public types ───────────────────────────────────────────────────────────────

export interface ProductSummary {
  key: string;        // "p:123" for a parent group, "s:456" for a childless solo
  groupId: number;    // parentId for grouped, id for childless
  nome: string;
  variantCount: number;
  marca: string | null;
  totalEstoque: number;
}

export interface PivotCell {
  id: number;
  codigo: string | null;
  estoque: number;
}

export interface PivotRow {
  cor: string | null;
  cells: Record<string, PivotCell | null>;
  total: number;
}

export interface ProductPivot {
  key: string;
  groupId: number;
  nome: string;
  sizes: string[];
  hasColors: boolean;
  rows: PivotRow[];
  totals: Record<string, number>;
  grandTotal: number;
  isChildless: boolean;
  childlessCodigo?: string | null;
}

// ── size sorting ───────────────────────────────────────────────────────────────

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

// ── size normalization ─────────────────────────────────────────────────────────
//
// Multiple size standards in the wild (all mean the same physical size):
//   "36"  "36 BR"  "36BR"  "36 Br"
//   "25x34 USA/ 36 BR"  "25X34 USA/ 36 BR"  "25 Usa/ 36 Br"  "25USA/ 36BR"
//   "25USA36BR"  "25-36"  "25/36"
//
// Strategy: if a number is followed by "BR" (any case/spacing), use that number.
// Otherwise, for "N-M" or "N/M" patterns, use the second number (the BR size).
// Plain numbers and letter sizes pass through as-is.

export function normalizeSize(raw: string): string {
  const s = raw.trim();

  // Number immediately before "BR" keyword (e.g. "36 BR", "36BR", "36 Br")
  const brMatch = s.match(/(\d+)\s*BR/i);
  if (brMatch) return brMatch[1];

  // Dash- or slash-separated pair "US-BR" / "US/BR" (e.g. "25-36", "25/36")
  const pairMatch = s.match(/^\s*\d+\s*[-/]\s*(\d+)\s*$/);
  if (pairMatch) return pairMatch[1];

  // Plain integer
  const numMatch = s.match(/^\s*(\d+)\s*$/);
  if (numMatch) return numMatch[1];

  // Letter size or unknown format — uppercase and trim
  return s.toUpperCase();
}

// ── variacao_nome parsing ──────────────────────────────────────────────────────

function parseVariacao(vn: string | null): { cor: string | null; tamanho: string | null } {
  if (!vn) return { cor: null, tamanho: null };
  const parts = vn.split(";");
  let cor: string | null = null;
  let tamanho: string | null = null;
  for (const part of parts) {
    const m = part.match(/^(Cor|Tamanho):(.+)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "cor") cor = m[2].trim();
    else tamanho = normalizeSize(m[2].trim());
  }
  if (!cor && !tamanho) tamanho = normalizeSize(vn.trim());
  return { cor, tamanho };
}

// ── group key helpers ──────────────────────────────────────────────────────────

function itemKey(item: TransformedItem): string {
  return item.idProdutoPai != null ? `p:${item.idProdutoPai}` : `s:${item.id}`;
}

function itemGroupId(item: TransformedItem): number {
  return item.idProdutoPai ?? item.id;
}

// ── public API ─────────────────────────────────────────────────────────────────

export async function searchProducts(
  query: string,
  limit = 30
): Promise<ProductSummary[]> {
  const items = await buildTransformed();
  const q = query.trim().toLowerCase();

  type G = { key: string; groupId: number; nome: string; marca: string | null; count: number; totalEstoque: number };
  const groups = new Map<string, G>();

  for (const item of items) {
    const k = itemKey(item);
    if (!groups.has(k)) {
      groups.set(k, {
        key: k,
        groupId: itemGroupId(item),
        nome: item.nome,
        marca: item.marca,
        count: 0,
        totalEstoque: 0,
      });
    }
    const g = groups.get(k)!;
    g.count++;
    g.totalEstoque += item.estoque;
  }

  const sorted = [...groups.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );

  // Token search: every whitespace-separated query token must appear in the name
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const results: ProductSummary[] = [];
  for (const g of sorted) {
    if (tokens.length > 0) {
      const name = g.nome.toLowerCase();
      if (tokens.some((t) => !name.includes(t))) continue;
    }
    results.push({
      key: g.key,
      groupId: g.groupId,
      nome: g.nome,
      variantCount: g.count,
      marca: g.marca,
      totalEstoque: g.totalEstoque,
    });
    if (results.length >= limit) break;
  }
  return results;
}

export async function getProductPivot(gId: number): Promise<ProductPivot | null> {
  const items = await buildTransformed();

  const group = items.filter(
    (item) =>
      item.idProdutoPai === gId ||
      (item.idProdutoPai === null && item.id === gId)
  );

  if (group.length === 0) return null;

  const nome = group[0].nome;
  const key = group[0].idProdutoPai != null ? `p:${gId}` : `s:${gId}`;
  const isChildless = group.length === 1 && group[0].idProdutoPai === null;

  if (isChildless) {
    return {
      key,
      groupId: gId,
      nome,
      sizes: [],
      hasColors: false,
      rows: [],
      totals: {},
      grandTotal: group[0].estoque,
      isChildless: true,
      childlessCodigo: group[0].codigo,
    };
  }

  const parsed = group.map((item) => ({ ...item, ...parseVariacao(item.variacao_nome) }));

  const hasColors = parsed.some((p) => p.cor !== null);
  const allSizes = [...new Set(parsed.map((p) => p.tamanho).filter(Boolean) as string[])];
  const sizes = sortSizes(allSizes);

  const rowMap = new Map<string | null, PivotRow>();

  for (const item of parsed) {
    const cor = item.cor ?? null;
    if (!rowMap.has(cor)) {
      rowMap.set(cor, {
        cor,
        cells: Object.fromEntries(sizes.map((s) => [s, null])),
        total: 0,
      });
    }
    const row = rowMap.get(cor)!;
    if (item.tamanho) {
      row.cells[item.tamanho] = { id: item.id, codigo: item.codigo, estoque: item.estoque };
    }
    row.total += item.estoque;
  }

  const rows = [...rowMap.values()];
  const totals: Record<string, number> = {};
  for (const s of sizes) {
    totals[s] = rows.reduce((sum, r) => sum + (r.cells[s]?.estoque ?? 0), 0);
  }

  return {
    key,
    groupId: gId,
    nome,
    sizes,
    hasColors,
    rows,
    totals,
    grandTotal: rows.reduce((sum, r) => sum + r.total, 0),
    isChildless: false,
  };
}
