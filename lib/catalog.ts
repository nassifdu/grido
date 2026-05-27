import { buildTransformed, TransformedItem } from "./transform";
import { getSupabase } from "./supabase";

// ── public types ───────────────────────────────────────────────────────────────

export interface ProductSummary {
  key: string;        // "p:123" for a parent group, "s:456" for a childless solo
  groupId: number;    // parentId for grouped, id for childless
  nome: string;
  variantCount: number;
  colorCount: number;
  marca: string | null;
  totalEstoque: number;
}

export interface PivotCell {
  id: number;
  codigo: string | null;
  estoque: number;
  preco: number | null;
}

export interface PivotRow {
  cor: string | null;
  cells: Record<string, PivotCell | null>;
  total: number;
  rowPrice: number | null;
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
  childlessPreco?: number | null;
  parentCodigo: string | null;
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
// Multiple size standards all mean the same physical size, e.g.:
//   "36"  "36 BR"  "36BR"  "36 Br"
//   "25x34 USA/ 36 BR"  "25X34 USA/ 36 BR"  "25 Usa/ 36 Br"
//   "25USA/ 36BR"  "25USA36BR"  "25-36"  "25/36"
//
// Strategy: extract the number before "BR" if present; otherwise for "N-M" /
// "N/M" pairs take the second number (the BR side); plain numbers pass through;
// letter sizes (PP, M, GG…) come back uppercased.

export function normalizeSize(raw: string): string {
  const s = raw.trim();

  // Number followed by "BR" keyword (any case / surrounding whitespace)
  const brMatch = s.match(/(\d+)\s*BR/i);
  if (brMatch) return brMatch[1];

  // Dash- or slash-separated pair like "25-36" or "25/36" → take second number
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
  limit = 30,
  corFilter = "",
  tamanhoFilter = ""
): Promise<ProductSummary[]> {
  const items = await buildTransformed();
  const q = query.trim().toLowerCase();
  const cf = corFilter.trim().toLowerCase();
  const tf = tamanhoFilter.trim().toLowerCase();

  type G = { key: string; groupId: number; nome: string; marca: string | null; count: number; totalEstoque: number; colors: Set<string>; tamanhos: Set<string> };
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
        colors: new Set(),
        tamanhos: new Set(),
      });
    }
    const g = groups.get(k)!;
    g.count++;
    g.totalEstoque += item.estoque;
    const { cor, tamanho } = parseVariacao(item.variacao_nome);
    if (cor) g.colors.add(cor.toLowerCase());
    if (tamanho) g.tamanhos.add(tamanho.toLowerCase());
  }

  const sorted = [...groups.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );

  // Token search: every whitespace-separated token must appear in the name
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const results: ProductSummary[] = [];
  for (const g of sorted) {
    const name = g.nome.toLowerCase();

    if (tokens.length > 0 && tokens.some((t) => !name.includes(t))) continue;

    // Cor filter: name includes cf OR any variation cor includes cf
    if (cf && !name.includes(cf) && ![...g.colors].some((c) => c.includes(cf))) continue;

    // Tamanho filter: name includes tf OR any variation tamanho includes tf
    if (tf && !name.includes(tf) && ![...g.tamanhos].some((t) => t.includes(tf))) continue;

    results.push({
      key: g.key,
      groupId: g.groupId,
      nome: g.nome,
      variantCount: g.count,
      colorCount: g.colors.size,
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

  // Fetch parent product's codigo from bling_produtos (cached via buildTransformed is server-only)
  const { data: parentRow } = await getSupabase()
    .from("bling_produtos")
    .select("data")
    .eq("id", gId)
    .maybeSingle();
  const rawParentData = parentRow?.data as Record<string, unknown> | null;
  const parentCodigo: string | null =
    typeof rawParentData?.codigo === "string" ? rawParentData.codigo : null;

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
      childlessPreco: group[0].preco ?? null,
      parentCodigo,
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
        rowPrice: null,
      });
    }
    const row = rowMap.get(cor)!;
    if (item.tamanho) {
      row.cells[item.tamanho] = { id: item.id, codigo: item.codigo, estoque: item.estoque, preco: item.preco ?? null };
    }
    if (row.rowPrice === null && item.preco != null) row.rowPrice = item.preco;
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
    parentCodigo,
  };
}
