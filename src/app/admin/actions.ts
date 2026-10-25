"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { spawn } from "node:child_process";
import path from "node:path";

export async function triggerScanAction() {
  await requireAdmin();

  const ghToken = process.env.GITHUB_DISPATCH_TOKEN || process.env.GITHUB_TOKEN;
  const repoOwner = process.env.GITHUB_REPO_OWNER || "gangadhar-sivaneni";
  const repoName = process.env.GITHUB_REPO_NAME || "eventpilot-ai";

  if (ghToken) {
    try {
      await fetch(
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
    } catch {
      // ignore
    }
  }

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
  } catch {
    // ignore
  }

  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/");
}
