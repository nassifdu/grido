import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const userId = await getSession(request);
  if (!userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
