"use client";

import { useEffect } from "react";

/**
 * Client-side fallback: if an OAuth provider redirects to "/" or any other page
 * with ?code= or ?token_hash= instead of /auth/callback, this automatically forwards
 * the browser to /auth/callback so the PKCE authorization code exchange completes.
 */
export function OAuthCallbackForwarder() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (
      (url.searchParams.has("code") || url.searchParams.has("token_hash")) &&
      !url.pathname.startsWith("/auth/callback")
    ) {
      url.pathname = "/auth/callback";
      window.location.replace(url.toString());
    }
  }, []);

  return null;
}
