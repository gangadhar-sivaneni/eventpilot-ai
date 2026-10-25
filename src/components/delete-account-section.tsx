"use client";

import React, { useState } from "react";
import { Trash2, Lock, Eye, EyeOff, AlertTriangle, X } from "lucide-react";
import { scheduleAccountDeletion } from "@/app/profile/actions";

export function DeleteAccountSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-bad/30 bg-bad/5 p-5">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-bad" aria-hidden="true" />
          <p className="font-semibold text-text">Delete account</p>
        </div>
        <p className="mt-2 text-sm text-dim leading-relaxed">
          Requires password verification. Your account enters a <strong>5-day grace period</strong>.
          If this wasn&apos;t done by you or you change your mind, simply log in again anytime within 5 days to cancel.
        </p>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn btn-danger mt-4"
        >
          Request account deletion
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="card relative w-full max-w-lg border-2 border-text bg-surface p-6 shadow-[8px_8px_0_var(--text)] sm:p-8">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-dim hover:bg-raised hover:text-text transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-bad/10 text-bad border border-bad/30">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 id="delete-dialog-title" className="text-xl font-bold tracking-tight text-text">
                  Confirm Account Deletion
                </h3>
                <p className="text-xs text-faint">5-day scheduled deletion grace period</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-dim leading-relaxed space-y-1.5">
              <p className="font-semibold text-text">
                ⚠️ Your account will NOT be deleted immediately:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>It will take <strong>5 days</strong> to permanently delete your account and all saved data.</li>
                <li>If this was not done by you, or you change your mind, <strong>simply log in again anytime within 5 days to automatically cancel</strong> the deletion request.</li>
                <li>If you do not log in within 5 days, your account will be permanently erased.</li>
              </ul>
            </div>

            <form
              action={async (formData) => {
                setSubmitting(true);
                await scheduleAccountDeletion(formData);
                setSubmitting(false);
              }}
              className="mt-5 space-y-4"
            >
              <div>
                <label className="field-label block mb-1 text-xs font-semibold text-text">
                  Enter your current password to confirm:
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                    className="field pl-9 pr-10 text-sm"
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

              <label className="flex items-start gap-2.5 text-xs text-dim cursor-pointer">
                <input
                  type="checkbox"
                  name="confirm"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  required
                  className="check mt-0.5"
                />
                <span>
                  I understand this schedules my account for permanent deletion in 5 days, and I can log in anytime during this period to cancel it.
                </span>
              </label>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={submitting}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!password || !confirmed || submitting}
                  className="btn btn-danger"
                >
                  {submitting ? "Verifying password…" : "Confirm & Schedule Deletion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
