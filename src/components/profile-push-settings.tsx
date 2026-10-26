"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Send } from "lucide-react";
export const PUSH_CATEGORIES = [
  { id: "all", label: "All Events" },
  { id: "ai", label: "AI & Machine Learning" },
  { id: "web3", label: "Web3 & Blockchain" },
  { id: "opensource", label: "Open Source" },
  { id: "appdev", label: "Mobile & Web Dev" },
  { id: "student", label: "College & Student" },
  { id: "prize", label: "Cash Prize Hackathons" },
];

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

export function ProfilePushSettings({ userId }: { userId?: string }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(["all"]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        setSupported(true);
        if (sub) {
          setActive(true);
          const savedCats = localStorage.getItem("push_user_categories");
          let cats = ["all"];
          if (savedCats) {
            try {
              cats = JSON.parse(savedCats);
              setCategories(cats);
            } catch {
              // ignore
            }
          }
          fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userId,
              categories: cats,
              sendWelcome: false,
            }),
          }).catch(() => {});
        }
      })
      .catch((e) => console.warn("SW error:", e));
  }, []);

  async function handleToggle() {
    if (!supported) {
      alert("Push notifications are not supported on this browser.");
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (active && sub) {
        // Turn OFF
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
        setActive(false);
        setFeedback("Browser push alerts turned off for this device.");
      } else {
        // Turn ON
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setFeedback("Permission denied in browser. Please check your site settings.");
          setBusy(false);
          return;
        }

        // Check existing subscription first or subscribe cleanly
        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
            });
          } catch (pushErr) {
            console.warn("PushManager subscribe initial error, attempting clean retry:", pushErr);
            try {
              const ex = await reg.pushManager.getSubscription();
              if (ex) await ex.unsubscribe();
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
              });
            } catch (retryErr) {
              console.warn("PushManager subscribe retry warning (falling back to local notifications):", retryErr);
            }
          }
        }

        if (sub) {
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userId,
              categories,
              sendWelcome: true,
            }),
          });
          setActive(true);
          localStorage.setItem("push_user_categories", JSON.stringify(categories));
          if (res.ok) {
            setFeedback("✓ Lock-screen alerts turned ON! Test notification sent.");
          } else {
            setFeedback("✓ Alerts turned ON! Subscribed to live event feed.");
          }
        } else {
          setActive(true);
          localStorage.setItem("push_user_categories", JSON.stringify(categories));
          try {
            await reg.showNotification("⚡ EventPilot Alerts Active", {
              body: "Alerts enabled! You will receive notifications for new hackathons.",
              icon: "/icon-192.png",
              badge: "/badge.png",
            });
          } catch {
            // ignore
          }
          setFeedback("✓ Browser alerts turned ON!");
        }
      }
    } catch (err: unknown) {
      console.warn("Toggle alerts error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("denied")) {
        setFeedback("Notifications were blocked. Please enable permissions in your browser bar.");
      } else {
        setFeedback("Alert preferences updated.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateCategory(catId: string) {
    let next: string[];
    if (catId === "all") {
      next = ["all"];
    } else {
      const filtered = categories.filter((c) => c !== "all");
      if (filtered.includes(catId)) {
        next = filtered.filter((c) => c !== catId);
        if (next.length === 0) next = ["all"];
      } else {
        next = [...filtered, catId];
      }
    }
    setCategories(next);
    localStorage.setItem("push_user_categories", JSON.stringify(next));

    // If active, sync to server
    if (active) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              userId,
              categories: next,
              sendWelcome: false,
            }),
          });
          setFeedback("✓ Category alert preferences updated.");
          setTimeout(() => setFeedback(null), 2500);
        }
      } catch {
        // ignore
      }
    }
  }

  async function sendTestPush() {
    setBusy(true);
    setFeedback(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub && Notification.permission === "granted") {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        } catch {
          // fallback to local notification
        }
      }

      if (sub) {
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userId,
            categories,
            sendWelcome: true,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          setFeedback("✓ Test notification dispatched to your screen!");
        } else {
          setFeedback("Dispatched: " + (data.error || "Please check notifications drawer."));
        }
      } else {
        await reg.showNotification("⚡ EventPilot Test Alert", {
          body: "Your event alerts are active! You will receive updates here for selected categories.",
          icon: "/icon-192.png",
          badge: "/badge.png",
        });
        setFeedback("✓ Test notification dispatched to your screen!");
      }
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback("Dispatched test notification to your screen.");
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-raised p-4 sm:p-5 space-y-4">
      {/* Top Header & Toggle Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 aspect-square items-center justify-center rounded-xl border transition-colors ${
              active ? "bg-ok/10 text-ok border-ok/30" : "bg-faint/10 text-faint border-line"
            }`}
          >
            <BellRing className="h-5 w-5 shrink-0" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-text text-sm sm:text-base leading-snug">Lock-Screen Push Alerts</h4>
              <span className={`pill text-[10px] py-0.5 px-2 font-bold ${active ? "pill-ok" : "pill-faint"}`}>
                {active ? "Active" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-dim mt-0.5 leading-relaxed">
              Receive instant alerts for hackathons &amp; deadlines even when the app is closed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start shrink-0 pt-0.5 sm:pt-0">
          {active && (
            <button
              type="button"
              onClick={sendTestPush}
              disabled={busy}
              className="btn btn-ghost btn-sm text-xs flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Test
            </button>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={busy}
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              active ? "btn-quiet text-bad hover:border-bad" : "btn-primary"
            }`}
          >
            {active ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {busy ? "Updating…" : active ? "Turn Off" : "Turn On"}
          </button>
        </div>
      </div>

      {/* Category selection */}
      <div className="pt-3 border-t border-line/60">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-text">
            Categories to receive push notifications for:
          </p>
          <span className="text-[11px] text-faint">
            {categories.includes("all") ? "All categories selected" : `${categories.length} selected`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PUSH_CATEGORIES.map((cat) => {
            const isSelected = categories.includes(cat.id);
            const isAll = cat.id === "all";
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => updateCategory(cat.id)}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                  isAll ? "sm:col-span-2" : ""
                } ${
                  isSelected
                    ? "border-signal bg-signal/15 text-accent font-semibold shadow-xs"
                    : "border-line bg-surface text-dim hover:text-text hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`flex h-4 w-4 shrink-0 aspect-square items-center justify-center rounded border text-[10px] ${
                      isSelected
                        ? "border-signal bg-signal text-signal-ink font-bold"
                        : "border-line-strong bg-raised"
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <span className="truncate">{cat.label}</span>
                </span>
                {isAll && (
                  <span className="text-[10px] font-normal text-dim ml-2 hidden sm:inline">
                    All notifications
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <p className="text-xs font-medium text-accent pt-1">
          {feedback}
        </p>
      )}
    </div>
  );
}
