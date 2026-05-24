import { getSupabase } from "./supabase";

interface RawProduct {
  id: number;
  nome?: string;
  situacao?: string;
  codigo?: string;
  preco?: number;
  precoCusto?: number;
  estoque?: number | { saldoVirtualTotal?: number };
  idProdutoPai?: number;
  variacao?: { nome?: string };
  marca?: string;
}

export interface TransformedItem {
  idProdutoPai: number | null;
  id: number;
  nome: string;
  codigo: string | null;
  preco: number | null;
  precoCusto: number | null;
  variacao_nome: string | null;
  marca: string | null;
  estoque: number;
}

// ── variacao_nome normalization ────────────────────────────────────────────────

function isCorrectVariacao(s: string): boolean {
  return (
    /^Cor:[^;]+;Tamanho:[^;]+$/.test(s) ||
    /^Tamanho:[^;]+;Cor:[^;]+$/.test(s)
  );
}

function hasBothDimensions(s: string): boolean {
  const l = s.toLowerCase();
  return l.includes("cor") && l.includes("tamanho");
}

function fixVariacaoNome(s: string): string {
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

function normalizeVariacao(vn: string | null | undefined): string | null {
  if (vn == null) return null;
  const s = String(vn).trim();
  if (!s) return null;
  if (!hasBothDimensions(s) || isCorrectVariacao(s)) return s;
  return fixVariacaoNome(s);
}

function extractVariacaoFromNome(nome: string): string | null {
  const m = nome.match(/\s+((?:(?:Cor|Tamanho):[^;]+)(?:;(?:Cor|Tamanho):[^;]+)*)$/i);
  if (!m) return null;
  return normalizeVariacao(m[1]);
}

function saldo(e: RawProduct["estoque"]): number {
  if (e == null) return 0;
  if (typeof e === "object") return (e as { saldoVirtualTotal?: number }).saldoVirtualTotal ?? 0;
  return e as number;
}

// ── Supabase pagination helper ─────────────────────────────────────────────────

async function fetchAllRows<T>(table: string, select: string): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await getSupabase()
      .from(table)
      .select(select)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Supabase error on ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

// ── In-memory TTL cache ───────────────────────────────────────────────────────

let _cache: { items: TransformedItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

export function clearTransformCache() {
  _cache = null;
}

export async function buildTransformed(): Promise<TransformedItem[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.items;
  }

  const [prodRows, varRows] = await Promise.all([
    fetchAllRows<{ data: RawProduct }>("bling_produtos", "data"),
    fetchAllRows<{ id_produto_pai: number; data: RawProduct }>(
      "bling_variacoes",
      "id_produto_pai, data"
    ),
  ]);

  const productsList: RawProduct[] = prodRows.map((r) => r.data);

  const variacoes: Record<string, RawProduct[]> = {};
  for (const row of varRows) {
    const pid = String(row.id_produto_pai);
    if (!variacoes[pid]) variacoes[pid] = [];
    variacoes[pid].push(row.data);
  }

  const idsWithChildren = new Set<number>(Object.keys(variacoes).map(Number));
  for (const p of productsList) {
    if (p.idProdutoPai != null) idsWithChildren.add(p.idProdutoPai);
  }

  const parentNameMap = new Map<number, string>();
  for (const p of productsList) {
    if (p.idProdutoPai == null) parentNameMap.set(p.id, p.nome ?? "");
  }

  const output: TransformedItem[] = [];
  const seenIds = new Set<number>();

  // 1. childless parent products
  for (const p of productsList) {
    if (p.situacao !== "A") continue;
    if (p.idProdutoPai != null) continue;
    if (idsWithChildren.has(p.id)) continue;
    output.push({
      idProdutoPai: null,
      id: p.id,
      nome: p.nome ?? "",
      codigo: p.codigo ?? null,
      preco: p.preco ?? null,
      precoCusto: p.precoCusto ?? null,
      variacao_nome: null,
      marca: p.marca ?? null,
      estoque: saldo(p.estoque),
    });
    seenIds.add(p.id);
  }

  // 2. children from bling_variacoes (richer source)
  for (const [parentIdStr, children] of Object.entries(variacoes)) {
    const parentId = parseInt(parentIdStr);
    const parentNome = parentNameMap.get(parentId) ?? "";
    for (const child of children) {
      if (child.situacao !== "A") continue;
      output.push({
        idProdutoPai: parentId,
        id: child.id,
        nome: parentNome,
        codigo: child.codigo ?? null,
        preco: child.preco ?? null,
        precoCusto: child.precoCusto ?? null,
        variacao_nome: normalizeVariacao(child.variacao?.nome),
        marca: child.marca ?? null,
        estoque: saldo(child.estoque),
      });
      seenIds.add(child.id);
    }
  }

  // 3. children from bling_produtos not covered by bling_variacoes
  for (const p of productsList) {
    if (p.situacao !== "A") continue;
    if (p.idProdutoPai == null) continue;
    if (seenIds.has(p.id)) continue;
    const variacaoNome =
      normalizeVariacao(p.variacao?.nome) ?? extractVariacaoFromNome(p.nome ?? "");
    output.push({
      idProdutoPai: p.idProdutoPai,
      id: p.id,
      nome: parentNameMap.get(p.idProdutoPai) ?? "",
      codigo: p.codigo ?? null,
      preco: p.preco ?? null,
      precoCusto: p.precoCusto ?? null,
      variacao_nome: variacaoNome,
      marca: p.marca ?? null,
      estoque: saldo(p.estoque),
    });
    seenIds.add(p.id);
  }

  _cache = { items: output, fetchedAt: Date.now() };
  return output;
}
