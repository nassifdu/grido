import { NextRequest, NextResponse } from "next/server";
import { getProductPivot } from "@/lib/catalog";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ parentId: string }> }
) {
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
    if (msg.includes("ENOENT")) {
      return NextResponse.json(
        { error: "Data not synced. Fetch /api/products and /api/products/variations first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
