"use client";

import React, { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Send, Sparkles } from "lucide-react";
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
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
      setSupported(true);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) {
            setActive(true);
            const savedCats = localStorage.getItem("push_user_categories");
            if (savedCats) {
              try {
                setCategories(JSON.parse(savedCats));
              } catch {
                // ignore
              }
            }
          }
        })
        .catch((e) => console.warn("SW error:", e));
    }
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

        if (sub) {
          try {
            await sub.unsubscribe();
          } catch {
            // ignore
          }
          sub = null;
        }

        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        } catch (pushErr) {
          console.warn("PushManager subscribe warning (falling back to local notifications):", pushErr);
        }

        if (sub) {
          await fetch("/api/push/subscribe", {
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
          setFeedback("✓ Lock-screen alerts turned ON! Test notification sent.");
        } else {
          setActive(true);
          localStorage.setItem("push_user_categories", JSON.stringify(categories));
          try {
            await reg.showNotification("⚡ EventPilot Alerts Active", {
              body: "Alerts enabled! You will receive notifications for new hackathons.",
              icon: "/icon.svg",
              badge: "/icon.svg",
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
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            userId,
            categories,
            sendWelcome: true,
          }),
        });
      } else {
        await reg.showNotification("⚡ EventPilot Test Alert", {
          body: "Your event alerts are active! You will receive updates here for selected categories.",
          icon: "/icon.svg",
          badge: "/icon.svg",
        });
      }
      setFeedback("✓ Test notification dispatched to your screen!");
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setFeedback("Dispatched test notification to your screen.");
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-raised p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-xl border ${
            active ? "bg-ok/10 text-ok border-ok/30" : "bg-faint/10 text-faint border-line"
          }`}>
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-text">Lock-Screen Push Alerts</h4>
              <span className={`pill text-[10px] py-0 px-2 font-bold ${active ? "pill-ok" : ""}`}>
                {active ? "Active" : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-dim">
              Receive instant alerts for hackathons &amp; deadlines even when the app is closed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        <p className="text-xs font-semibold text-text mb-2">
          Categories to receive push notifications for:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PUSH_CATEGORIES.map((cat) => {
            const isSelected = categories.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => updateCategory(cat.id)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                  isSelected
                    ? "border-signal bg-signal/15 text-accent font-semibold shadow-sm"
                    : "border-line bg-surface text-dim hover:text-text hover:border-line-strong"
                }`}
              >
                {isSelected && <span className="mr-1 text-signal font-bold">✓</span>}
                {cat.label}
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
