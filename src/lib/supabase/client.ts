import { createBrowserClient } from "@supabase/ssr";

// Browser client: only the publishable key, never the secret key.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://demo.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "demo-anon-key";
  return createBrowserClient(url, key);
}
