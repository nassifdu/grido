import { buildTransformed } from "./transform";

export interface ProductRef {
  id: number;
  nome: string;
  cor: string | null;
  variacao_nome: string | null;
}

export interface InconsistencyPattern {
  label: string;
  count: number;
  products: ProductRef[];
}

export interface InconsistencySection {
  id: string;
  title: string;
  description: string;
  color: "red" | "amber" | "blue";
  patterns: InconsistencyPattern[];
}

function extractRaw(vn: string | null): { rawCor: string | null; rawTamanho: string | null } {
  if (!vn) return { rawCor: null, rawTamanho: null };
  let rawCor: string | null = null;
  let rawTamanho: string | null = null;
  for (const part of vn.split(";")) {
    const m = part.match(/^(Cor|Tamanho):(.+)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "cor") rawCor = m[2].trim();
    else rawTamanho = m[2].trim();
  }
  return { rawCor, rawTamanho };
}

export async function analyzeInconsistencias(): Promise<InconsistencySection[]> {
  const items = await buildTransformed();
  const variations = items.filter((i) => i.idProdutoPai !== null);

  // ── Quebrados ──────────────────────────────────────────────────────────────

  const semVariacaoProducts: ProductRef[] = [];
  const semCorMap = new Map<string, ProductRef[]>();
  const semTamanhoMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    const { rawCor, rawTamanho } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, cor: rawCor, variacao_nome: item.variacao_nome };

    if (!item.variacao_nome || (!rawCor && !rawTamanho)) {
      semVariacaoProducts.push(ref);
      continue;
    }

    if (!rawCor) {
      const k = item.variacao_nome;
      if (!semCorMap.has(k)) semCorMap.set(k, []);
      semCorMap.get(k)!.push(ref);
    } else if (!rawTamanho) {
      const k = item.variacao_nome;
      if (!semTamanhoMap.has(k)) semTamanhoMap.set(k, []);
      semTamanhoMap.get(k)!.push(ref);
    }
  }

  const quebradosPatterns: InconsistencyPattern[] = [];
  if (semVariacaoProducts.length > 0) {
    quebradosPatterns.push({ label: "(sem variação)", count: semVariacaoProducts.length, products: semVariacaoProducts });
  }
  for (const [label, products] of semCorMap) {
    quebradosPatterns.push({ label, count: products.length, products });
  }
  for (const [label, products] of semTamanhoMap) {
    quebradosPatterns.push({ label, count: products.length, products });
  }
  quebradosPatterns.sort((a, b) => b.count - a.count);

  // ── Incompletos ────────────────────────────────────────────────────────────

  const semCodigoProducts: ProductRef[] = [];
  const semPrecoProducts: ProductRef[] = [];

  for (const item of items) {
    const { rawCor } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, cor: rawCor, variacao_nome: item.variacao_nome };
    if (!item.codigo) semCodigoProducts.push(ref);
    if (!item.preco) semPrecoProducts.push(ref);
  }

  const incompletosPatterns: InconsistencyPattern[] = [];
  if (semCodigoProducts.length > 0) {
    incompletosPatterns.push({ label: "sem código", count: semCodigoProducts.length, products: semCodigoProducts });
  }
  if (semPrecoProducts.length > 0) {
    incompletosPatterns.push({ label: "sem preço", count: semPrecoProducts.length, products: semPrecoProducts });
  }

  // ── Ortografia ─────────────────────────────────────────────────────────────

  const tamanhoMap = new Map<string, ProductRef[]>();
  const corMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    if (!item.variacao_nome) continue;
    const { rawCor, rawTamanho } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, cor: rawCor, variacao_nome: item.variacao_nome };

    if (rawTamanho) {
      if (!tamanhoMap.has(rawTamanho)) tamanhoMap.set(rawTamanho, []);
      tamanhoMap.get(rawTamanho)!.push(ref);
    }
    if (rawCor) {
      if (!corMap.has(rawCor)) corMap.set(rawCor, []);
      corMap.get(rawCor)!.push(ref);
    }
  }

  const tamanhoPatterns: InconsistencyPattern[] = [...tamanhoMap.entries()]
    .map(([label, products]) => ({ label, count: products.length, products }))
    .sort((a, b) => b.count - a.count);

  const corPatterns: InconsistencyPattern[] = [...corMap.entries()]
    .map(([label, products]) => ({ label, count: products.length, products }))
    .sort((a, b) => b.count - a.count);

  const all: InconsistencySection[] = [
    {
      id: "quebrados",
      title: "Dados Quebrados",
      description: "Variações com estrutura inválida ou campos ausentes",
      color: "red",
      patterns: quebradosPatterns,
    },
    {
      id: "incompletos",
      title: "Dados Incompletos",
      description: "Produtos faltando campos importantes",
      color: "amber",
      patterns: incompletosPatterns,
    },
    {
      id: "tamanhos",
      title: "Tamanhos",
      description: "Valores distintos de tamanho encontrados no catálogo",
      color: "blue",
      patterns: tamanhoPatterns,
    },
    {
      id: "cores",
      title: "Cores",
      description: "Valores distintos de cor encontrados no catálogo",
      color: "blue",
      patterns: corPatterns,
    },
  ];
  return all.filter((s) => s.patterns.length > 0);
}
