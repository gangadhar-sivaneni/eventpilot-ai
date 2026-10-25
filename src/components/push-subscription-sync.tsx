"use client";

import { useEffect } from "react";

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

/**
 * Automatically syncs the user's browser push notification subscription with the backend server.
 * Runs in RootLayout so whenever a user visits the app, their device's push channel is
 * actively registered in the database, ensuring background lock-screen notifications work.
 */
export function PushSubscriptionSync() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    // Only auto-sync if notification permission was already granted by user
    if (Notification.permission !== "granted") {
      return;
    }

    let isCancelled = false;

    async function syncSubscription() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;

        if (isCancelled) return;

        let sub = await reg.pushManager.getSubscription();

        // If permission is granted but browser hasn't subscribed to PushManager yet, subscribe now
        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
            });
          } catch (subscribeErr) {
            console.warn("Auto-subscribe initial error, attempting clean retry:", subscribeErr);
            try {
              const existing = await reg.pushManager.getSubscription();
              if (existing) {
                await existing.unsubscribe();
              }
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
              });
            } catch (retryErr) {
              console.warn("Auto-subscribe retry failed:", retryErr);
            }
          }
        }

        if (sub && !isCancelled) {
          const savedCats = localStorage.getItem("push_user_categories");
          let categories = ["all"];
          if (savedCats) {
            try {
              categories = JSON.parse(savedCats);
            } catch {
              // ignore
            }
          }

          // Sync active subscription with server
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              categories,
              sendWelcome: false,
            }),
          }).catch((err) => console.warn("Push sync network error:", err));
        }
      } catch (err) {
        console.warn("PushSubscriptionSync error:", err);
      }
    }

    syncSubscription();

    return () => {
      isCancelled = true;
    };
  }, []);

  return null;
}
