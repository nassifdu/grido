import { NextRequest, NextResponse } from "next/server";

const LIMITE = 100;
const SUFFIX_RE = /((?:Cor:[^;]+;Tamanho:[^;]+)|(?:Tamanho:[^;]+;Cor:[^;]+))$/;
const MOJIBAKE_RE = /[ÃÂ]/;

async function fetchAllProducts(accessToken: string) {
  const all = [];
  let pagina = 1;

  while (true) {
    const res = await fetch(
      `https://www.bling.com.br/Api/v3/produtos?limite=${LIMITE}&pagina=${pagina}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw Object.assign(new Error("Bling API error"), { status: res.status, detail });
    }

    const { data } = await res.json();
    const items = Array.isArray(data) ? data : [];
    all.push(...items);
    if (items.length < LIMITE) break;
    pagina++;
  }

  return all;
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("bling_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let products;
  try {
    products = await fetchAllProducts(accessToken);
  } catch (err: unknown) {
    const e = err as { status?: number; detail?: unknown; message?: string };
    return NextResponse.json(
      { error: e.message, detail: e.detail },
      { status: e.status ?? 500 }
    );
  }

  const formatos: Record<string, number> = {};
  const suffixPatternSet = new Set<string>();
  const sizeValueSet = new Set<string>();
  const colorValueSet = new Set<string>();
  const unparseable: string[] = [];
  const encodingIssues: string[] = [];

  for (const p of products) {
    const nome: string = p.nome ?? "";
    const formato: string = p.formato ?? "unknown";

    formatos[formato] = (formatos[formato] ?? 0) + 1;

    if (MOJIBAKE_RE.test(nome)) {
      encodingIssues.push(nome);
    }

    const match = SUFFIX_RE.exec(nome);
    if (match) {
      const suffix = match[1];
      suffixPatternSet.add(suffix.replace(/:[^;]+/g, ":*"));

      for (const part of suffix.split(";")) {
        const [key, val] = part.split(":").map((s) => s.trim());
        if (key === "Tamanho") sizeValueSet.add(val);
        if (key === "Cor") colorValueSet.add(val);
      }
    } else if (formato === "S") {
      unparseable.push(nome);
    }
  }

  return NextResponse.json({
    total: products.length,
    formatos,
    suffixPatterns: [...suffixPatternSet].sort(),
    sizeValues: [...sizeValueSet].sort(),
    colorValues: [...colorValueSet].sort(),
    unparseable: [...new Set(unparseable)].sort(),
    encodingIssues: [...new Set(encodingIssues)].sort(),
  });
}
