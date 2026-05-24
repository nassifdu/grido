import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const PRODUTOS_PATH = path.join(process.cwd(), "data", "produtos.json");
const CACHE_PATH = path.join(process.cwd(), "data", "variacoes.json");

async function fetchVariations(accessToken: string, idProdutoPai: number) {
  const res = await fetch(
    `https://www.bling.com.br/Api/v3/produtos/variacoes/${idProdutoPai}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw Object.assign(new Error("Bling API error"), { status: res.status, detail });
  }

  const { data } = await res.json();
  return Array.isArray(data?.variacoes) ? data.variacoes : [];
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (!refresh) {
    try {
      const cached = await fs.readFile(CACHE_PATH, "utf-8");
      return NextResponse.json(JSON.parse(cached));
    } catch {
      // file doesn't exist yet — fall through to fetch
    }
  }

  const accessToken = request.cookies.get("bling_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let produtos: { idProdutoPai?: number }[];
  try {
    const raw = await fs.readFile(PRODUTOS_PATH, "utf-8");
    produtos = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "produtos.json not found — fetch /api/products first" }, { status: 400 });
  }

  const parentIds = [...new Set(produtos.map((p) => p.idProdutoPai).filter(Boolean))] as number[];

  const results: Record<number, unknown[]> = {};
  const errors: Record<number, unknown> = {};

  for (let i = 0; i < parentIds.length; i += 3) {
    const batch = parentIds.slice(i, i + 3);
    await Promise.all(
      batch.map(async (id) => {
        try {
          results[id] = await fetchVariations(accessToken, id);
        } catch (err: unknown) {
          const e = err as { status?: number; detail?: unknown; message?: string };
          errors[id] = { message: e.message, detail: e.detail };
        }
      })
    );
    if (i + 3 < parentIds.length) await new Promise((r) => setTimeout(r, 1000));
  }

  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(results, null, 2), "utf-8");

  return NextResponse.json({ results, errors: Object.keys(errors).length ? errors : undefined });
}
