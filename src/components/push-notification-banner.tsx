"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellRing, Check, X, Shield, Sparkles } from "lucide-react";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BOto0VMzDaKITShUIzsspE4JAgxnsqeQok9Acd8iKX4paqSJLfNIqBFBKPILRfEKmtT3bqlAX8pLHpIgyIh1Bos";

export const PUSH_CATEGORIES = [
  { id: "all", label: "All Events" },
  { id: "ai", label: "AI & Machine Learning" },
  { id: "web3", label: "Web3 & Blockchain" },
  { id: "opensource", label: "Open Source" },
  { id: "appdev", label: "Mobile & Web Dev" },
  { id: "student", label: "College & Student" },
  { id: "prize", label: "Cash Prize Hackathons" },
];

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
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["all"]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDismissed = localStorage.getItem("push_modal_dismissed") === "true";
      if (isDismissed) {
        setDismissed(true);
      }

      if ("serviceWorker" in navigator && "PushManager" in window) {
        setSupported(true);
        setPermission(Notification.permission);

        // Check if already subscribed
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            if (sub) {
              setSubscribed(true);
            }
          })
          .catch((err) => {
            console.warn("ServiceWorker init error:", err);
          });
      }
    }
  }, []);

  function toggleCategory(catId: string) {
    if (catId === "all") {
      setSelectedCategories(["all"]);
      return;
    }
    const filtered = selectedCategories.filter((c) => c !== "all");
    if (filtered.includes(catId)) {
      const next = filtered.filter((c) => c !== catId);
      setSelectedCategories(next.length === 0 ? ["all"] : next);
    } else {
      setSelectedCategories([...filtered, catId]);
    }
  }

  async function handleSubscribe() {
    if (!supported) {
      alert("Push notifications are not supported in this browser.");
      handleDismiss();
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      // 1. Request native browser notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setBusy(false);
        setFeedback(
          perm === "denied"
            ? "Notifications were blocked in your browser. You can unblock them in your address bar icon."
            : "Permission dismissed."
        );
        setTimeout(() => handleDismiss(), 2500);
        return;
      }

      // 2. Register Service Worker explicitly
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      // 3. Clear any existing stale subscription
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {
          // ignore
        }
      }

      // 4. Create fresh subscription with VAPID key
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // 5. Send subscription and chosen categories to server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          categories: selectedCategories,
          sendWelcome: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save push subscription on server");
      }

      setSubscribed(true);
      setFeedback("✓ Alerts enabled! A test notification was sent to your screen.");
      localStorage.setItem("push_modal_dismissed", "true");

      // Disappear after selecting and enabling
      setTimeout(() => {
        setDismissed(true);
      }, 1800);
    } catch (err: unknown) {
      console.error("Subscription error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Incognito") || msg.includes("private")) {
        setFeedback("Push notifications are disabled in Private/Incognito tabs. Please use a regular tab.");
      } else {
        setFeedback(msg || "Could not complete subscription. Check browser notification settings.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem("push_modal_dismissed", "true");
  }

  // If not supported, already dismissed, or already subscribed: do not show popup
  if (!supported || dismissed || subscribed || permission === "denied") {
    return null;
  }

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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-signal/15 text-signal border-2 border-signal/40">
            <BellRing className="h-6 w-6 animate-bounce" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="push-modal-title" className="text-xl font-bold tracking-tight text-text">
                Get Instant Event Alerts
              </h3>
              <span className="pill pill-ok text-[10px] py-0 px-1.5">Free</span>
            </div>
            <p className="text-xs text-faint">Lock-screen alerts · No login or open tab required</p>
          </div>
        </div>

        <p className="mt-3 text-xs sm:text-sm text-dim leading-relaxed">
          Get notified directly on your phone or computer lock-screen when new hackathons open and <strong>24 hours before deadlines close</strong>.
        </p>

        {/* Category Preferences Selection */}
        <div className="mt-4 pt-3 border-t border-line/60">
          <p className="text-xs font-semibold text-text mb-2">
            Choose what you want alerts for:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PUSH_CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                    active
                      ? "border-signal bg-signal/10 text-accent font-semibold"
                      : "border-line bg-raised text-dim hover:text-text hover:border-line-strong"
                  }`}
                >
                  {active && <span className="mr-1 text-signal font-bold">✓</span>}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {feedback && (
          <div className="mt-3 rounded-lg border border-line bg-raised p-2.5 text-xs font-medium text-accent">
            {feedback}
          </div>
        )}

        {/* Action Buttons */}
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
            {busy ? "Activating alerts…" : "Enable Alerts (1-Click)"}
          </button>
        </div>
      </div>
    </div>
  );
}
