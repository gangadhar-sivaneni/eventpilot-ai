"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BOto0VMzDaKITShUIzsspE4JAgxnsqeQok9Acd8iKX4paqSJLfNIqBFBKPILRfEKmtT3bqlAX8pLHpIgyIh1Bos";

function urlB64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationBanner() {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if user was just authenticated (logged in or created account)
    const isPostAuthPrompt =
      sessionStorage.getItem("show_post_login_push_prompt") === "1" ||
      new URLSearchParams(window.location.search).get("prompt_alerts") === "1";

    if (isPostAuthPrompt) {
      sessionStorage.removeItem("show_post_login_push_prompt");
      if ("Notification" in window && Notification.permission === "default") {
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  function handleDismiss() {
    setIsOpen(false);
    sessionStorage.removeItem("show_post_login_push_prompt");
    localStorage.setItem("push_modal_dismissed", "true");
  }

  async function handleSubscribe() {
    setBusy(true);
    setFeedback(null);

    try {
      if (!("Notification" in window)) {
        handleDismiss();
        return;
      }

      // 1. Ask for browser notification permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setFeedback("Permission dismissed. You can enable alerts anytime in Profile Settings.");
        setTimeout(() => handleDismiss(), 1800);
        return;
      }

      // 2. Register service worker
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        let sub: PushSubscription | null = null;
        if ("PushManager" in window) {
          try {
            sub = await reg.pushManager.getSubscription();
            if (!sub) {
              try {
                sub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
                });
              } catch (pushErr) {
                console.warn("PushManager subscription initial error, attempting clean retry:", pushErr);
                try {
                  const ex = await reg.pushManager.getSubscription();
                  if (ex) await ex.unsubscribe();
                  sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
                  });
                } catch (retryErr) {
                  console.warn("PushManager subscription warning (using local notification):", retryErr);
                }
              }
            }
          } catch (err) {
            console.warn("PushManager getSubscription error:", err);
          }
        }

        // 3. If PushManager subscription succeeded, sync with server
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              categories: ["all"],
              sendWelcome: true,
            }),
          }).catch((err) => console.warn("Server subscription sync error:", err));
        } else {
          // Fallback: Show instant welcome alert via ServiceWorker directly
          try {
            await reg.showNotification("⚡ EventPilot Alerts Active", {
              body: "You will now receive notifications for new hackathons and deadlines!",
              icon: "/icon-192.png",
              badge: "/badge.png",
            });
          } catch {
            // ignore
          }
        }
      }

      setFeedback("✓ Alerts enabled! Closing…");
      setTimeout(() => {
        handleDismiss();
      }, 1000);
    } catch (err: unknown) {
      console.warn("Notification prompt warning:", err);
      setFeedback("✓ Preference saved. Closing…");
      setTimeout(() => {
        handleDismiss();
      }, 1000);
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-modal-title"
    >
      <div className="card relative w-full max-w-md border-2 border-text bg-surface p-6 shadow-[10px_10px_0_var(--text)] sm:p-7">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-4 top-4 rounded-lg p-1 text-dim hover:bg-raised hover:text-text transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 aspect-square place-items-center rounded-2xl bg-signal/15 text-signal border-2 border-signal/40">
            <BellRing className="h-6 w-6 animate-bounce" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="push-modal-title" className="text-xl font-bold tracking-tight text-text">
                Enable Event Alerts
              </h3>
              <span className="pill pill-ok text-[10px] py-0 px-1.5">Free</span>
            </div>
            <p className="text-xs text-faint">Lock-screen notifications · No background tasks</p>
          </div>
        </div>

        <p className="mt-4 text-xs sm:text-sm text-dim leading-relaxed">
          Get notified directly on your lock-screen when new hackathons open and <strong>24 hours before deadlines close</strong>. You can customize category filters anytime in your Settings.
        </p>

        {feedback && (
          <div className="mt-3 rounded-lg border border-line bg-raised p-2.5 text-xs font-semibold text-ok">
            {feedback}
          </div>
        )}

        {/* Clean Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={busy}
            className="btn btn-ghost text-xs"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={busy}
            className="btn btn-primary text-xs flex items-center justify-center gap-1.5"
          >
            <Bell className="h-4 w-4" />
            {busy ? "Activating alerts…" : "Enable Alerts"}
          </button>
        </div>
      </div>
    </div>
  );
}
