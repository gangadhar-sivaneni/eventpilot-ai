"use client";

import { useState, useTransition } from "react";
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { completePasswordSetup, signOut } from "@/app/actions";
import { RadarLoader } from "@/components/radar-loader";
import { sanitizeRedirectPath } from "@/lib/security";

interface SetPasswordFormProps {
  email: string;
  fullName: string;
  next: string;
}

export function SetPasswordForm({
  email,
  fullName,
  next = "/events",
}: SetPasswordFormProps) {
  const [, startTransition] = useTransition();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanNext = sanitizeRedirectPath(next, "/events");

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSymbol = /[\d\W]/.test(password);
  const strengthScore = [hasMinLength, hasLetter, hasNumberOrSymbol].filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    setBusy(true);

    startTransition(async () => {
      try {
        try {
          sessionStorage.setItem("show_post_login_push_prompt", "1");
        } catch {
          // ignore
        }
        await completePasswordSetup(password, cleanNext);
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "Failed to set password. Please try again.");
      }
    });
  }

  if (busy) {
    return (
      <div className="flex items-center justify-center py-12">
        <RadarLoader size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Info Pill */}
      <div className="rounded-xl border border-line bg-raised/70 p-3.5 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">Signed in with Google</p>
        <p className="mt-0.5 font-bold text-text">{email}</p>
        {fullName && <p className="text-xs text-dim">{fullName}</p>}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="create-password" className="field-label">New Password</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="create-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="field pl-10 pr-10"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-text"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1.5">
                <div className={`h-1 flex-1 rounded-full ${strengthScore >= 1 ? "bg-warn" : "bg-line"}`} />
                <div className={`h-1 flex-1 rounded-full ${strengthScore >= 2 ? "bg-signal" : "bg-line"}`} />
                <div className={`h-1 flex-1 rounded-full ${strengthScore >= 3 ? "bg-ok" : "bg-line"}`} />
              </div>
              <p className="text-[11px] text-faint">
                {strengthScore === 1
                  ? "Weak — consider adding numbers or special characters"
                  : strengthScore === 2
                  ? "Moderate password"
                  : "Strong password"}
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="field-label">Confirm Password</label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id="confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="field pl-10 pr-10"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-text"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || password.length < 8}
          className="btn btn-primary w-full shadow-sm"
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {busy ? "Saving password…" : "Save password & enter EventPilot"}
        </button>
      </form>

      {/* Non-skippable disclaimer & sign out escape hatch */}
      <div className="border-t border-line pt-4 text-center">
        <p className="text-xs text-faint">
          This step is mandatory so you can log in on other devices using your email and password without Google.
        </p>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-faint transition-colors hover:text-bad"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Cancel and sign out
          </button>
        </form>
      </div>
    </div>
  );
}
