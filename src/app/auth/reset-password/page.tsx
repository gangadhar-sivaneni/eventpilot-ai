import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck, CircleCheck } from "lucide-react";
import { getUser } from "@/lib/auth";
import { AuthView } from "@/components/auth-view";
import { Logo } from "@/components/logo";
import { sanitizeRedirectPath } from "@/lib/security";

export const metadata: Metadata = {
  title: "Reset Password - EventPilot",
  description: "Reset your EventPilot account password securely using email verification.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { user } = await getUser();
  const params = await searchParams;
  const safeNext = sanitizeRedirectPath(params.next, "/");

  if (user) {
    redirect(safeNext);
  }

  return (
    <div className="shell flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center py-10 md:py-16">
      <div className="w-full max-w-md">
        <div className="card border-2 border-text bg-surface p-6 shadow-[8px_8px_0_var(--text)] sm:p-8">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>

          <AuthView
            next={safeNext}
            defaultMode="reset"
          />
        </div>

        {/* Brand Guarantees */}
        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-faint">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Verified secure reset
          </span>
          <span className="flex items-center gap-1.5">
            <CircleCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            One-time 8-digit verification
          </span>
        </div>
      </div>
    </div>
  );
}
