import { and, eq, inArray } from "drizzle-orm";
import type { SessionPayload } from "@/types/auth";
import {
  appendLog,
  ensureCrawlerState,
  getQueueCount,
  setCrawlerStatus,
  setTokenCipher,
} from "@/lib/crawler/state";
import {
  computeRunEndsAt,
  sessionToTokenPayload,
  isUnlimitedQueue,
  isUnlimitedRunDuration,
} from "@/lib/crawler/types";
import { getDb } from "@/lib/db";
import { crawlerLogs, crawlerProcessed, crawlerQueue, crawlerState } from "@/lib/db/schema";
import { GitHubApiError } from "@/lib/github/client";
import { ReauthRequiredError } from "@/lib/auth/reauth-error";

function formatDelayLabel(seconds: number): string {
  if (seconds <= 0) {
    return "no delay";
  }
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "1 min" : `${m} min`;
  }
  return `${seconds}s`;
}

function formatQueueLimitLabel(limit: number): string {
  if (isUnlimitedQueue(limit)) {
    return "unlimited";
  }
  return String(limit);
}

function formatRunDurationLabel(minutes: number): string {
  if (isUnlimitedRunDuration(minutes)) {
    return "unlimited";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

async function applyRunWindow(ownerId: number, durationMinutes: number) {
  const db = getDb();
  await db
    .update(crawlerState)
    .set({
      runDurationMinutes: durationMinutes,
      runEndsAt: computeRunEndsAt(durationMinutes),
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerId));
}

function tokenPayloadFromSession(
  session: SessionPayload,
  accessToken: string,
) {
  return sessionToTokenPayload({
    ...session,
    accessToken,
  });
}

export async function startCrawler(
  session: SessionPayload,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = session.githubUserId;
  const state = await ensureCrawlerState(ownerId);
  const payload = tokenPayloadFromSession(session, accessToken);

  if (state.status === "running") {
    await setTokenCipher(ownerId, payload);
    await appendLog(ownerId, {
      type: "info",
      message: "● Already running",
    });
    return { ok: true };
  }

  await setTokenCipher(ownerId, payload);

  try {
    const { assertWorkerTokenWorks } = await import("@/lib/crawler/process");
    await assertWorkerTokenWorks(ownerId);
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      await appendLog(ownerId, {
        type: "error",
        message: "✗ GitHub token invalid — sign in again, then Start",
      });
      return { ok: false, error: "unauthorized" };
    }
    const message = error instanceof Error ? error.message : "token_check_failed";
    await appendLog(ownerId, {
      type: "error",
      message: `✗ GitHub token check failed — ${message}`,
    });
    return { ok: false, error: "unauthorized" };
  }

  const queueCount = await getQueueCount(ownerId);
  if (queueCount === 0) {
    try {
      const { fillCrawlerQueue } = await import("@/lib/crawler/process");
      await fillCrawlerQueue(ownerId, { log: true });
    } catch (error) {
      if (error instanceof ReauthRequiredError) {
        await appendLog(ownerId, {
          type: "error",
          message: "✗ GitHub token invalid — sign in again, then Start",
        });
        return { ok: false, error: "unauthorized" };
      }
      const message =
        error instanceof Error ? error.message : "seed_failed";
      await appendLog(ownerId, {
        type: "error",
        message: `✗ Failed to seed followers — ${message}`,
      });
      return { ok: false, error: "seed_failed" };
    }
  }

  await applyRunWindow(ownerId, state.runDurationMinutes);

  const db = getDb();
  await db
    .update(crawlerState)
    .set({
      runStartedAt: new Date(),
      runElapsedMs: 0,
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerId));

  await setCrawlerStatus(ownerId, "running", {
    lastError: null,
    currentUsername: null,
    currentGithubUserId: null,
  });
  await appendLog(ownerId, {
    type: "info",
    message: "● Started",
  });
  return { ok: true };
}

export async function stopCrawler(ownerId: number) {
  await ensureCrawlerState(ownerId);
  const db = getDb();
  await db
    .update(crawlerState)
    .set({
      runEndsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerId));
  await setCrawlerStatus(ownerId, "paused", {
    currentUsername: null,
    currentGithubUserId: null,
  });
  await appendLog(ownerId, {
    type: "info",
    message: "● Stopped",
  });
}

/** Add a profile's followers to the waiting queue (does not Start). */
export async function seedCrawlerFromProfile(
  session: SessionPayload,
  source: string,
  accessToken?: string,
): Promise<
  | { ok: true; added: number; login: string; page: number; cleared: number }
  | { ok: false; error: string; login?: string }
> {
  const ownerId = session.githubUserId;
  await ensureCrawlerState(ownerId);
  await setTokenCipher(
    ownerId,
    tokenPayloadFromSession(session, accessToken ?? session.accessToken),
  );

  try {
    const { seedQueueFromProfile } = await import("@/lib/crawler/process");
    const result = await seedQueueFromProfile(ownerId, source, { log: true });
    if (result.added <= 0) {
      return { ok: false, error: "seed_empty", login: result.login };
    }
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof Error && error.message === "validation") {
      return { ok: false, error: "validation" };
    }
    if (error instanceof ReauthRequiredError) {
      return { ok: false, error: "unauthorized" };
    }
    if (error instanceof GitHubApiError) {
      if (error.code === "not_found") {
        await appendLog(ownerId, {
          type: "error",
          message: "✗ Seed failed — profile not found",
        });
        return { ok: false, error: "not_found" };
      }
      if (error.code === "rate_limited") {
        return { ok: false, error: "rate_limited" };
      }
      if (error.code === "unauthorized") {
        return { ok: false, error: "unauthorized" };
      }
    }
    const message = error instanceof Error ? error.message : "seed_failed";
    await appendLog(ownerId, {
      type: "error",
      message: `✗ Failed to seed from profile — ${message}`,
    });
    return { ok: false, error: "seed_failed" };
  }
}

/** Clear waiting queue so the next Start re-seeds from your latest followers. */
export async function resetCrawler(
  ownerId: number,
  options: { hard?: boolean } = {},
) {
  await ensureCrawlerState(ownerId);
  const db = getDb();
  const hard = options.hard === true;

  if (hard) {
    await db
      .delete(crawlerQueue)
      .where(eq(crawlerQueue.ownerGithubUserId, ownerId));
    await db
      .delete(crawlerProcessed)
      .where(eq(crawlerProcessed.ownerGithubUserId, ownerId));
    await db
      .delete(crawlerLogs)
      .where(eq(crawlerLogs.ownerGithubUserId, ownerId));
  } else {
    await db
      .delete(crawlerQueue)
      .where(
        and(
          eq(crawlerQueue.ownerGithubUserId, ownerId),
          inArray(crawlerQueue.status, ["queued", "processing"]),
        ),
      );
  }

  await db
    .update(crawlerState)
    .set({
      status: "idle",
      currentUsername: null,
      currentGithubUserId: null,
      runEndsAt: null,
      runStartedAt: null,
      runElapsedMs: 0,
      lastError: null,
      workerId: null,
      workerLeaseUntil: null,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerId));

  await db.insert(crawlerLogs).values({
    ownerGithubUserId: ownerId,
    type: "info",
    message: hard
      ? "● Hard reset — queue, history, and counts cleared"
      : "● Reset — waiting queue cleared",
  });
}

export async function getCrawlerStatusPayload(ownerId: number) {
  const { getProcessedCounts, getQueueCount, listWaitingQueue } = await import(
    "@/lib/crawler/state"
  );
  const state = await ensureCrawlerState(ownerId);
  const counts = await getProcessedCounts(ownerId);
  const queueSize = await getQueueCount(ownerId);
  const waiting = await listWaitingQueue(ownerId, 80);

  return {
    status: state.status,
    currentUsername: state.currentUsername,
    currentGithubUserId: state.currentGithubUserId,
    delaySeconds: state.delaySeconds,
    queueLimit: state.queueLimit,
    runDurationMinutes: state.runDurationMinutes,
    runEndsAt: state.runEndsAt?.toISOString() ?? null,
    runStartedAt: state.runStartedAt?.toISOString() ?? null,
    runElapsedMs: state.runElapsedMs,
    queueSize,
    waitingQueue: waiting.map((row) => ({
      id: row.id,
      githubUserId: row.githubUserId,
      username: row.username,
      status: row.status,
      discoveredAt: row.discoveredAt.toISOString(),
    })),
    lastActivityAt: state.lastActivityAt?.toISOString() ?? null,
    lastError: state.lastError,
    counts,
    hasWorkerCredentials: Boolean(state.tokenCipher),
  };
}

export async function patchCrawlerSettings(
  ownerId: number,
  input: {
    delaySeconds?: number;
    queueLimit?: number;
    runDurationMinutes?: number;
  },
) {
  await ensureCrawlerState(ownerId);
  const db = getDb();

  const [current] = await db
    .select({
      status: crawlerState.status,
      runDurationMinutes: crawlerState.runDurationMinutes,
      runStartedAt: crawlerState.runStartedAt,
    })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerId))
    .limit(1);

  const patch: {
    delaySeconds?: number;
    queueLimit?: number;
    runDurationMinutes?: number;
    runEndsAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  let pauseForDuration = false;

  if (input.delaySeconds !== undefined) {
    if (!Number.isFinite(input.delaySeconds) || input.delaySeconds < 0) {
      throw new Error("validation");
    }
    patch.delaySeconds = Math.floor(input.delaySeconds);
  }
  if (input.queueLimit !== undefined) {
    if (
      !Number.isFinite(input.queueLimit) ||
      input.queueLimit < 0 ||
      input.queueLimit > 10_000
    ) {
      throw new Error("validation");
    }
    patch.queueLimit = Math.floor(input.queueLimit);
  }
  if (input.runDurationMinutes !== undefined) {
    if (
      !Number.isFinite(input.runDurationMinutes) ||
      input.runDurationMinutes < 0 ||
      input.runDurationMinutes > 60 * 24 * 7
    ) {
      throw new Error("validation");
    }
    const minutes = Math.floor(input.runDurationMinutes);
    patch.runDurationMinutes = minutes;
    // While running, end time is measured from this run's Start (runStartedAt).
    if (current?.status === "running") {
      const from = current.runStartedAt ?? new Date();
      const endsAt = computeRunEndsAt(minutes, from);
      patch.runEndsAt = endsAt;
      if (endsAt && endsAt.getTime() <= Date.now()) {
        pauseForDuration = true;
      }
    }
  }

  await db
    .update(crawlerState)
    .set(patch)
    .where(eq(crawlerState.ownerGithubUserId, ownerId));

  if (patch.delaySeconds !== undefined) {
    await appendLog(ownerId, {
      type: "settings",
      message: `● Delay set to ${formatDelayLabel(patch.delaySeconds)}`,
    });
  }
  if (patch.queueLimit !== undefined) {
    await appendLog(ownerId, {
      type: "settings",
      message: `● Queue limit set to ${formatQueueLimitLabel(patch.queueLimit)}`,
    });
  }
  if (patch.runDurationMinutes !== undefined) {
    await appendLog(ownerId, {
      type: "settings",
      message: `● Run duration set to ${formatRunDurationLabel(patch.runDurationMinutes)}`,
    });
  }

  if (pauseForDuration) {
    await db
      .update(crawlerState)
      .set({ runEndsAt: null, updatedAt: new Date() })
      .where(eq(crawlerState.ownerGithubUserId, ownerId));
    await setCrawlerStatus(ownerId, "paused", {
      currentUsername: null,
      currentGithubUserId: null,
      lastError: null,
    });
    await appendLog(ownerId, {
      type: "info",
      message: "⏸ Time limit reached — paused",
    });
    return;
  }

  // Raising the limit (or any queue change) while running: try to fill free slots.
  if (patch.queueLimit !== undefined && current?.status === "running") {
    try {
      const { reseedOwnFollowersIfNeeded } = await import(
        "@/lib/crawler/process"
      );
      await reseedOwnFollowersIfNeeded(ownerId);
    } catch (error) {
      console.error("[crawler] settings reseed error", error);
    }
  }
}
