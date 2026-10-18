import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";

const PROTECTED = ["/profile", "/alerts", "/registrations", "/admin"];

// Refreshes the Supabase session cookie on every navigation and bounces signed-out users
// away from private pages. This is an optimistic check; pages re-verify with requireUser().
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const bounce = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  };
  const isProtected = PROTECTED.some((p) => path.startsWith(p));
  if (DEMO) return isProtected && request.cookies.get("demo_out") ? bounce() : NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  return !data?.claims && isProtected ? bounce() : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
