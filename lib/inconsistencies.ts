import { buildTransformed } from "./transform";
import { checkStrings } from "./spellcheck";

export interface ProductRef {
  id: number;
  name: string;
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

export type AnalysisEvent =
  | { type: "progress"; label: string; step: number; total: number }
  | { type: "section"; section: InconsistencySection }
  | { type: "done" };

const TOTAL_STEPS = 5;

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

export async function* streamInconsistencies(): AsyncGenerator<AnalysisEvent> {
  yield { type: "progress", label: "Carregando catálogo…", step: 1, total: TOTAL_STEPS };
  const items = await buildTransformed();
  const variations = items.filter((i) => i.parentId !== null);

  // ── Broken ─────────────────────────────────────────────────────────────────
  yield { type: "progress", label: "Analisando variações quebradas…", step: 2, total: TOTAL_STEPS };

  const noVariationProducts: ProductRef[] = [];
  const missingColorMap = new Map<string, ProductRef[]>();
  const missingSizeMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    const { rawColor, rawSize } = extractRaw(item.variationName);
    const ref: ProductRef = { id: item.id, name: item.name, color: rawColor, variationName: item.variationName };

    if (!item.variationName || (!rawColor && !rawSize)) {
      noVariationProducts.push(ref);
      continue;
    }
    if (!rawColor) {
      const k = item.variationName;
      if (!missingColorMap.has(k)) missingColorMap.set(k, []);
      missingColorMap.get(k)!.push(ref);
    } else if (!rawSize) {
      const k = item.variationName;
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

  if (brokenPatterns.length > 0) {
    yield {
      type: "section",
      section: {
        id: "broken",
        title: "Dados Quebrados",
        description: "Variações com estrutura inválida ou campos ausentes",
        color: "red",
        patterns: brokenPatterns,
      },
    };
  }

  // ── Incomplete ─────────────────────────────────────────────────────────────
  yield { type: "progress", label: "Verificando campos incompletos…", step: 3, total: TOTAL_STEPS };

  const noCodeProducts: ProductRef[] = [];
  const noPriceProducts: ProductRef[] = [];

  for (const item of items) {
    const { rawColor } = extractRaw(item.variationName);
    const ref: ProductRef = { id: item.id, name: item.name, color: rawColor, variationName: item.variationName };
    if (!item.codigo) noCodeProducts.push(ref);
    if (!item.price) noPriceProducts.push(ref);
  }

  const incompletePatterns: InconsistencyPattern[] = [];
  if (noCodeProducts.length > 0) incompletePatterns.push({ label: "sem código", count: noCodeProducts.length, products: noCodeProducts });
  if (noPriceProducts.length > 0) incompletePatterns.push({ label: "sem preço", count: noPriceProducts.length, products: noPriceProducts });

  if (incompletePatterns.length > 0) {
    yield {
      type: "section",
      section: {
        id: "incomplete",
        title: "Dados Incompletos",
        description: "Produtos faltando campos importantes",
        color: "amber",
        patterns: incompletePatterns,
      },
    };
  }

  // ── Sizes & Colors ─────────────────────────────────────────────────────────
  yield { type: "progress", label: "Catalogando tamanhos e cores…", step: 4, total: TOTAL_STEPS };

  const sizeMap = new Map<string, ProductRef[]>();
  const colorMap = new Map<string, ProductRef[]>();

  for (const item of variations) {
    if (!item.variationName) continue;
    const { rawColor, rawSize } = extractRaw(item.variationName);
    const ref: ProductRef = { id: item.id, name: item.name, color: rawColor, variationName: item.variationName };
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

  if (sizePatterns.length > 0) {
    yield {
      type: "section",
      section: {
        id: "sizes",
        title: "Tamanhos",
        description: "Valores distintos de tamanho encontrados no catálogo",
        color: "blue",
        patterns: sizePatterns,
      },
    };
  }
  if (colorPatterns.length > 0) {
    yield {
      type: "section",
      section: {
        id: "colors",
        title: "Cores",
        description: "Valores distintos de cor encontrados no catálogo",
        color: "blue",
        patterns: colorPatterns,
      },
    };
  }

  // ── Spelling (LanguageTool) ────────────────────────────────────────────────
  yield { type: "progress", label: "Verificando ortografia…", step: 5, total: TOTAL_STEPS };

  try {
    const allLabels = [...sizeMap.keys(), ...colorMap.keys()];
    const spellResults = await checkStrings(allLabels);
    const spellingPatterns: InconsistencyPattern[] = [];

    for (const [label, misspelledWords] of spellResults) {
      const products = [...(sizeMap.get(label) ?? []), ...(colorMap.get(label) ?? [])];
      const seen = new Set<number>();
      const unique = products.filter((p) => !seen.has(p.id) && seen.add(p.id));
      spellingPatterns.push({ label, count: unique.length, products: unique, misspelledWords });
    }
    spellingPatterns.sort((a, b) => b.count - a.count);

    if (spellingPatterns.length > 0) {
      yield {
        type: "section",
        section: {
          id: "spelling",
          title: "Erros Ortográficos",
          description: "Possíveis erros de grafia detectados pelo LanguageTool (pt-BR ∩ en-US)",
          color: "violet",
          patterns: spellingPatterns,
        },
      };
    }
  } catch (e) {
    // Spellcheck is best-effort; a LanguageTool outage must not break the page
    console.error("[spellcheck] failed:", e);
  }

  yield { type: "done" };
}
