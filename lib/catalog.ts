import { buildTransformed, TransformedItem } from "./transform";
import { getSupabase } from "./supabase";

// ── public types ───────────────────────────────────────────────────────────────

export interface ProductSummary {
  key: string;        // "p:123" for a parent group, "s:456" for a childless solo
  groupId: number;    // parentId for grouped, id for childless
  name: string;
  variantCount: number;
  colorCount: number;
  brand: string | null;
  totalStock: number;
}

export interface PivotCell {
  id: number;
  codigo: string | null;
  stock: number;
  price: number | null;
}

export interface PivotRow {
  color: string | null;
  cells: Record<string, PivotCell | null>;
  total: number;
  rowPrice: number | null;
}

export interface ProductPivot {
  key: string;
  groupId: number;
  name: string;
  sizes: string[];
  hasColors: boolean;
  rows: PivotRow[];
  totals: Record<string, number>;
  grandTotal: number;
  isChildless: boolean;
  childlessCodigo?: string | null;
  childlessPrice?: number | null;
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

// ── variation name parsing ─────────────────────────────────────────────────────

function parseVariation(vn: string | null): { color: string | null; size: string | null } {
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

// ── group key helpers ──────────────────────────────────────────────────────────

function itemKey(item: TransformedItem): string {
  return item.parentId != null ? `p:${item.parentId}` : `s:${item.id}`;
}

function itemGroupId(item: TransformedItem): number {
  return item.parentId ?? item.id;
}

// ── public API ─────────────────────────────────────────────────────────────────

export async function searchProducts(
  query: string,
  limit = 30,
  colorFilter = "",
  sizeFilter = ""
): Promise<ProductSummary[]> {
  const items = await buildTransformed();
  const q = query.trim().toLowerCase();
  const cf = colorFilter.trim().toLowerCase();
  const sf = sizeFilter.trim().toLowerCase();

  type G = { key: string; groupId: number; name: string; brand: string | null; count: number; totalStock: number; colors: Set<string>; sizes: Set<string> };
  const groups = new Map<string, G>();

  for (const item of items) {
    const k = itemKey(item);
    if (!groups.has(k)) {
      groups.set(k, {
        key: k,
        groupId: itemGroupId(item),
        name: item.name,
        brand: item.brand,
        count: 0,
        totalStock: 0,
        colors: new Set(),
        sizes: new Set(),
      });
    }
    const g = groups.get(k)!;
    g.count++;
    g.totalStock += item.stock;
    const { color, size } = parseVariation(item.variationName);
    if (color) g.colors.add(color.toLowerCase());
    if (size) g.sizes.add(size.toLowerCase());
  }

  const sorted = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );

  // Token search: every whitespace-separated token must appear in the name
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

  const results: ProductSummary[] = [];
  for (const g of sorted) {
    const name = g.name.toLowerCase();

    if (tokens.length > 0 && tokens.some((t) => !name.includes(t))) continue;

    // Color filter: name includes cf OR any variation color includes cf
    if (cf && !name.includes(cf) && ![...g.colors].some((c) => c.includes(cf))) continue;

    // Size filter: name includes sf OR any variation size includes sf
    if (sf && !name.includes(sf) && ![...g.sizes].some((t) => t.includes(sf))) continue;

    results.push({
      key: g.key,
      groupId: g.groupId,
      name: g.name,
      variantCount: g.count,
      colorCount: g.colors.size,
      brand: g.brand,
      totalStock: g.totalStock,
    });
    if (results.length >= limit) break;
  }
  return results;
}

export async function getProductPivot(gId: number): Promise<ProductPivot | null> {
  const items = await buildTransformed();

  const group = items.filter(
    (item) =>
      item.parentId === gId ||
      (item.parentId === null && item.id === gId)
  );

  if (group.length === 0) return null;

  const name = group[0].name;
  const key = group[0].parentId != null ? `p:${gId}` : `s:${gId}`;
  const isChildless = group.length === 1 && group[0].parentId === null;

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
      name,
      sizes: [],
      hasColors: false,
      rows: [],
      totals: {},
      grandTotal: group[0].stock,
      isChildless: true,
      childlessCodigo: group[0].codigo,
      childlessPrice: group[0].price ?? null,
      parentCodigo,
    };
  }

  const parsed = group.map((item) => ({ ...item, ...parseVariation(item.variationName) }));

  const hasColors = parsed.some((p) => p.color !== null);
  const allSizes = [...new Set(parsed.map((p) => p.size).filter(Boolean) as string[])];
  const sizes = sortSizes(allSizes);

  const rowMap = new Map<string | null, PivotRow>();

  for (const item of parsed) {
    const color = item.color ?? null;
    if (!rowMap.has(color)) {
      rowMap.set(color, {
        color,
        cells: Object.fromEntries(sizes.map((s) => [s, null])),
        total: 0,
        rowPrice: null,
      });
    }
    const row = rowMap.get(color)!;
    if (item.size) {
      row.cells[item.size] = { id: item.id, codigo: item.codigo, stock: item.stock, price: item.price ?? null };
    }
    if (row.rowPrice === null && item.price != null) row.rowPrice = item.price;
    row.total += item.stock;
  }

  const rows = [...rowMap.values()];
  const totals: Record<string, number> = {};
  for (const s of sizes) {
    totals[s] = rows.reduce((sum, r) => sum + (r.cells[s]?.stock ?? 0), 0);
  }

  return {
    key,
    groupId: gId,
    name,
    sizes,
    hasColors,
    rows,
    totals,
    grandTotal: rows.reduce((sum, r) => sum + r.total, 0),
    isChildless: false,
    parentCodigo,
  };
}
