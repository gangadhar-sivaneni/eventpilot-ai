import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DEMO, demoClient } from "@/lib/demo";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function real(cookieStore: CookieStore) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, where cookies are read-only; proxy.ts refreshes them instead.
          }
        },
      },
    },
  );
}

// Server client acting as the signed-in user, so RLS applies to every query.
// Without real keys it is the in-memory demo client (see lib/demo.ts).
export async function createClient(): Promise<ReturnType<typeof real>> {
  const cookieStore = await cookies();
  if (DEMO) return demoClient(!cookieStore.get("demo_out")) as unknown as ReturnType<typeof real>;
  return real(cookieStore);
}
