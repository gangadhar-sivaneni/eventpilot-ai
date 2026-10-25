"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  Lock,
  User,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEMO } from "@/lib/demo-flag";
import { demoSignIn, demoSignInGoogle } from "@/app/actions";
import { GoogleMark } from "@/components/google-mark";

export type AuthMode = "login" | "signup";
export type SignupStep = 1 | 2 | 3;

interface AuthViewProps {
  next?: string;
  defaultMode?: AuthMode;
  onSuccess?: () => void;
  title?: string;
}

export function AuthView({
  next = "/events",
  defaultMode = "login",
  onSuccess,
  title,
}: AuthViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [signupStep, setSignupStep] = useState<SignupStep>(1);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // OTP resend timer
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const cleanNext = next.startsWith("/") && !next.startsWith("//") ? next : "/events";

  function switchMode(newMode: AuthMode) {
    setMode(newMode);
    setSignupStep(1);
    setError(null);
    setInfo(null);
  }

  // Handle Google OAuth
  async function handleGoogleSignIn() {
    setError(null);
    setBusy(true);
    if (DEMO) {
      return demoSignInGoogle(cleanNext);
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(cleanNext)}`;
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (err) {
      setError(err.message || "Failed to initiate Google sign-in. Please try again.");
      setBusy(false);
    }
  }

  // Handle email + password login
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setBusy(true);

    if (DEMO) {
      startTransition(async () => {
        await demoSignIn(cleanNext);
        onSuccess?.();
      });
      return;
    }

    const supabase = createClient();
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (err) {
      setBusy(false);
      setError(err.message === "Invalid login credentials"
        ? "Invalid email or password. Please verify your details."
        : err.message);
      return;
    }

    // Check if user has set a password or needs mandatory setup
    const hasPassword = Boolean(data.user?.user_metadata?.has_password);
    setBusy(false);

    if (!hasPassword) {
      router.push(`/auth/set-password?next=${encodeURIComponent(cleanNext)}`);
      return;
    }

    onSuccess?.();
    router.push(cleanNext);
    router.refresh();
  }

  // Signup Step 1: Submit basic details & send OTP
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setBusy(true);

    if (DEMO) {
      setBusy(false);
      setSignupStep(2);
      setResendCooldown(30);
      setInfo("Demo mode: enter verification code 123456 to continue.");
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: true,
        data: { full_name: trimmedName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(cleanNext)}`,
      },
    });

    setBusy(false);
    if (err) {
      setError(err.message || "Failed to send verification code. Please try again.");
      return;
    }

    setSignupStep(2);
    setResendCooldown(30);
    setInfo(`A 6-digit verification code was sent to ${trimmedEmail}.`);
  }

  // Signup Step 2: Handle OTP input
  function handleOtpChange(index: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-advance to next input
    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);
    const targetIdx = Math.min(pasted.length, 5);
    otpInputRefs.current[targetIdx]?.focus();
  }

  // Verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const token = otp.join("").trim();
    if (token.length !== 6) {
      setError("Please enter the full 6-digit verification code.");
      return;
    }

    setBusy(true);

    if (DEMO) {
      setBusy(false);
      setSignupStep(3);
      setInfo("Email verified! Now create a password for your account.");
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });

    setBusy(false);
    if (err) {
      setError(err.message === "Token has expired or is invalid"
        ? "Invalid or expired verification code. Please check and try again."
        : err.message);
      return;
    }

    setSignupStep(3);
    setInfo("Email verified! Now create a password for your account.");
  }

  // Signup Step 3: Create password & finish
  async function handleCreatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setBusy(true);

    if (DEMO) {
      startTransition(async () => {
        await demoSignIn(cleanNext);
        onSuccess?.();
      });
      return;
    }

    const supabase = createClient();
    const { data, error: err } = await supabase.auth.updateUser({
      password,
      data: {
        full_name: fullName.trim(),
        has_password: true,
      },
    });

    if (err) {
      setBusy(false);
      setError(err.message || "Failed to set password. Please try again.");
      return;
    }

    // Also update profile row with name if available
    if (data.user?.id && fullName.trim()) {
      await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("user_id", data.user.id);
    }

    setBusy(false);
    onSuccess?.();
    router.push(cleanNext);
    router.refresh();
  }

  // Resend OTP handler
  async function handleResendOtp() {
    if (resendCooldown > 0 || busy) return;
    setError(null);
    setBusy(true);

    if (DEMO) {
      setBusy(false);
      setResendCooldown(30);
      setInfo("New verification code sent! (Demo code: 123456)");
      return;
    }

    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(cleanNext)}`,
      },
    });

    setBusy(false);
    if (err) {
      setError(err.message || "Failed to resend code.");
      return;
    }

    setResendCooldown(30);
    setInfo(`New verification code sent to ${email.trim()}.`);
  }

  // Password strength calculation
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSymbol = /[\d\W]/.test(password);
  const passwordStrengthScore = [hasMinLength, hasLetter, hasNumberOrSymbol].filter(Boolean).length;

  return (
    <div className="w-full">
      {/* Mode Switcher Tabs */}
      <div className="mb-6 flex rounded-xl border border-line bg-raised p-1" role="tablist" aria-label="Authentication modes">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => switchMode("login")}
          className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all ${
            mode === "login"
              ? "bg-text text-ink shadow-sm"
              : "text-dim hover:text-text"
          }`}
        >
          Log in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => switchMode("signup")}
          className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-all ${
            mode === "signup"
              ? "bg-text text-ink shadow-sm"
              : "text-dim hover:text-text"
          }`}
        >
          Create account
        </button>
      </div>

      {/* Header Info */}
      <div className="mb-5 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-text">
          {title || (mode === "login" ? "Welcome back to EventPilot" : "Join EventPilot")}
        </h2>
        <p className="mt-1 text-sm text-dim">
          {mode === "login"
            ? "Log in with your email & password, or use Google."
            : signupStep === 1
            ? "Enter your basic details to get started. No full forms required."
            : signupStep === 2
            ? "Verify your email to secure your account."
            : "Create your password so you can log in on any device."}
        </p>
      </div>

      {/* Error & Info Alerts */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      {info && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-signal/30 bg-signal/10 p-3 text-sm text-dim"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-signal" aria-hidden="true" />
          <p className="flex-1 font-medium">{info}</p>
        </div>
      )}

      {/* ─────────────────── LOGIN FORM ─────────────────── */}
      {mode === "login" && (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="field-label flex items-center justify-between">
              <span>Email address</span>
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="field pl-10"
                disabled={busy}
              />
            </div>
          </div>

          <div>
            <div className="field-label flex items-center justify-between">
              <label htmlFor="login-password">Password</label>
              <button
                type="button"
                onClick={() => {
                  switchMode("signup");
                  setSignupStep(1);
                  setInfo("Enter your email to verify and reset your account.");
                }}
                className="text-xs font-semibold text-accent hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary w-full shadow-sm"
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            {busy ? "Logging in…" : "Log in"}
          </button>

          {/* Social Divider */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="w-full border-t border-line" />
            <span className="absolute bg-surface px-3 text-xs font-medium text-faint">
              or continue with
            </span>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="btn btn-ghost w-full"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <p className="mt-4 text-center text-xs text-dim">
            Don&apos;t have an account yet?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="font-semibold text-accent hover:underline"
            >
              Sign up
            </button>
          </p>
        </form>
      )}

      {/* ─────────────────── SIGN UP FLOW ─────────────────── */}
      {mode === "signup" && (
        <div>
          {/* Step indicators */}
          <div className="mb-5 flex items-center justify-between text-xs font-semibold text-faint">
            <div className={`flex items-center gap-1.5 ${signupStep >= 1 ? "text-text" : ""}`}>
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
                signupStep > 1 ? "bg-ok text-surface" : signupStep === 1 ? "bg-signal text-signal-ink" : "bg-raised text-faint"
              }`}>
                {signupStep > 1 ? "✓" : "1"}
              </span>
              <span>Details</span>
            </div>
            <div className="h-0.5 flex-1 mx-2 bg-line" />
            <div className={`flex items-center gap-1.5 ${signupStep >= 2 ? "text-text" : ""}`}>
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
                signupStep > 2 ? "bg-ok text-surface" : signupStep === 2 ? "bg-signal text-signal-ink" : "bg-raised text-faint"
              }`}>
                {signupStep > 2 ? "✓" : "2"}
              </span>
              <span>Verify OTP</span>
            </div>
            <div className="h-0.5 flex-1 mx-2 bg-line" />
            <div className={`flex items-center gap-1.5 ${signupStep >= 3 ? "text-text" : ""}`}>
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
                signupStep === 3 ? "bg-signal text-signal-ink" : "bg-raised text-faint"
              }`}>
                3
              </span>
              <span>Password</span>
            </div>
          </div>

          {/* Step 1: Basic details only */}
          {signupStep === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="signup-name" className="field-label">Full name</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="signup-name"
                    type="text"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="field pl-10"
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-email" className="field-label">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="field pl-10"
                    disabled={busy}
                  />
                </div>
                <p className="mt-1 text-xs text-faint">
                  We will send a 6-digit OTP code to verify this email address.
                </p>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary w-full shadow-sm"
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                {busy ? "Sending verification code…" : "Send verification code"}
              </button>

              {/* Social Divider */}
              <div className="relative my-4 flex items-center justify-center">
                <div className="w-full border-t border-line" />
                <span className="absolute bg-surface px-3 text-xs font-medium text-faint">
                  or sign up with
                </span>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="btn btn-ghost w-full"
              >
                <GoogleMark />
                Sign in with Google
              </button>

              <p className="mt-4 text-center text-xs text-dim">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-semibold text-accent hover:underline"
                >
                  Log in
                </button>
              </p>
            </form>
          )}

          {/* Step 2: OTP verification */}
          {signupStep === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-xl border border-line bg-raised/60 p-3 text-sm text-dim">
                <p className="font-semibold text-text">Verify your email</p>
                <p className="text-xs text-faint">
                  Enter the 6-digit code sent to <strong className="text-text">{email}</strong>, or click the confirmation link in the email.
                </p>
              </div>

              <div>
                <label className="field-label text-center">6-Digit Code</label>
                <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      className="h-12 w-11 rounded-xl border-2 border-line bg-surface text-center font-mono text-xl font-bold text-text transition-colors focus:border-text focus:outline-none focus:ring-2 focus:ring-signal sm:h-13 sm:w-12"
                      disabled={busy}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || otp.join("").length !== 6}
                className="btn btn-primary w-full shadow-sm"
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                {busy ? "Verifying…" : "Verify code & continue"}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs text-dim">
                <button
                  type="button"
                  onClick={() => {
                    setSignupStep(1);
                    setOtp(["", "", "", "", "", ""]);
                    setError(null);
                  }}
                  className="flex items-center gap-1 text-faint hover:text-text"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Edit email
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || busy}
                  className="font-semibold text-accent hover:underline disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Create password */}
          {signupStep === 3 && (
            <form onSubmit={handleCreatePassword} className="space-y-4">
              <div className="rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Email verified successfully
                </div>
                <p className="mt-0.5 text-xs text-dim">
                  Now set a secure password so you can sign in directly anytime.
                </p>
              </div>

              <div>
                <label htmlFor="signup-password" className="field-label">Create password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
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

                {/* Password strength indicator */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1.5">
                      <div className={`h-1 flex-1 rounded-full ${passwordStrengthScore >= 1 ? "bg-warn" : "bg-line"}`} />
                      <div className={`h-1 flex-1 rounded-full ${passwordStrengthScore >= 2 ? "bg-signal" : "bg-line"}`} />
                      <div className={`h-1 flex-1 rounded-full ${passwordStrengthScore >= 3 ? "bg-ok" : "bg-line"}`} />
                    </div>
                    <p className="text-[11px] text-faint">
                      {passwordStrengthScore === 1
                        ? "Weak password"
                        : passwordStrengthScore === 2
                        ? "Moderate password"
                        : "Strong password"}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="signup-confirm-password" className="field-label">Confirm password</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
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
                disabled={busy}
                className="btn btn-primary w-full shadow-sm"
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                {busy ? "Finishing setup…" : "Complete registration & log in"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
