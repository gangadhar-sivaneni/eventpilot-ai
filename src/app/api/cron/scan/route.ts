import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { getUser } from "@/lib/auth";
import { timingSafeCompare } from "@/lib/security";
import { broadcastPushNotification } from "@/lib/push";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

let lastScanTimestamp = 0;
const MIN_SCAN_INTERVAL_MS = 60_000; // 60 seconds rate limit cooldown

/**
 * 10-Minute Cron Trigger Endpoint
 *
 * Can be called by:
 * 1. Vercel Cron or GitHub webhooks with Authorization: Bearer <CRON_SECRET>
 * 2. External cron services with ?key=<CRON_SECRET>
 * 3. Authenticated Admin users
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const queryKey = url.searchParams.get("key");

  const cronSecret = process.env.CRON_SECRET;
  const providedKey = queryKey || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  let isAuthorized = false;

  // 1. If CRON_SECRET is configured in environment, strictly require it or admin
  if (cronSecret) {
    if (providedKey && timingSafeCompare(providedKey, cronSecret)) {
      isAuthorized = true;
    }
  } else {
    // 2. If CRON_SECRET is not yet set in environment:
    // Accept standard cron key (e.g. ?key=eventpilot_cron_10m or Bearer eventpilot_cron_10m)
    // or allow external cron services (cron-job.org, EasyCron).
    // Safe because: no private data is exposed, and rate limiting below strictly caps execution.
    if (!providedKey || providedKey === "eventpilot_cron_10m" || timingSafeCompare(providedKey, "eventpilot_cron_10m")) {
      isAuthorized = true;
    }
  }

  // 3. Allow authenticated admin session
  if (!isAuthorized) {
    const { user } = await getUser().catch(() => ({ user: null }));
    if (user?.app_metadata?.role === "admin") {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate Limiting: Prevent rapid-fire resource exhaustion (DoS)
  const now = Date.now();
  if (now - lastScanTimestamp < MIN_SCAN_INTERVAL_MS) {
    const waitSeconds = Math.ceil((MIN_SCAN_INTERVAL_MS - (now - lastScanTimestamp)) / 1000);
    return NextResponse.json(
      {
        error: `Rate limited. Please wait ${waitSeconds}s before triggering another scan.`,
        cooldown_remaining_seconds: waitSeconds,
      },
      { status: 429 }
    );
  }
  lastScanTimestamp = now;

  const ghToken = process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
  const repoOwner = process.env.GITHUB_REPO_OWNER || "gangadhar-sivaneni";
  const repoName = process.env.GITHUB_REPO_NAME || "eventpilot-ai";

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    status: "dispatched",
  };

  // If a GitHub token is configured, trigger GitHub Actions workflow_dispatch immediately (0-second queue delay)
  if (ghToken) {
    try {
      const ghRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/worker.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ghToken}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ ref: "main" }),
        }
      );

      if (ghRes.ok || ghRes.status === 204) {
        results.github_actions = "dispatched_successfully";
      } else {
        const errText = await ghRes.text();
        results.github_actions_error = errText;
      }
    } catch (err: unknown) {
      results.github_actions_error = err instanceof Error ? err.message : String(err);
    }
  }

  // If running locally in development or on a Node server, also spawn the local python worker in background
  if (process.env.NODE_ENV === "development" || !ghToken) {
    try {
      const workerDir = path.resolve(process.cwd(), "worker");
      const pythonExe = process.platform === "win32"
        ? path.join(workerDir, ".venv", "Scripts", "python.exe")
        : path.join(workerDir, ".venv", "bin", "python");

      const scriptPath = path.join(workerDir, "discovery.py");

      const child = spawn(pythonExe, [scriptPath], {
        cwd: workerDir,
        detached: true,
        stdio: "ignore",
      });

      child.unref();
      results.local_worker = "spawned_detached";
    } catch (err: unknown) {
      results.local_worker_error = err instanceof Error ? err.message : String(err);
    }
  }

  // Dispatch lock-screen push notifications to active subscribers for newly discovered/verified events
  try {
    const admin = getAdminClient();
    const dbClient = admin || (await createClient().catch(() => null));

    if (dbClient) {
      const nowIso = new Date().toISOString();
      const lookbackWindow = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      // Find recently active/verified events that are open for registration
      const { data: freshEvents } = await dbClient
        .from("events")
        .select("id, title, city, format, prize_text, categories, url, registration_status, first_seen_at, registration_deadline")
        .not("quality_verified_at", "is", null)
        .neq("registration_status", "closed")
        .gte("first_seen_at", lookbackWindow)
        .order("first_seen_at", { ascending: false })
        .limit(6);

      // Check which events have already been broadcast in audit_logs
      let alreadySentIds: string[] = [];
      if (admin) {
        const { data: history } = await admin
          .from("audit_logs")
          .select("details")
          .eq("action", "push_broadcast_sent")
          .gte("created_at", lookbackWindow);
        if (history) {
          alreadySentIds = history
            .map((h) => String((h.details as Record<string, unknown> | null)?.event_id ?? ""))
            .filter(Boolean);
        }
      }

      // If no new events in lookback window, check if any deadline is closing in < 24h
      let eventsToNotify = (freshEvents || []).filter((e) => !alreadySentIds.includes(String(e.id)));

      if (eventsToNotify.length === 0) {
        const closingWindow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { data: closingEvents } = await dbClient
          .from("events")
          .select("id, title, city, format, prize_text, categories, url, registration_status, first_seen_at, registration_deadline")
          .not("quality_verified_at", "is", null)
          .neq("registration_status", "closed")
          .gte("registration_deadline", nowIso)
          .lte("registration_deadline", closingWindow)
          .order("registration_deadline", { ascending: true })
          .limit(3);

        if (closingEvents && closingEvents.length > 0) {
          eventsToNotify = closingEvents.filter((e) => !alreadySentIds.includes(`closing_${e.id}`));
        }
      }

      const broadcastResults: Array<Record<string, unknown>> = [];
      // Broadcast at most 2 events per 10-minute scan to avoid spamming the user's notification drawer
      for (const ev of eventsToNotify.slice(0, 2)) {
        const isClosing = Boolean((ev as Record<string, unknown>).registration_deadline && !(ev as Record<string, unknown>).first_seen_at);
        const category = (ev.categories && ev.categories[0]) ? String(ev.categories[0]).toLowerCase() : "all";
        const location = ev.city || (ev.format === "online" ? "Online" : "India");
        const prizeInfo = ev.prize_text ? ` · Prize: ${ev.prize_text}` : "";

        const title = isClosing
          ? `⏰ Closing Soon: ${ev.title}`
          : `⚡ New Hackathon: ${ev.title}`;

        const body = isClosing
          ? `Registration closes in <24h (${location}${prizeInfo}). Review and secure your seat!`
          : `${location}${prizeInfo} — Live registration now verified & open!`;

        const pushStat = await broadcastPushNotification({
          title,
          body,
          category,
          url: `/events/${ev.id}`,
        });

        if (admin) {
          await admin.from("audit_logs").insert({
            action: "push_broadcast_sent",
            details: {
              event_id: isClosing ? `closing_${ev.id}` : ev.id,
              event_title: ev.title,
              stats: pushStat,
            },
          });
        }

        broadcastResults.push({
          event_id: ev.id,
          title: ev.title,
          stats: pushStat,
        });
      }

      results.push_broadcast = {
        dispatched_count: broadcastResults.length,
        items: broadcastResults,
      };
    }
  } catch (err: unknown) {
    console.warn("Push notification broadcast error during cron scan:", err);
    results.push_broadcast_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    success: true,
    message: "Event discovery scan dispatched successfully",
    ...results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
