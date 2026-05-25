import type { NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const EIGHT_HOURS = 8 * 60 * 60;
const enc = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64url(buf: ArrayBuffer | Uint8Array<ArrayBufferLike> | string): string {
  if (typeof buf === "string") return Buffer.from(buf).toString("base64url");
  return Buffer.from(buf as ArrayBuffer).toString("base64url");
}

export async function createSession(blingUserId: string): Promise<string> {
  const secret = process.env.SESSION_SECRET!;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(
    enc.encode(JSON.stringify({ sub: blingUserId, iat: now, exp: now + EIGHT_HOURS }))
  );
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function getSession(req: NextRequest): Promise<string | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("[session] SESSION_SECRET env var is not set");
    return null;
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    console.warn("[session] no session cookie found");
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    console.warn("[session] malformed token (not 3 parts)");
    return null;
  }
  const [header, payload, sig] = parts;

  const key = await importKey(secret);
  const sigBytes = Buffer.from(sig, "base64url");
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(`${header}.${payload}`)
  );
  if (!valid) {
    console.warn("[session] signature verification failed — SESSION_SECRET mismatch or tampered token");
    return null;
  }

  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Math.floor(Date.now() / 1000) > exp) {
      console.warn("[session] token expired");
      return null;
    }
    return sub as string;
  } catch {
    console.warn("[session] failed to parse payload");
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = EIGHT_HOURS;
