import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  appendLog,
  listRunningOwners,
  renewLease,
  setCrawlerStatus,
  tryClaimLease,
} from "@/lib/crawler/state";
import {
  processOneQueuedUser,
  recoverInterrupted,
  reseedOwnFollowersIfNeeded,
} from "@/lib/crawler/process";
import { EMPTY_QUEUE_RESEED_MS, POLL_IDLE_MS } from "@/lib/crawler/types";
import { getDb } from "@/lib/db";
import { crawlerState } from "@/lib/db/schema";

const workerId = `worker-${randomUUID()}`;
let stopping = false;
let loopStarted = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopForTimeLimit(ownerGithubUserId: number) {
  await setCrawlerStatus(ownerGithubUserId, "paused", {
    currentUsername: null,
    currentGithubUserId: null,
    lastError: null,
  });
  const db = getDb();
  await db
    .update(crawlerState)
    .set({ runEndsAt: null, updatedAt: new Date() })
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));
  await appendLog(ownerGithubUserId, {
    type: "info",
    message: "⏸ Time limit reached — paused",
  });
}

async function processOwner(ownerGithubUserId: number) {
  const claimed = await tryClaimLease(ownerGithubUserId, workerId);
  if (!claimed) {
    return;
  }

  const recovery = await recoverInterrupted(ownerGithubUserId);
  if (recovery !== "ok") {
    return;
  }

  while (!stopping) {
    const [state] = await getDb()
      .select()
      .from(crawlerState)
      .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
      .limit(1);
    if (!state || state.status !== "running") {
      return;
    }

    if (state.runEndsAt && state.runEndsAt.getTime() <= Date.now()) {
      await stopForTimeLimit(ownerGithubUserId);
      return;
    }

    if (!(await renewLease(ownerGithubUserId, workerId))) {
      return;
    }

    const result = await processOneQueuedUser(ownerGithubUserId);
    if (result === "paused" || result === "error") {
      return;
    }

    const [after] = await getDb()
      .select({
        delaySeconds: crawlerState.delaySeconds,
        status: crawlerState.status,
        runEndsAt: crawlerState.runEndsAt,
      })
      .from(crawlerState)
      .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
      .limit(1);
    if (!after || after.status !== "running") {
      return;
    }

    if (after.runEndsAt && after.runEndsAt.getTime() <= Date.now()) {
      await stopForTimeLimit(ownerGithubUserId);
      return;
    }

    if (result === "empty") {
      try {
        const added = await reseedOwnFollowersIfNeeded(ownerGithubUserId);
        await sleep(added > 0 ? POLL_IDLE_MS : EMPTY_QUEUE_RESEED_MS);
      } catch (error) {
        console.error("[crawler] reseed error", error);
        await sleep(EMPTY_QUEUE_RESEED_MS);
      }
      continue;
    }

    const delayMs = Math.max(0, after.delaySeconds) * 1000;
    if (delayMs > 0) {
      // Wake early if the run timer ends during delay.
      const until = after.runEndsAt?.getTime();
      if (until) {
        const remaining = until - Date.now();
        if (remaining <= 0) {
          await stopForTimeLimit(ownerGithubUserId);
          return;
        }
        await sleep(Math.min(delayMs, remaining));
        if (Date.now() >= until) {
          await stopForTimeLimit(ownerGithubUserId);
          return;
        }
      } else {
        await sleep(delayMs);
      }
    }
  }
}

export async function runCrawlerWorkerLoop() {
  if (loopStarted) {
    console.log(`[crawler] already running ${workerId}`);
    return;
  }
  loopStarted = true;
  console.log(`[crawler] started ${workerId}`);

  process.on("SIGINT", () => {
    stopping = true;
    console.log("[crawler] shutting down…");
  });
  process.on("SIGTERM", () => {
    stopping = true;
    console.log("[crawler] shutting down…");
  });

  while (!stopping) {
    try {
      const owners = await listRunningOwners();
      for (const owner of owners) {
        if (stopping) {
          break;
        }
        await processOwner(owner.ownerGithubUserId);
      }
    } catch (error) {
      console.error("[crawler] loop error", error);
    }
    await sleep(POLL_IDLE_MS);
  }

  console.log("[crawler] stopped");
}
