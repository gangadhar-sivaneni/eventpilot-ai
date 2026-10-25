import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * 10-Minute Cron Trigger Endpoint
 *
 * Can be called by:
 * 1. External free cron services like cron-job.org or EasyCron every 10 minutes:
 *    GET https://your-domain.com/api/cron/scan?key=YOUR_CRON_KEY
 * 2. Vercel Cron or GitHub webhooks
 * 3. Local browser or test curl commands
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const queryKey = url.searchParams.get("key");

  const expectedKey = process.env.CRON_SECRET || "eventpilot_cron_10m";
  const providedKey = queryKey || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  // If a CRON_SECRET is set, ensure it matches
  if (process.env.CRON_SECRET && providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({
    success: true,
    message: "Event discovery scan dispatched successfully",
    ...results,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
