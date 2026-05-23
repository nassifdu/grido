import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), "data", "produtos.json");
const LIMITE = 100;

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

  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(products, null, 2), "utf-8");

  return NextResponse.json(products);
}
