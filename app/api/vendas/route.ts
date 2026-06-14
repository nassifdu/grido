import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { buildTransformed } from "@/lib/transform";

// ── size sorting (mirrored from lib/catalog.ts) ───────────────────────────────

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

function parseVariacaoNome(vn: string | null): { cor: string | null; tamanho: string | null } {
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

// ── public types ──────────────────────────────────────────────────────────────

export interface VendasProductSummary {
  key: string;
  nome: string;
  totalVendido: number;
  valorTotal: number;
  colorCount: number;
  variantCount: number;
}

export interface VendasPivotRow {
  cor: string | null;
  cells: Record<string, { qty: number; valor: number }>;
  total: number;
}

export interface VendasPivot {
  sizes: string[];
  rows: VendasPivotRow[];
  totals: Record<string, number>;
  grandTotal: number;
}

// ── Bling API types ───────────────────────────────────────────────────────────

interface BlingOrderItem {
  produto?: { id?: number; codigo?: string; descricao?: string };
  quantidade?: number;
  valor?: number;
}

interface BlingOrder {
  id?: number;
  itens?: BlingOrderItem[];
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = await getSession(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Parâmetros from e to são obrigatórios" }, { status: 400 });
  }

  try {
    // Load local catalog for variation matching (30s in-memory cache)
    const items = await buildTransformed();
    const varById = new Map(items.map((item) => [item.id, item]));

    // Paginate through Bling pedidos/vendas
    const orders: BlingOrder[] = [];
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        pagina: String(page),
        limite: "100",
        dataEmissaoInicial: from,
        dataEmissaoFinal: to,
      });

      const res = await blingFetch(userId, `/pedidos/vendas?${params}`);

      if (res.status === 404) break;
      if (res.status === 429) {
        // Rate limited — wait 1s and retry the same page
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) {
        // blingFetch already consumed the body for logging — don't read it again
        throw new Error(`Bling pedidos/vendas: HTTP ${res.status}`);
      }

      const json = await res.json();
      const pageOrders: BlingOrder[] = Array.isArray(json.data) ? json.data : [];
      orders.push(...pageOrders);

      if (pageOrders.length < 100) break;
      page++;
      // ~3 req/s limit
      await new Promise((r) => setTimeout(r, 350));
    }

    // Aggregate sales by product group
    type CellAcc = { qty: number; valor: number };
    type GroupAcc = {
      nome: string;
      key: string;
      corMap: Map<string | null, Map<string, CellAcc>>;
      totalVendido: number;
      valorTotal: number;
    };

    const groups = new Map<string, GroupAcc>();

    for (const order of orders) {
      for (const item of order.itens ?? []) {
        const prodId = item.produto?.id;
        if (!prodId) continue;

        const variation = varById.get(prodId);
        if (!variation) continue;

        const qty = item.quantidade ?? 0;
        if (qty <= 0) continue;
        const valor = (item.valor ?? 0) * qty;

        const key =
          variation.idProdutoPai != null
            ? `p:${variation.idProdutoPai}`
            : `s:${variation.id}`;

        if (!groups.has(key)) {
          groups.set(key, {
            nome: variation.nome,
            key,
            corMap: new Map(),
            totalVendido: 0,
            valorTotal: 0,
          });
        }

        const group = groups.get(key)!;
        group.totalVendido += qty;
        group.valorTotal += valor;

        const { cor, tamanho } = parseVariacaoNome(variation.variacao_nome);
        const corKey = cor ?? null;
        const tamKey = tamanho ?? "único";

        if (!group.corMap.has(corKey)) group.corMap.set(corKey, new Map());
        const tamMap = group.corMap.get(corKey)!;
        const prev = tamMap.get(tamKey) ?? { qty: 0, valor: 0 };
        tamMap.set(tamKey, { qty: prev.qty + qty, valor: prev.valor + valor });
      }
    }

    // Build product summaries and pivots
    const products: VendasProductSummary[] = [];
    const pivots: Record<string, VendasPivot> = {};

    for (const [key, group] of groups.entries()) {
      const sizesSet = new Set<string>();
      for (const tamMap of group.corMap.values()) {
        for (const tam of tamMap.keys()) sizesSet.add(tam);
      }
      const sizes = sortSizes([...sizesSet]);

      const rows: VendasPivotRow[] = [];
      for (const [cor, tamMap] of group.corMap.entries()) {
        const cells: Record<string, { qty: number; valor: number }> = {};
        let rowTotal = 0;
        for (const [tam, data] of tamMap.entries()) {
          cells[tam] = data;
          rowTotal += data.qty;
        }
        rows.push({ cor, cells, total: rowTotal });
      }

      const totals: Record<string, number> = {};
      for (const s of sizes) {
        totals[s] = rows.reduce((sum, r) => sum + (r.cells[s]?.qty ?? 0), 0);
      }

      const colorCount = [...group.corMap.keys()].filter((c) => c !== null).length;
      const variantCount = [...group.corMap.values()].reduce((sum, m) => sum + m.size, 0);

      products.push({
        key,
        nome: group.nome,
        totalVendido: group.totalVendido,
        valorTotal: group.valorTotal,
        colorCount,
        variantCount,
      });

      pivots[key] = { sizes, rows, totals, grandTotal: group.totalVendido };
    }

    products.sort((a, b) => b.totalVendido - a.totalVendido);

    return NextResponse.json({ products, pivots });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[api/vendas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
