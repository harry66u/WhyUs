import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  await destroySession();
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
