import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { analyzeInconsistencias } from "@/lib/inconsistencias";

export async function GET(req: NextRequest) {
  const userId = await getSession(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sections = await analyzeInconsistencias();
    return NextResponse.json({ sections });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
