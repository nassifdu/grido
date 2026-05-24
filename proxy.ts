import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const blingUserId = await getSession(request);
  if (!blingUserId) {
    return NextResponse.redirect(new URL("/api/auth/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/bling/:path*"],
};
