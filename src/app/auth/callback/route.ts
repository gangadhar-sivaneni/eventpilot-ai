import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type EmailOtpType } from "@supabase/supabase-js";
import { sanitizeRedirectPath } from "@/lib/security";

// Handles OAuth callbacks (?code=) and Email verification links (?token_hash= & type=)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const safeNext = sanitizeRedirectPath(searchParams.get("next"), "/events");
  const demoGoogle = searchParams.get("demo_google");

  if (demoGoogle) {
    const res = NextResponse.redirect(`${origin}/auth/set-password?next=${encodeURIComponent(safeNext)}`);
    res.cookies.delete("demo_out");
    res.cookies.set("demo_no_pw", "1", { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  }

  const cookieStore = await cookies();

  // Create initial redirect response object so cookies can be attached directly to it
  const targetUrl = `${origin}${safeNext}`;
  const response = NextResponse.redirect(targetUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 1. Handle OAuth or PKCE code exchange
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const hasPassword = Boolean(data.user.user_metadata?.has_password);
      if (!hasPassword) {
        const pwResponse = NextResponse.redirect(
          `${origin}/auth/set-password?next=${encodeURIComponent(safeNext)}`
        );
        // Transfer all authentication cookies to pwResponse
        response.cookies.getAll().forEach((cookie) => {
          pwResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        pwResponse.cookies.set("needs_password", "1", { path: "/", httpOnly: true, sameSite: "lax" });
        return pwResponse;
      }

      response.cookies.delete("needs_password");
      return response;
    }

    if (error) {
      console.error("Supabase OAuth exchangeCodeForSession error:", error);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message || "Could not complete Google sign in.")}`
      );
    }
  }

  // 2. Handle email OTP link verification (?token_hash=... or ?token=...)
  const resolvedToken = token_hash || searchParams.get("token");
  const resolvedType = (type ?? (searchParams.get("type") as EmailOtpType | null)) || "email";

  if (resolvedToken) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: resolvedType,
      token_hash: resolvedToken,
    });
    if (!error && data?.user) {
      const hasPassword = Boolean(data.user.user_metadata?.has_password);
      if (!hasPassword) {
        const pwResponse = NextResponse.redirect(
          `${origin}/auth/set-password?next=${encodeURIComponent(safeNext)}`
        );
        response.cookies.getAll().forEach((cookie) => {
          pwResponse.cookies.set(cookie.name, cookie.value, cookie);
        });
        pwResponse.cookies.set("needs_password", "1", { path: "/", httpOnly: true, sameSite: "lax" });
        return pwResponse;
      }

      response.cookies.delete("needs_password");
      return response;
    }

    if (error) {
      console.error("Supabase verifyOtp error:", error);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message || "Invalid or expired link.")}`
      );
    }
  }

  const errorDesc = searchParams.get("error_description") || searchParams.get("error");
  if (errorDesc) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDesc)}`);
  }

  // 3. Fallback for implicit URL hash redirects (#access_token=...&refresh_token=...)
  // Since browsers never transmit hash fragments to server route handlers, render
  // a lightweight client bridge to inspect window.location.hash.
  const bridgeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verifying EventPilot Authentication...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #faf6f0; color: #14110f; }
    .card { background: #fff; border: 2px solid #14110f; border-radius: 12px; padding: 28px 36px; box-shadow: 4px 4px 0 #14110f; text-align: center; max-width: 400px; }
    .spinner { display: inline-block; width: 28px; height: 28px; border: 3px solid #e4dbcf; border-top-color: #ff5a1f; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <div style="font-weight: 700; font-size: 17px; margin-bottom: 6px;">Verifying your link...</div>
    <div style="font-size: 13px; color: #6b6359;">Finalizing authentication, please wait a moment.</div>
  </div>
  <script>
    (function() {
      var hash = window.location.hash;
      if (hash && (hash.indexOf('access_token=') !== -1 || hash.indexOf('error_description=') !== -1)) {
        if (hash.indexOf('error_description=') !== -1) {
          var params = new URLSearchParams(hash.substring(1));
          var desc = params.get('error_description') || 'Authentication failed';
          window.location.replace('/login?error=' + encodeURIComponent(desc));
          return;
        }
        window.location.replace('/auth/set-password?next=${encodeURIComponent(safeNext)}' + hash);
        return;
      }
      window.location.replace('/login?error=sign_in_failed');
    })();
  </script>
</body>
</html>`;

  return new NextResponse(bridgeHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
