import { getSupabase } from "./supabase";
import { encrypt, decrypt } from "./crypto";

const BLING_BASE = "https://www.bling.com.br/Api/v3";

export async function getBlingTokens(blingUserId: string) {
  const { data, error } = await getSupabase()
    .from("bling_tokens")
    .select("access_token_enc, refresh_token_enc, expires_at")
    .eq("bling_user_id", blingUserId)
    .single();

  if (error || !data) return null;

  return {
    accessToken: decrypt(data.access_token_enc),
    refreshToken: decrypt(data.refresh_token_enc),
    expiresAt: new Date(data.expires_at),
  };
}

export async function saveBlingTokens(
  blingUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const { error } = await getSupabase().from("bling_tokens").upsert(
    {
      bling_user_id: blingUserId,
      access_token_enc: encrypt(accessToken),
      refresh_token_enc: encrypt(refreshToken),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "bling_user_id" }
  );
  if (error) throw new Error(`saveBlingTokens: ${error.message}`);
}

export async function refreshBlingTokens(blingUserId: string): Promise<string> {
  const tokens = await getBlingTokens(blingUserId);
  if (!tokens) throw Object.assign(new Error("No tokens found for user"), { status: 401 });

  const credentials = Buffer.from(
    `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${BLING_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[bling] refresh failed ${res.status}:`, body);
    // Token expired or revoked — purge from DB so user is forced to re-login
    await getSupabase().from("bling_tokens").delete().eq("bling_user_id", blingUserId);
    throw Object.assign(new Error("Refresh token expired or revoked"), { status: 401 });
  }

  const { access_token, refresh_token, expires_in } = await res.json();
  await saveBlingTokens(blingUserId, access_token, refresh_token, expires_in ?? 3600);
  return access_token as string;
}

export async function blingFetch(
  blingUserId: string,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const tokens = await getBlingTokens(blingUserId);
  if (!tokens) throw Object.assign(new Error("No tokens"), { status: 401 });

  const needsRefresh = tokens.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  const accessToken = needsRefresh
    ? await refreshBlingTokens(blingUserId)
    : tokens.accessToken;

  const res = await fetch(`${BLING_BASE}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[blingFetch] ${path} → ${res.status}`, body);
  }

  return res;
}
