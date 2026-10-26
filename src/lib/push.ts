import "server-only";
import webpush from "web-push";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isValidPushEndpoint } from "@/lib/security";

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  categories?: string[];
  user_id?: string | null;
  created_at?: string;
}

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  (process.env.NODE_ENV !== "production"
    ? "BOto0VMzDaKITShUIzsspE4JAgxnsqeQok9Acd8iKX4paqSJLfNIqBFBKPILRfEKmtT3bqlAX8pLHpIgyIh1Bos"
    : "");

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  (process.env.NODE_ENV !== "production"
    ? "KbOb8HX3h9to6oeZBUIH2yVSGqZ5BXlFz3Tn4ESMPGM"
    : "");

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:notifications@eventpilot.ai";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.warn("Failed to set VAPID details:", e);
  }
}

const DATA_DIR = process.env.VERCEL
  ? path.join("/tmp", "eventpilot_data")
  : path.join(process.cwd(), "data");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push_subscriptions.json");

function ensureStore(): PushSubscriptionData[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8");
    return JSON.parse(raw) as PushSubscriptionData[];
  } catch (err) {
    console.error("Failed to read push subscriptions store:", err);
    return [];
  }
}

const MAX_SUBSCRIPTIONS = 5000;

function saveStore(subs: PushSubscriptionData[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const bounded = subs.length > MAX_SUBSCRIPTIONS ? subs.slice(-MAX_SUBSCRIPTIONS) : subs;
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(bounded, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write push subscriptions store:", err);
  }
}

export async function savePushSubscription(sub: PushSubscriptionData) {
  // 1. Save to local/tmp store
  const subs = ensureStore();
  const existingIdx = subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (existingIdx >= 0) {
    subs[existingIdx] = {
      ...subs[existingIdx],
      ...sub,
      user_id: sub.user_id || subs[existingIdx].user_id || null,
      categories: (sub.categories && sub.categories.length > 0) ? sub.categories : (subs[existingIdx].categories || ["all"]),
    };
  } else {
    subs.push({
      ...sub,
      categories: (sub.categories && sub.categories.length > 0) ? sub.categories : ["all"],
      created_at: new Date().toISOString(),
    });
  }
  saveStore(subs);

  // 1b. Also persist into data/store.json audit_logs if running in local/demo mode
  try {
    const storePath = path.join(process.cwd(), "data", "store.json");
    if (fs.existsSync(storePath)) {
      const storeRaw = fs.readFileSync(storePath, "utf8");
      const storeObj = JSON.parse(storeRaw);
      storeObj.audit_logs = storeObj.audit_logs || [];
      // Clean up previous
      storeObj.audit_logs = storeObj.audit_logs.filter(
        (a: { action?: string; details?: { endpoint?: string } }) =>
          !(a.action === "push_subscription" && a.details?.endpoint === sub.endpoint)
      );
      storeObj.audit_logs.push({
        id: Date.now(),
        user_id: sub.user_id || null,
        action: "push_subscription",
        details: {
          endpoint: sub.endpoint,
          keys: sub.keys,
          categories: sub.categories && sub.categories.length > 0 ? sub.categories : ["all"],
          user_id: sub.user_id || null,
          active: true,
          updated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
      fs.writeFileSync(storePath, JSON.stringify(storeObj, null, 2), "utf8");
    }
  } catch (err) {
    console.warn("Failed to update push subscription in data/store.json:", err);
  }

  // 2. Persist to Supabase audit_logs (guarantees cross-container persistence on Vercel)
  try {
    const admin = getAdminClient();
    if (admin) {
      const insertPayload = {
        action: "push_subscription",
        details: {
          endpoint: sub.endpoint,
          keys: sub.keys,
          categories: sub.categories && sub.categories.length > 0 ? sub.categories : ["all"],
          user_id: sub.user_id || null,
          active: true,
          updated_at: new Date().toISOString(),
        },
      };

      // Try inserting with user_id first
      let insertResult = await admin.from("audit_logs").insert({
        user_id: sub.user_id || null,
        ...insertPayload,
      });

      // If user_id violates foreign key constraint (e.g. demo user or not present in auth.users),
      // fallback to inserting with user_id: null while keeping user_id safely stored in details JSONB
      if (insertResult.error && (insertResult.error.code === "23503" || insertResult.error.message?.includes("foreign key"))) {
        insertResult = await admin.from("audit_logs").insert({
          user_id: null,
          ...insertPayload,
        });
      }

      if (!insertResult.error) {
        // Clean up older records for this endpoint to prevent duplicate entries
        await admin
          .from("audit_logs")
          .delete()
          .eq("action", "push_subscription")
          .filter("details->>endpoint", "eq", sub.endpoint)
          .lt("created_at", new Date(Date.now() - 5000).toISOString());
      } else {
        console.warn("Audit logs push subscription insert error:", insertResult.error);
      }
    }
  } catch (err) {
    console.warn("Failed to save push subscription to Supabase audit_logs:", err);
  }

  // 3. Also try push_subscriptions table if present
  try {
    const admin = getAdminClient();
    const dbClient = admin || (await createClient().catch(() => null));
    if (dbClient) {
      await dbClient.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_id: sub.user_id || null,
        },
        { onConflict: "endpoint" }
      );
    }
  } catch {
    // Handled by audit_logs and local store
  }

  return { success: true };
}

export async function removePushSubscription(endpoint: string) {
  const subs = ensureStore();
  const filtered = subs.filter((s) => s.endpoint !== endpoint);
  saveStore(filtered);

  try {
    const admin = getAdminClient();
    if (admin) {
      await admin
        .from("audit_logs")
        .delete()
        .eq("action", "push_subscription")
        .filter("details->>endpoint", "eq", endpoint);
    }
  } catch (err) {
    console.warn("Failed to remove push subscription from audit_logs:", err);
  }

  try {
    const supabase = await createClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // ignore
  }

  return { success: true };
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionData[]> {
  const map = new Map<string, PushSubscriptionData>();

  // 1. Load from local/tmp store
  const localSubs = ensureStore();
  for (const s of localSubs) {
    if (s.endpoint && s.keys) map.set(s.endpoint, s);
  }

  // 2. Load from Supabase audit_logs (authoritative across all serverless instances)
  try {
    const admin = getAdminClient();
    if (admin) {
      const { data: rows } = await admin
        .from("audit_logs")
        .select("id, user_id, details, created_at")
        .eq("action", "push_subscription")
        .order("created_at", { ascending: false });

      if (rows && rows.length > 0) {
        for (const row of rows) {
          const d = row.details as Record<string, unknown> | null;
          if (d && typeof d.endpoint === "string" && d.keys && typeof d.keys === "object") {
            const keysObj = d.keys as { p256dh?: string; auth?: string };
            if (keysObj.p256dh && keysObj.auth) {
              const userId = (row.user_id as string) || (d.user_id as string) || null;
              const cats = Array.isArray(d.categories) && d.categories.length > 0 ? (d.categories as string[]) : ["all"];
              const existing = map.get(d.endpoint);
              if (existing) {
                if (userId && !existing.user_id) existing.user_id = userId;
                if (cats && cats.length > 0 && (!existing.categories || existing.categories.includes("all"))) {
                  existing.categories = cats;
                }
              } else {
                map.set(d.endpoint, {
                  endpoint: d.endpoint,
                  keys: {
                    p256dh: keysObj.p256dh,
                    auth: keysObj.auth,
                  },
                  user_id: userId,
                  categories: cats,
                  created_at: row.created_at as string,
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Failed to load push subscriptions from audit_logs:", err);
  }

  // 2b. Also read from data/store.json if running in local demo mode
  try {
    const storePath = path.join(process.cwd(), "data", "store.json");
    if (fs.existsSync(storePath)) {
      const storeRaw = fs.readFileSync(storePath, "utf8");
      const storeObj = JSON.parse(storeRaw);
      const logs = storeObj.audit_logs || [];
      for (const log of logs) {
        if (log.action === "push_subscription" && log.details?.endpoint && log.details?.keys) {
          const d = log.details;
          if (d.keys.p256dh && d.keys.auth && !map.has(d.endpoint)) {
            map.set(d.endpoint, {
              endpoint: d.endpoint,
              keys: d.keys,
              user_id: log.user_id || d.user_id || null,
              categories: Array.isArray(d.categories) ? d.categories : ["all"],
              created_at: log.created_at,
            });
          }
        }
      }
    }
  } catch {
    // Handled
  }

  // 3. Fallback: try push_subscriptions table
  try {
    const admin = getAdminClient();
    const dbClient = admin || (await createClient().catch(() => null));
    if (dbClient) {
      const { data } = await dbClient.from("push_subscriptions").select("*");
      if (data && data.length > 0) {
        for (const row of data) {
          if (!map.has(row.endpoint)) {
            map.set(row.endpoint, {
              endpoint: row.endpoint,
              keys: {
                p256dh: row.p256dh,
                auth: row.auth,
              },
              user_id: row.user_id,
              created_at: row.created_at,
              categories: ["all"],
            });
          }
        }
      }
    }
  } catch {
    // Handled
  }

  return Array.from(map.values());
}

export interface PushPayload {
  title: string;
  body: string;
  category?: string;
  url?: string;
  icon?: string;
  badge?: string;
}

const DEFAULT_VAPID_OPTIONS: webpush.RequestOptions = {
  vapidDetails: {
    subject: VAPID_SUBJECT,
    publicKey: VAPID_PUBLIC_KEY,
    privateKey: VAPID_PRIVATE_KEY,
  },
  TTL: 86400,
  urgency: "high",
};

export async function broadcastPushNotification(payload: PushPayload) {
  const subscriptions = await getAllPushSubscriptions();
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  // Filter subscriptions based on requested category
  const matching = subscriptions.filter((sub) => {
    if (!payload.category) return true;
    if (!sub.categories || sub.categories.length === 0) return true;
    return (
      sub.categories.includes(payload.category.toLowerCase()) ||
      sub.categories.includes("all")
    );
  });

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/events",
    icon: (payload.icon && !payload.icon.endsWith(".svg")) ? payload.icon : "/icon-192.png",
    badge: (payload.badge && !payload.badge.endsWith(".svg")) ? payload.badge : "/badge.png",
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    matching.map(async (sub) => {
      if (!isValidPushEndpoint(sub.endpoint)) {
        expiredEndpoints.push(sub.endpoint);
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          jsonPayload,
          DEFAULT_VAPID_OPTIONS
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (expiredEndpoints.length > 0) {
    const subs = ensureStore().filter((s) => !expiredEndpoints.includes(s.endpoint));
    saveStore(subs);
    for (const ep of expiredEndpoints) {
      removePushSubscription(ep).catch(() => {});
    }
  }

  return { sent, failed, total: matching.length };
}

export async function sendPushToSubscription(sub: PushSubscriptionData, payload: PushPayload) {
  if (!isValidPushEndpoint(sub.endpoint)) {
    throw new Error("Invalid push service endpoint");
  }

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/events",
    icon: (payload.icon && !payload.icon.endsWith(".svg")) ? payload.icon : "/icon-192.png",
    badge: (payload.badge && !payload.badge.endsWith(".svg")) ? payload.badge : "/badge.png",
  });

  return webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: sub.keys,
    },
    jsonPayload,
    DEFAULT_VAPID_OPTIONS
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!userId) return { sent: 0, failed: 0, total: 0 };
  const subscriptions = await getAllPushSubscriptions();
  const userSubs = subscriptions.filter((s) => s.user_id === userId);

  // If no subscription is explicitly tied to this userId yet, fallback to single user subscription or anonymous subscriber
  const targets = userSubs.length > 0
    ? userSubs
    : (subscriptions.length === 1 ? subscriptions : subscriptions.filter((s) => !s.user_id));

  if (targets.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  let sent = 0;
  let failed = 0;
  await Promise.allSettled(
    targets.map(async (sub) => {
      try {
        await sendPushToSubscription(sub, payload);
        sent++;
      } catch (err) {
        failed++;
        console.warn("sendPushToUser error:", err);
      }
    })
  );

  return { sent, failed, total: targets.length };
}
