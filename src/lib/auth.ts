import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Data Access Layer: every private page and Server Action starts here.
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser(); // verified with the Auth server, not just the cookie
  return { supabase, user: data.user };
}

export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  if (user.app_metadata?.role !== "admin") redirect("/events");
  return { supabase, user };
}
