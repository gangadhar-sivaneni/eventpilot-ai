import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO } from "@/lib/demo";

const PROTECTED = ["/profile", "/alerts", "/registrations", "/admin"];

// Refreshes the Supabase session cookie on every navigation and bounces signed-out users
// away from private pages. This is an optimistic check; pages re-verify with requireUser().
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isCallbackPage = path.startsWith("/auth/callback");

  // Intercept OAuth or PKCE code parameters landing on root "/" or other pages
  // and forward them directly to the callback route handler so the session exchange executes!
  if ((request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("token_hash")) && !isCallbackPage) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    return NextResponse.redirect(callbackUrl);
  }

  const bounce = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  };
  const isProtected = PROTECTED.some((p) => path.startsWith(p));
  const isSetPasswordPage = path.startsWith("/auth/set-password");
  const isLoginPage = path.startsWith("/login");

  if (DEMO) {
    const demoOut = Boolean(request.cookies.get("demo_out"));
    const needsPassword = Boolean(request.cookies.get("needs_password"));

    if (demoOut) {
      if (isProtected || isSetPasswordPage) return bounce();
      return NextResponse.next();
    }

    // Demo user is signed in
    if (needsPassword && !isSetPasswordPage && !isCallbackPage && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/set-password";
      url.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

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
  const claims = data?.claims;
  const isUser = Boolean(claims);

  if (!isUser) {
    if (isProtected || isSetPasswordPage) return bounce();
    return response;
  }

  // Authenticated user: verify if mandatory Google password setup is pending
  const needsPassword = request.cookies.get("needs_password")?.value === "1";
  if (needsPassword && !isSetPasswordPage && !isCallbackPage && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/set-password";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
