import { buildTransformed } from "./transform";
import { checkStrings } from "./spellcheck";

export interface ProductRef {
  id: number;
  nome: string;
  color: string | null;
  variationName: string | null;
}

export interface InconsistencyPattern {
  label: string;
  count: number;
  products: ProductRef[];
  misspelledWords?: string[];
}

export interface InconsistencySection {
  id: string;
  title: string;
  description: string;
  color: "red" | "amber" | "blue" | "violet";
  patterns: InconsistencyPattern[];
}

function extractRaw(vn: string | null): { rawColor: string | null; rawSize: string | null } {
  if (!vn) return { rawColor: null, rawSize: null };
  let rawColor: string | null = null;
  let rawSize: string | null = null;
  for (const part of vn.split(";")) {
    const m = part.match(/^(Cor|Tamanho):(.+)$/i);
    if (!m) continue;
    if (m[1].toLowerCase() === "cor") rawColor = m[2].trim();
    else rawSize = m[2].trim();
  }
  return { rawColor, rawSize };
}

export async function analyzeInconsistencies(): Promise<InconsistencySection[]> {
  const items = await buildTransformed();
  const variations = items.filter((i) => i.idProdutoPai !== null);

  // ── Broken ─────────────────────────────────────────────────────────────────

  const noVariationProducts: ProductRef[] = [];
  const missingColorMap = new Map<string, ProductRef[]>();
  const missingSizeMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    const { rawColor, rawSize } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, color: rawColor, variationName: item.variacao_nome };

    if (!item.variacao_nome || (!rawColor && !rawSize)) {
      noVariationProducts.push(ref);
      continue;
    }

    if (!rawColor) {
      const k = item.variacao_nome;
      if (!missingColorMap.has(k)) missingColorMap.set(k, []);
      missingColorMap.get(k)!.push(ref);
    } else if (!rawSize) {
      const k = item.variacao_nome;
      if (!missingSizeMap.has(k)) missingSizeMap.set(k, []);
      missingSizeMap.get(k)!.push(ref);
    }
  }

  const brokenPatterns: InconsistencyPattern[] = [];
  if (noVariationProducts.length > 0) {
    brokenPatterns.push({ label: "(sem variação)", count: noVariationProducts.length, products: noVariationProducts });
  }
  for (const [label, products] of missingColorMap) {
    brokenPatterns.push({ label, count: products.length, products });
  }
  for (const [label, products] of missingSizeMap) {
    brokenPatterns.push({ label, count: products.length, products });
  }
  brokenPatterns.sort((a, b) => b.count - a.count);

  // ── Incomplete ─────────────────────────────────────────────────────────────

  const noCodeProducts: ProductRef[] = [];
  const noPriceProducts: ProductRef[] = [];

  for (const item of items) {
    const { rawColor } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, color: rawColor, variationName: item.variacao_nome };
    if (!item.codigo) noCodeProducts.push(ref);
    if (!item.preco) noPriceProducts.push(ref);
  }

  const incompletePatterns: InconsistencyPattern[] = [];
  if (noCodeProducts.length > 0) {
    incompletePatterns.push({ label: "sem código", count: noCodeProducts.length, products: noCodeProducts });
  }
  if (noPriceProducts.length > 0) {
    incompletePatterns.push({ label: "sem preço", count: noPriceProducts.length, products: noPriceProducts });
  }

  // ── Sizes & Colors galleries ────────────────────────────────────────────────

  const sizeMap = new Map<string, ProductRef[]>();
  const colorMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    if (!item.variacao_nome) continue;
    const { rawColor, rawSize } = extractRaw(item.variacao_nome);
    const ref: ProductRef = { id: item.id, nome: item.nome, color: rawColor, variationName: item.variacao_nome };

    if (rawSize) {
      if (!sizeMap.has(rawSize)) sizeMap.set(rawSize, []);
      sizeMap.get(rawSize)!.push(ref);
    }
    if (rawColor) {
      if (!colorMap.has(rawColor)) colorMap.set(rawColor, []);
      colorMap.get(rawColor)!.push(ref);
    }
  }

  const sizePatterns: InconsistencyPattern[] = [...sizeMap.entries()]
    .map(([label, products]) => ({ label, count: products.length, products }))
    .sort((a, b) => b.count - a.count);

  const colorPatterns: InconsistencyPattern[] = [...colorMap.entries()]
    .map(([label, products]) => ({ label, count: products.length, products }))
    .sort((a, b) => b.count - a.count);

  // ── Spelling (LanguageTool) ────────────────────────────────────────────────

  let spellingPatterns: InconsistencyPattern[] = [];
  try {
    const allLabels = [...sizeMap.keys(), ...colorMap.keys()];
    const spellResults = await checkStrings(allLabels);

    for (const [label, misspelledWords] of spellResults) {
      const products = [...(sizeMap.get(label) ?? []), ...(colorMap.get(label) ?? [])];
      const seen = new Set<number>();
      const unique = products.filter((p) => !seen.has(p.id) && seen.add(p.id));
      spellingPatterns.push({ label, count: unique.length, products: unique, misspelledWords });
    }
    spellingPatterns.sort((a, b) => b.count - a.count);
  } catch (e) {
    // Spellcheck is best-effort; a LanguageTool outage must not break the page
    console.error("[spellcheck] failed:", e);
  }

  const all: InconsistencySection[] = [
    {
      id: "broken",
      title: "Dados Quebrados",
      description: "Variações com estrutura inválida ou campos ausentes",
      color: "red",
      patterns: brokenPatterns,
    },
    {
      id: "incomplete",
      title: "Dados Incompletos",
      description: "Produtos faltando campos importantes",
      color: "amber",
      patterns: incompletePatterns,
    },
    {
      id: "sizes",
      title: "Tamanhos",
      description: "Valores distintos de tamanho encontrados no catálogo",
      color: "blue",
      patterns: sizePatterns,
    },
    {
      id: "colors",
      title: "Cores",
      description: "Valores distintos de cor encontrados no catálogo",
      color: "blue",
      patterns: colorPatterns,
    },
    {
      id: "spelling",
      title: "Erros Ortográficos",
      description: "Possíveis erros de grafia detectados pelo LanguageTool (pt-BR ∩ en-US)",
      color: "violet",
      patterns: spellingPatterns,
    },
  ];
  return all.filter((s) => s.patterns.length > 0);
}
