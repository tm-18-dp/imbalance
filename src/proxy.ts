import { NextResponse, type NextRequest } from "next/server";
import { isLocalHost } from "@/lib/local-host";

/**
 * Only answers requests addressed to this computer. Without this, a website using DNS
 * rebinding could read your tracker and prices, or save API keys, through the browser.
 */
export function proxy(req: NextRequest) {
  if (!isLocalHost(req.headers.get("host"))) {
    return new NextResponse(
      "Blocked: Imbalance only answers on localhost, 127.0.0.1 or [::1].",
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
