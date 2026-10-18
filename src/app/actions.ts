"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  if (DEMO) (await cookies()).set("demo_out", "1", { path: "/", httpOnly: true, sameSite: "lax" });
  else await (await createClient()).auth.signOut();
  redirect("/");
}

// Demo mode only: "signing in" just clears the signed-out cookie.
export async function demoSignIn(next: string) {
  if (!DEMO) return;
  (await cookies()).delete("demo_out");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/events");
}
