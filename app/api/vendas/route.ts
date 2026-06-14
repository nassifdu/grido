import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { buildTransformed } from "@/lib/transform";

const DELAY_MS = 350; // ~3 req/s
const CONCURRENCY = 3;

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ── size helpers (mirrored from lib/catalog.ts) ───────────────────────────────

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

// ── types ─────────────────────────────────────────────────────────────────────

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

interface BlingOrderItem {
  produto?: { id?: number; codigo?: string; descricao?: string };
  quantidade?: number;
  valor?: number;
}

interface BlingOrder {
  id?: number;
  itens?: BlingOrderItem[];
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchWithRetry(
  userId: string,
  path: string,
  retries = 2
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await blingFetch(userId, path);
    if (res.status === 429) {
      await delay(1000 * (attempt + 1));
      continue;
    }
    return res;
  }
  return null;
}

/** Fetch all order summaries (IDs) for the given date range. */
async function fetchOrderIds(userId: string, from: string, to: string): Promise<number[]> {
  const ids: number[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      pagina: String(page),
      limite: "100",
      dataEmissaoInicial: from,
      dataEmissaoFinal: to,
    });

    const res = await fetchWithRetry(userId, `/pedidos/vendas?${params}`);
    if (!res) throw new Error("Bling pedidos/vendas: esgotou tentativas (429)");
    if (res.status === 404) break;
    if (!res.ok) throw new Error(`Bling pedidos/vendas: HTTP ${res.status}`);

    const json = await res.json();
    const page_data: BlingOrder[] = Array.isArray(json.data) ? json.data : [];

    // Check whether the list already carries itens (some Bling accounts do)
    const listHasItems = page_data.some((o) => (o.itens?.length ?? 0) > 0);
    if (listHasItems) {
      console.log("[vendas] list endpoint includes itens — using directly");
      // Return sentinel value so caller knows items are embedded
      return page_data.map((o) => -(o.id ?? 0)); // negative = "already full order"
    }

    for (const o of page_data) {
      if (o.id) ids.push(o.id);
    }

    console.log(`[vendas] page ${page}: ${page_data.length} orders (total ids so far: ${ids.length})`);

    if (page_data.length < 100) break;
    page++;
    await delay(DELAY_MS);
  }

  return ids;
}

/** Fetch full order details (with itens) for a batch of IDs. */
async function fetchOrderDetails(userId: string, ids: number[]): Promise<BlingOrder[]> {
  const orders: BlingOrder[] = [];

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => fetchWithRetry(userId, `/pedidos/vendas/${id}`))
    );

    for (const result of settled) {
      if (result.status === "rejected") continue;
      const res = result.value;
      if (!res || !res.ok) continue;
      const json = await res.json();
      const order: BlingOrder = json.data ?? json;
      if (order?.id) orders.push(order);
    }

    if (i + CONCURRENCY < ids.length) await delay(DELAY_MS);
  }

  return orders;
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

  console.log(`[vendas] GET from=${from} to=${to}`);

  try {
    // ── 1. Build local catalog lookup (ID → item, codigo → item) ─────────────
    const catalogItems = await buildTransformed();
    const varById = new Map(catalogItems.map((it) => [it.id, it]));
    const varByCodigo = new Map(
      catalogItems.filter((it) => it.codigo).map((it) => [it.codigo!, it])
    );
    console.log(`[vendas] catalog: ${catalogItems.length} items loaded`);

    // ── 2. Fetch order IDs (or full orders if list includes itens) ────────────
    const rawIds = await fetchOrderIds(userId, from, to);
    const listHadItems = rawIds.length > 0 && rawIds[0] < 0;

    let orders: BlingOrder[];

    if (listHadItems) {
      // Re-fetch page 1 to get the embedded orders
      // (fetchOrderIds returned sentinel negatives — redo with real fetch)
      orders = [];
      let page = 1;
      while (true) {
        const params = new URLSearchParams({
          pagina: String(page),
          limite: "100",
          dataEmissaoInicial: from,
          dataEmissaoFinal: to,
        });
        const res = await fetchWithRetry(userId, `/pedidos/vendas?${params}`);
        if (!res || !res.ok || res.status === 404) break;
        const json = await res.json();
        const page_data: BlingOrder[] = Array.isArray(json.data) ? json.data : [];
        orders.push(...page_data);
        if (page_data.length < 100) break;
        page++;
        await delay(DELAY_MS);
      }
    } else {
      const positiveIds = rawIds.filter((id) => id > 0);
      console.log(`[vendas] fetching ${positiveIds.length} individual orders…`);
      orders = await fetchOrderDetails(userId, positiveIds);
    }

    console.log(`[vendas] ${orders.length} orders retrieved`);

    // ── 3. Aggregate items ────────────────────────────────────────────────────
    type CellAcc = { qty: number; valor: number };
    type GroupAcc = {
      nome: string;
      key: string;
      corMap: Map<string | null, Map<string, CellAcc>>;
      totalVendido: number;
      valorTotal: number;
    };

    const groups = new Map<string, GroupAcc>();
    let totalItems = 0;
    let matchedItems = 0;
    let unmatchedSample: string[] = [];

    for (const order of orders) {
      for (const item of order.itens ?? []) {
        totalItems++;
        const prodId = item.produto?.id;
        const prodCodigo = item.produto?.codigo;
        const qty = item.quantidade ?? 0;
        if (qty <= 0) continue;

        // Match against local catalog: by ID first, then by código
        const variation =
          (prodId ? varById.get(prodId) : undefined) ??
          (prodCodigo ? varByCodigo.get(prodCodigo) : undefined);

        if (!variation) {
          if (unmatchedSample.length < 5) {
            unmatchedSample.push(`id=${prodId} codigo=${prodCodigo} desc="${item.produto?.descricao}"`);
          }
          continue;
        }

        matchedItems++;
        const valor = (item.valor ?? 0) * qty;

        const key =
          variation.idProdutoPai != null
            ? `p:${variation.idProdutoPai}`
            : `s:${variation.id}`;

        if (!groups.has(key)) {
          groups.set(key, { nome: variation.nome, key, corMap: new Map(), totalVendido: 0, valorTotal: 0 });
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

    console.log(
      `[vendas] items: total=${totalItems} matched=${matchedItems} unmatched=${totalItems - matchedItems}`
    );
    if (unmatchedSample.length > 0) {
      console.log("[vendas] unmatched sample:", unmatchedSample);
    }

    // ── 4. Build response ─────────────────────────────────────────────────────
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

    // _debug is returned so the browser console can show diagnostics
    return NextResponse.json({
      products,
      pivots,
      _debug: {
        ordersCount: orders.length,
        totalItems,
        matchedItems,
        unmatchedItems: totalItems - matchedItems,
        unmatchedSample,
        catalogSize: catalogItems.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[api/vendas]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
