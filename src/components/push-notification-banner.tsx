"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellRing, Check, X, ShieldAlert, Sparkles } from "lucide-react";

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

export function PushNotificationBanner({
  variant = "floating",
}: {
  variant?: "floating" | "inline";
}) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      setPermission(Notification.permission);

      // Register the service worker early in the background
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          if (sub) {
            setSubscribed(true);
          }
        });
      }).catch((err) => {
        console.warn("Service worker registration error:", err);
      });
    }

    // Check if dismissed previously
    const wasDismissed = sessionStorage.getItem("push_banner_dismissed");
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  async function handleSubscribe() {
    if (!supported) {
      alert("Push notifications are not supported in this browser.");
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setBusy(false);
        setFeedback("Permission was not granted. You can enable it in your browser address bar.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Send subscription to server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          sendWelcome: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to register subscription on server");
      }

      setSubscribed(true);
      setFeedback("Lock-screen alerts enabled! A test notification was sent.");
    } catch (err: unknown) {
      console.error("Subscription error:", err);
      setFeedback("Could not complete subscription. Please check your browser settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setFeedback("Alerts turned off.");
    } catch (err) {
      console.error("Unsubscribe error:", err);
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem("push_banner_dismissed", "true");
  }

  if (!supported || dismissed) return null;

  // If already subscribed, show a sleek indicator
  if (subscribed) {
    if (variant === "inline") {
      return (
        <div className="flex items-center justify-between rounded-xl border border-ok/30 bg-ok/5 p-4 text-xs">
          <div className="flex items-center gap-2 text-ok font-medium">
            <Check className="h-4 w-4" />
            <span>Browser push alerts are active (no login required)</span>
          </div>
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={busy}
            className="text-faint hover:text-bad underline transition-colors"
          >
            {busy ? "Updating…" : "Turn off"}
          </button>
        </div>
      );
    }
    return null;
  }

  if (permission === "denied") return null;

  // Floating prompt on bottom-right (or inline inside pages)
  return (
    <aside
      aria-label="Browser alerts notification"
      className={
        variant === "floating"
          ? "fixed bottom-5 right-5 z-40 max-w-sm w-[calc(100vw-2.5rem)] animate-rise"
          : "my-6 w-full animate-fade"
      }
    >
      <div className="card relative border-2 border-text bg-surface p-4 shadow-[6px_6px_0_var(--text)] sm:p-5">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-3 top-3 rounded-lg p-1 text-faint hover:bg-raised hover:text-text transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal border border-signal/30">
            <BellRing className="h-5 w-5 animate-bounce" />
          </span>

          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold tracking-tight text-text">
                Get Instant Hackathon Alerts
              </h4>
              <span className="pill pill-ok text-[10px] py-0 px-1.5">Free</span>
            </div>

            <p className="text-xs text-dim leading-relaxed">
              Pops up directly on your lock-screen for new hackathons and 24h deadline reminders. <strong>No login or open tab required</strong>.
            </p>

            {feedback && (
              <p className="text-[11px] font-medium text-accent pt-1">
                {feedback}
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={busy}
                className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
              >
                <Bell className="h-3.5 w-3.5" />
                {busy ? "Enabling…" : "Enable Alerts (1-Click)"}
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs text-faint hover:text-text px-2 py-1 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
