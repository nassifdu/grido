import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: NextRequest) {
  // 303 converts the POST to a GET redirect (correct for form submissions)
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
