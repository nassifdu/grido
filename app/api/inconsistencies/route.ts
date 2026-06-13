import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { analyzeInconsistencies } from "@/lib/inconsistencies";

export async function GET(req: NextRequest) {
  const userId = await getSession(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const sections = await analyzeInconsistencies();
    return NextResponse.json({ sections });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
