import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer: every private page and Server Action starts here.
export async function getUser() {
  const supabase = await createClient();
  // proxy.ts already verifies the session JWT. Verify it here as well, but avoid
  // an Auth-server user lookup on every page request; claims include the fields
  // this app reads (id, email, and app/user metadata).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user = claims?.sub
    ? {
        id: claims.sub,
        email: claims.email,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
      } as Pick<User, "id" | "email" | "app_metadata" | "user_metadata">
    : null;
  return { supabase, user };
}

export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");

  // Handle scheduled account deletion lifecycle
  const deletionDueAt = (user.user_metadata as Record<string, unknown> | undefined)?.deletion_due_at as string | undefined;
  if (deletionDueAt) {
    const isDue = new Date(deletionDueAt).getTime() <= Date.now();
    if (isDue) {
      // 5-day grace period expired without user login
      await supabase.rpc("delete_my_account");
      await supabase.auth.signOut();
      redirect("/?deleted=expired");
    } else {
      // User logged in within 5 days: automatically cancel the deletion request!
      await supabase.auth.updateUser({
        data: {
          deletion_scheduled_at: null,
          deletion_due_at: null,
        },
      });
      const cookieStore = await cookies();
      cookieStore.set("deletion_cancelled", "1", { path: "/", maxAge: 15 });
    }
  }

  const cookieStore = await cookies();
  if (cookieStore.get("needs_password")?.value === "1") {
    redirect("/auth/set-password");
  }
  return { supabase, user };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  if (user.app_metadata?.role !== "admin") redirect("/events");
  return { supabase, user };
}
