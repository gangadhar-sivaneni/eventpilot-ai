import "server-only";
import webpush from "web-push";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";

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
  "BOto0VMzDaKITShUIzsspE4JAgxnsqeQok9Acd8iKX4paqSJLfNIqBFBKPILRfEKmtT3bqlAX8pLHpIgyIh1Bos";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "KbOb8HX3h9to6oeZBUIH2yVSGqZ5BXlFz3Tn4ESMPGM";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:notifications@eventpilot.ai";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn("Failed to set VAPID details:", e);
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

function saveStore(subs: PushSubscriptionData[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), "utf8");
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
      categories: sub.categories || subs[existingIdx].categories || [],
    };
  } else {
    subs.push({
      ...sub,
      categories: sub.categories || [],
      created_at: new Date().toISOString(),
    });
  }
  saveStore(subs);

  // 2. Try saving to Supabase if table exists
  try {
    const supabase = await createClient();
    await supabase.from("push_subscriptions").upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_id: sub.user_id || null,
      },
      { onConflict: "endpoint" }
    );
  } catch {
    // Supabase fallback handled by persistent store
  }

  return { success: true };
}

export async function removePushSubscription(endpoint: string) {
  const subs = ensureStore();
  const filtered = subs.filter((s) => s.endpoint !== endpoint);
  saveStore(filtered);

  try {
    const supabase = await createClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // ignore
  }

  return { success: true };
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionData[]> {
  const localSubs = ensureStore();

  try {
    const supabase = await createClient();
    const { data } = await supabase.from("push_subscriptions").select("*");
    if (data && data.length > 0) {
      const map = new Map<string, PushSubscriptionData>();
      for (const s of localSubs) map.set(s.endpoint, s);
      for (const row of data) {
        map.set(row.endpoint, {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth,
          },
          user_id: row.user_id,
          created_at: row.created_at,
          categories: map.get(row.endpoint)?.categories || [],
        });
      }
      return Array.from(map.values());
    }
  } catch {
    // ignore
  }

  return localSubs;
}

export interface PushPayload {
  title: string;
  body: string;
  category?: string;
  url?: string;
  icon?: string;
  badge?: string;
}

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
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/icon.svg",
  });

  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  await Promise.allSettled(
    matching.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          jsonPayload
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
  }

  return { sent, failed, total: matching.length };
}

export async function sendPushToSubscription(sub: PushSubscriptionData, payload: PushPayload) {
  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/events",
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/icon.svg",
  });

  return webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: sub.keys,
    },
    jsonPayload
  );
}
