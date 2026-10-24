import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldAlert } from "lucide-react";
import { getUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Create Password (Required)",
  description: "Set a password for your EventPilot account to enable cross-device login.",
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user } = await getUser();
  const params = await searchParams;
  const next = params.next ?? "/events";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/events";

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(safeNext)}`);
  }

  // If the user already has a password set, do not show this page
  if (user.user_metadata?.has_password === true) {
    redirect(safeNext);
  }

  const email = user.email ?? "";
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <div className="shell flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center py-10 md:py-16">
      <div className="w-full max-w-md">
        {/* Important notice banner */}
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-signal/40 bg-signal/10 px-4 py-3 text-xs font-semibold text-text">
          <ShieldAlert className="h-4 w-4 flex-none text-accent" aria-hidden="true" />
          <span>Mandatory Account Setup · One-time step</span>
        </div>

        <div className="card border-2 border-text bg-surface p-6 shadow-[8px_8px_0_var(--text)] sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <Logo />
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-raised text-text">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-text">
              Create your password
            </h1>
            <p className="mt-1 text-sm text-dim">
              You just signed in with Google. Set a password now so you can log into EventPilot with your email and password from other devices without needing Google.
            </p>
          </div>

          <SetPasswordForm
            email={email}
            fullName={fullName}
            next={safeNext}
          />
        </div>
      </div>
    </div>
  );
}
