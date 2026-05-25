import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const blingUserId = await getSession(request);
  if (!blingUserId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { data, error } = await getSupabase()
    .from("sync_metadata")
    .select("*")
    .eq("bling_user_id", blingUserId)
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ status: "idle", last_sync_at: null, error_message: null }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
