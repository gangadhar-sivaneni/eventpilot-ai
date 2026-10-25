"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, ShieldAlert, X, LogIn } from "lucide-react";
import Link from "next/link";

export function DeletionScheduledPopup() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const isScheduled = searchParams.get("scheduled_delete") === "1";
  const isOpen = isScheduled && !dismissed;

  const dueParam = searchParams.get("due");
  const dueDateString = useMemo(() => {
    if (!dueParam) return null;
    try {
      const d = new Date(dueParam);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [dueParam]);

  function handleClose() {
    setDismissed(true);
    // Remove query params cleanly from URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete("scheduled_delete");
    url.searchParams.delete("due");
    window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.search}` : ""));
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scheduled-popup-title"
    >
      <div className="card relative w-full max-w-md border-2 border-text bg-surface p-6 shadow-[8px_8px_0_var(--text)] sm:p-7">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-dim hover:bg-raised hover:text-text transition-colors"
          aria-label="Close message"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/30">
            <Clock className="h-6 w-6 animate-pulse" />
          </span>
          <div>
            <h3 id="scheduled-popup-title" className="text-xl font-bold tracking-tight text-text">
              Account Deletion Scheduled
            </h3>
            <p className="text-xs font-semibold text-amber-600">5-day grace period active</p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm text-dim leading-relaxed">
          <p>
            Your account has been scheduled for permanent deletion.
            {dueDateString ? (
              <> It will take <strong>5 days</strong> (scheduled for <strong>{dueDateString}</strong>) to permanently remove your account.</>
            ) : (
              <> It will take <strong>5 days</strong> to permanently remove your account and all data.</>
            )}
          </p>

          <div className="rounded-xl border border-line bg-raised/80 p-3.5 text-xs text-text space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-accent">
              <ShieldAlert className="h-4 w-4" />
              <span>Change your mind or not done by you?</span>
            </div>
            <p className="text-dim">
              If you are interested in keeping your account, or if this request was not done by you, <strong>simply log in again anytime within these 5 days to automatically cancel the deletion request</strong>.
            </p>
            <p className="text-faint text-[11px]">
              If you do not log in within this time, your account and all data will be permanently erased.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost text-xs"
          >
            I understand
          </button>
          <Link
            href="/login"
            onClick={handleClose}
            className="btn btn-primary text-xs flex items-center justify-center gap-1.5"
          >
            <LogIn className="h-4 w-4" />
            Log in to cancel deletion
          </Link>
        </div>
      </div>
    </div>
  );
}
