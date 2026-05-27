import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchProducts } from "@/lib/catalog";

export async function GET(req: NextRequest) {
  const userId = await getSession(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30"), 100);
  const cor = req.nextUrl.searchParams.get("cor") ?? "";
  const tamanho = req.nextUrl.searchParams.get("tamanho") ?? "";

  try {
    const products = await searchProducts(q, limit, cor, tamanho);
    return NextResponse.json({ products });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
