import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.BLING_CLIENT_ID;
  const redirectUri = process.env.BLING_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "BLING_CLIENT_ID and BLING_REDIRECT_URI must be set" },
      { status: 500 }
    );
  }

  // PKCE: generate verifier and SHA-256 challenge
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  // Scopes are registered in the Bling developer panel — verify them there before deploying.
  // Common scopes: produtos, estoques, pedidos, contatos, notasfiscais, etc.
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    `https://www.bling.com.br/Api/v3/oauth/authorize?${params}`
  );

  res.cookies.set("pkce_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  return res;
}
