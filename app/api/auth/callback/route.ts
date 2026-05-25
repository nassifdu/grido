import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { saveBlingTokens } from "@/lib/bling";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const base = new URL("/", request.url);

  const oauthError = searchParams.get("error");
  if (oauthError) {
    const desc = searchParams.get("error_description") ?? oauthError;
    console.error("[callback] OAuth error:", desc);
    return NextResponse.redirect(new URL("/?error=oauth", base));
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?error=missing_code", base));
  }

  const state = searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=invalid_state", base));
  }

  const verifier = request.cookies.get("pkce_verifier")?.value;
  if (!verifier) {
    return NextResponse.redirect(new URL("/?error=missing_verifier", base));
  }

  const { BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REDIRECT_URI } = process.env;
  if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET || !BLING_REDIRECT_URI) {
    return NextResponse.json({ error: "Missing Bling env vars" }, { status: 500 });
  }

  const credentials = Buffer.from(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`).toString("base64");

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: BLING_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[callback] token exchange failed:", tokenRes.status, body);
    return NextResponse.redirect(new URL("/?error=token_exchange", base));
  }

  const tokenJson = await tokenRes.json();
  const { access_token, refresh_token, expires_in, scope } = tokenJson;

  // Bling encodes the authorized account IDs as space-separated values in `scope`.
  // The first value is the primary account ID — used as the stable user identifier.
  const blingUserId = String(scope ?? "").split(" ")[0];

  if (!blingUserId) {
    console.error("[callback] could not extract user ID from token scope", tokenJson);
    return NextResponse.redirect(new URL("/?error=no_user_id", base));
  }

  await saveBlingTokens(blingUserId, access_token, refresh_token, expires_in ?? 3600);

  const sessionToken = await createSession(blingUserId);
  const cookieStore = await cookies();

  cookieStore.delete("pkce_verifier");
  cookieStore.delete("oauth_state");
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
