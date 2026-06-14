import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { buildTransformed } from "@/lib/transform";

const DELAY_MS = 350;
const CONCURRENCY = 3;

const enc = new TextEncoder();
function sse(payload: unknown) {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}
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

// ── Bling types ───────────────────────────────────────────────────────────────

interface BlingOrderItem {
  produto?: { id?: number; codigo?: string; descricao?: string };
  quantidade?: number;
  valor?: number;
}

interface BlingOrder {
  id?: number;
  itens?: BlingOrderItem[];
}

// ── fetch with 429 retry ──────────────────────────────────────────────────────

async function fetchWithRetry(
  userId: string,
  path: string,
  retries = 3
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await blingFetch(userId, path);
    if (res.status !== 429) return res;
    await delay(1000 * (attempt + 1));
  }
  return null;
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = await getSession(req);
  if (!userId) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Unauthorized" })}\n\n`,
      { status: 401, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Parâmetros from e to são obrigatórios" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      // ── 1. Load local catalog ───────────────────────────────────────────────
      await writer.write(sse({ type: "status", message: "Carregando catálogo local…" }));

      const catalogItems = await buildTransformed();
      const varById = new Map(catalogItems.map((it) => [it.id, it]));
      const varByCodigo = new Map(
        catalogItems.filter((it) => it.codigo).map((it) => [it.codigo!, it])
      );

      console.log(`[vendas] catalog: ${catalogItems.length} items`);

      // ── 2. Fetch order list, auto-detect whether itens are embedded ─────────
      await writer.write(sse({ type: "status", message: "Buscando pedidos no Bling…" }));

      const orders: BlingOrder[] = [];
      const orderIds: number[] = [];
      let hasEmbeddedItems: boolean | null = null;
      let listPage = 1;

      while (true) {
        const params = new URLSearchParams({
          pagina: String(listPage),
          limite: "100",
          dataEmissaoInicial: from,
          dataEmissaoFinal: to,
        });

        const res = await fetchWithRetry(userId, `/pedidos/vendas?${params}`);
        if (!res) throw new Error("Limite de requisições atingido ao listar pedidos");
        if (res.status === 404) break;
        if (!res.ok) throw new Error(`Bling pedidos/vendas: HTTP ${res.status}`);

        const json = await res.json();
        const pageData: BlingOrder[] = Array.isArray(json.data) ? json.data : [];

        if (hasEmbeddedItems === null && pageData.length > 0) {
          hasEmbeddedItems = pageData.some((o) => (o.itens?.length ?? 0) > 0);
          console.log(`[vendas] list includes itens: ${hasEmbeddedItems}`);
        }

        if (hasEmbeddedItems) {
          orders.push(...pageData);
        } else {
          orderIds.push(...pageData.filter((o) => o.id != null).map((o) => o.id!));
        }

        if (pageData.length < 100) break;
        listPage++;
        await delay(DELAY_MS);
      }

      // ── 3. Fetch individual orders if list didn't embed itens ───────────────
      if (!hasEmbeddedItems && orderIds.length > 0) {
        console.log(`[vendas] fetching ${orderIds.length} individual orders…`);

        await writer.write(sse({
          type: "progress",
          message: `Carregando itens de ${orderIds.length} pedidos…`,
          current: 0,
          total: orderIds.length,
        }));

        for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
          const batch = orderIds.slice(i, i + CONCURRENCY);
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

          const current = Math.min(i + CONCURRENCY, orderIds.length);
          await writer.write(sse({
            type: "progress",
            message: `Carregando itens de ${orderIds.length} pedidos…`,
            current,
            total: orderIds.length,
          }));

          if (i + CONCURRENCY < orderIds.length) await delay(DELAY_MS);
        }
      }

      console.log(`[vendas] ${orders.length} orders with itens`);

      // ── 4. Aggregate ────────────────────────────────────────────────────────
      await writer.write(sse({ type: "status", message: "Processando resultados…" }));

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
      const unmatchedSample: string[] = [];

      for (const order of orders) {
        for (const item of order.itens ?? []) {
          totalItems++;
          const prodId = item.produto?.id;
          const prodCodigo = item.produto?.codigo;
          const qty = item.quantidade ?? 0;
          if (qty <= 0) continue;

          const variation =
            (prodId ? varById.get(prodId) : undefined) ??
            (prodCodigo ? varByCodigo.get(prodCodigo) : undefined);

          if (!variation) {
            if (unmatchedSample.length < 5) {
              unmatchedSample.push(
                `id=${prodId} codigo=${prodCodigo} desc="${item.produto?.descricao}"`
              );
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
          const tamKey = tamanho ?? "único";

          if (!group.corMap.has(cor ?? null)) group.corMap.set(cor ?? null, new Map());
          const tamMap = group.corMap.get(cor ?? null)!;
          const prev = tamMap.get(tamKey) ?? { qty: 0, valor: 0 };
          tamMap.set(tamKey, { qty: prev.qty + qty, valor: prev.valor + valor });
        }
      }

      console.log(
        `[vendas] items total=${totalItems} matched=${matchedItems} unmatched=${totalItems - matchedItems}`
      );
      if (unmatchedSample.length) console.log("[vendas] unmatched sample:", unmatchedSample);

      // ── 5. Build response payload ───────────────────────────────────────────
      type VendasProductSummary = {
        key: string; nome: string; totalVendido: number;
        valorTotal: number; colorCount: number; variantCount: number;
      };
      type VendasPivotRow = {
        cor: string | null;
        cells: Record<string, { qty: number; valor: number }>;
        total: number;
      };
      type VendasPivot = {
        sizes: string[]; rows: VendasPivotRow[];
        totals: Record<string, number>; grandTotal: number;
      };

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

      await writer.write(
        sse({
          type: "done",
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
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[api/vendas]", message);
      try {
        await writer.write(sse({ type: "error", message }));
      } catch {
        // stream already closed
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
