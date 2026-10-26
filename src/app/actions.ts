"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/security";

export async function signOut() {
  const store = await cookies();
  store.delete("needs_password");
  if (DEMO) {
    store.set("demo_out", "1", { path: "/", httpOnly: true, sameSite: "lax" });
    store.delete("demo_no_pw");
  } else {
    await (await createClient()).auth.signOut();
  }
  redirect("/");
}

// Demo mode only: "signing in" just clears the signed-out cookie.
export async function demoSignIn(next: string) {
  if (!DEMO) return;
  const store = await cookies();
  store.delete("demo_out");
  store.delete("demo_no_pw");
  store.delete("needs_password");
  redirect(sanitizeRedirectPath(next, "/"));
}

// Demo mode Google sign-in: sets demo_no_pw cookie so mandatory password flow is triggered
export async function demoSignInGoogle(next: string) {
  if (!DEMO) return;
  const store = await cookies();
  store.delete("demo_out");
  store.set("demo_no_pw", "1", { path: "/", httpOnly: true, sameSite: "lax" });
  store.set("needs_password", "1", { path: "/", httpOnly: true, sameSite: "lax" });
  const safeNext = sanitizeRedirectPath(next, "/");
  redirect(`/auth/set-password?next=${encodeURIComponent(safeNext)}`);
}

// Demo mode set-password completion: clears demo_no_pw cookie
export async function demoSetPassword(next: string) {
  if (!DEMO) return;
  const store = await cookies();
  store.delete("demo_no_pw");
  store.delete("needs_password");
  store.delete("demo_out");
  redirect(sanitizeRedirectPath(next, "/"));
}

// Server action to complete password setup and clear needs_password cookie
export async function completePasswordSetup(password: string, next: string) {
  const store = await cookies();
  store.delete("needs_password");
  store.delete("demo_no_pw");

  if (!DEMO) {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: { has_password: true },
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  redirect(sanitizeRedirectPath(next, "/"));
}
