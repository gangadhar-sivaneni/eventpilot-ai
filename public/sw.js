// EventPilot Browser Web Push Service Worker
// Handles background lock-screen notifications without needing any open browser tab or login.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "EventPilot Alert",
    body: "New verified hackathon discovered!",
    url: "/events",
    icon: "/icon-192.png",
    badge: "/badge.png",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  // Ensure raster PNG format for desktop & mobile OS notification system compatibility
  const iconUrl = (data.icon && !data.icon.endsWith(".svg")) ? data.icon : "/icon-192.png";
  const badgeUrl = (data.badge && !data.badge.endsWith(".svg")) ? data.badge : "/badge.png";

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: badgeUrl,
    vibrate: [100, 50, 100],
    tag: data.url ? `eventpilot_${data.url}` : "eventpilot_alert",
    renotify: true,
    data: {
      url: data.url || "/events",
      dateOfArrival: Date.now(),
    },
    actions: [
      { action: "explore", title: "View Event" },
      { action: "close", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).catch((err) => {
      console.warn("ServiceWorker showNotification failed with options, attempting minimal fallback:", err);
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icon-192.png",
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") {
    return;
  }

  const targetUrl = event.notification.data?.url || "/events";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If an EventPilot tab is already open, focus it and navigate
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise open a fresh window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
