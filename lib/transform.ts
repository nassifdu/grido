import fs from "fs/promises";
import path from "path";

const PRODUTOS_PATH = path.join(process.cwd(), "data", "produtos.json");
const VARIACOES_PATH = path.join(process.cwd(), "data", "variacoes.json");

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

// ── variacao_nome normalization (ported from transform.py) ────────────────────

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

// Fallback: extract "Cor:X;Tamanho:Y" (or single-dimension) appended to a child's nome.
// produtos.json children store variation labels directly in their nome field when
// variacoes.json has no entry for their parent.
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

// ── mtime-based module cache ───────────────────────────────────────────────────

let _cache: { items: TransformedItem[]; mtime: number } | null = null;

export async function buildTransformed(): Promise<TransformedItem[]> {
  let varMtime = 0;
  try {
    const stat = await fs.stat(VARIACOES_PATH);
    varMtime = stat.mtimeMs;
  } catch {
    // file not yet present
  }

  if (_cache && _cache.mtime === varMtime && varMtime > 0) {
    return _cache.items;
  }

  const [rawProdutos, rawVariacoes] = await Promise.all([
    fs.readFile(PRODUTOS_PATH, "utf-8").then(JSON.parse),
    fs.readFile(VARIACOES_PATH, "utf-8").then(JSON.parse),
  ]);

  const productsList: RawProduct[] = Array.isArray(rawProdutos)
    ? rawProdutos
    : (rawProdutos.products ?? []);

  const variacoes: Record<string, RawProduct[]> = rawVariacoes;

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

  // 2. children from variacoes.json (richer source)
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

  // 3. children from produtos.json not covered by variacoes.json
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

  _cache = { items: output, mtime: varMtime };
  return output;
}
