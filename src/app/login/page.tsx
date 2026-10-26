import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, Lock, CircleCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import { AuthView } from "@/components/auth-view";
import { Logo } from "@/components/logo";
import { sanitizeRedirectPath } from "@/lib/security";

export const metadata: Metadata = {
  title: "Log in or Create Account",
  description: "Sign in to EventPilot to watch hackathons, manage alerts, and approve automated registrations.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string; error?: string }>;
}) {
  const { user } = await getUser();
  const params = await searchParams;
  const safeNext = sanitizeRedirectPath(params.next, "/");

  if (user) {
    if (!user.user_metadata?.has_password) {
      redirect(`/auth/set-password?next=${encodeURIComponent(safeNext)}`);
    }
    redirect(safeNext);
  }

  const defaultMode = params.mode === "signup" ? "signup" : params.mode === "reset" ? "reset" : "login";

  return (
    <div className="shell flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center py-10 md:py-16">
      <div className="w-full max-w-md">
        <div className="card border-2 border-text bg-surface p-6 shadow-[8px_8px_0_var(--text)] sm:p-8">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>

          {params.error === "sign_in_failed" && (
            <div className="mb-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-center text-sm text-bad">
              Google sign-in was cancelled or encountered an error. Please try again.
            </div>
          )}

          <AuthView
            next={safeNext}
            defaultMode={defaultMode}
          />
        </div>

        {/* Brand Guarantees */}
        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Human approval required
          </span>
          <span className="flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            100% verified events
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Private & encrypted
          </span>
        </div>
      </div>
    </div>
  );
}
