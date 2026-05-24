import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { blingFetch } from "@/lib/bling";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const blingUserId = await getSession(request);
  if (!blingUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { resource: string; params?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { resource, params } = body;
  if (!resource) {
    return NextResponse.json({ error: "Missing resource" }, { status: 400 });
  }

  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await blingFetch(blingUserId, `/${resource}${qs}`);

  if (!res.ok) {
    return NextResponse.json({ error: "Bling API error" }, { status: res.status });
  }

  const json = await res.json();
  const items: unknown[] = Array.isArray(json.data) ? json.data : [json.data];

  // Each resource maps to its own Supabase table (created per feature, not here).
  // The table must have an `id` column matching Bling's resource ID for upsert to work.
  const { error } = await getSupabase()
    .from(resource)
    .upsert(items as Record<string, unknown>[], { onConflict: "id" });

  if (error) {
    console.error(`[sync] upsert error for "${resource}":`, error.message);
    return NextResponse.json({ error: "Failed to persist data" }, { status: 500 });
  }

  return NextResponse.json({ synced: items.length, data: items });
}
