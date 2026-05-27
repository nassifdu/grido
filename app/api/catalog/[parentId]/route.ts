import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getProductPivot } from "@/lib/catalog";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ parentId: string }> }
) {
  const userId = await getSession(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { parentId } = await params;
  const id = parseInt(parentId);

  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const pivot = await getProductPivot(id);
    if (!pivot) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json(pivot);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
