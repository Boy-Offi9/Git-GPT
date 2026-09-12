import { and, asc, count, desc, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { encryptJson, decryptJson } from "@/lib/auth/crypto";
import { getDb } from "@/lib/db";
import {
  crawlerLogs,
  crawlerProcessed,
  crawlerQueue,
  crawlerState,
  type CrawlerStatus,
  type ProcessedResult,
} from "@/lib/db/schema";
import {
  DEFAULT_DELAY_SECONDS,
  DEFAULT_QUEUE_LIMIT,
  LEASE_MS,
  type CrawlerTokenPayload,
} from "@/lib/crawler/types";

export async function ensureCrawlerState(ownerGithubUserId: number) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [row] = await db
    .insert(crawlerState)
    .values({
      ownerGithubUserId,
      status: "idle",
      delaySeconds: DEFAULT_DELAY_SECONDS,
      queueLimit: DEFAULT_QUEUE_LIMIT,
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    return row;
  }

  const [again] = await db
    .select()
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!again) {
    throw new Error("failed_to_create_crawler_state");
  }
  return again;
}

export async function setTokenCipher(
  ownerGithubUserId: number,
  payload: CrawlerTokenPayload,
) {
  if (!payload.accessToken) {
    throw new Error("crawler_token_missing");
  }
  const cipher = await encryptJson(payload);
  // Fail fast if SESSION_SECRET cannot round-trip (misconfigured worker/web).
  const verified = await decryptJson<CrawlerTokenPayload>(cipher);
  if (!verified?.accessToken || verified.accessToken !== payload.accessToken) {
    throw new Error("crawler_token_encrypt_failed");
  }
  const db = getDb();
  await db
    .update(crawlerState)
    .set({
      tokenCipher: cipher,
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));
}

export async function loadTokenPayload(
  ownerGithubUserId: number,
): Promise<CrawlerTokenPayload | null> {
  const db = getDb();
  const [row] = await db
    .select({ tokenCipher: crawlerState.tokenCipher })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!row?.tokenCipher) {
    return null;
  }
  return decryptJson<CrawlerTokenPayload>(row.tokenCipher);
}

export async function updateTokenPayload(
  ownerGithubUserId: number,
  payload: CrawlerTokenPayload,
) {
  await setTokenCipher(ownerGithubUserId, payload);
}

export async function setCrawlerStatus(
  ownerGithubUserId: number,
  status: CrawlerStatus,
  extras: {
    lastError?: string | null;
    currentUsername?: string | null;
    currentGithubUserId?: number | null;
    clearToken?: boolean;
  } = {},
) {
  const db = getDb();
  const [current] = await db
    .select({
      status: crawlerState.status,
      runStartedAt: crawlerState.runStartedAt,
    })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);

  const leavingRun =
    current?.status === "running" &&
    status !== "running" &&
    current.runStartedAt != null;

  await db
    .update(crawlerState)
    .set({
      status,
      lastError: extras.lastError === undefined ? undefined : extras.lastError,
      currentUsername:
        extras.currentUsername === undefined
          ? undefined
          : extras.currentUsername,
      currentGithubUserId:
        extras.currentGithubUserId === undefined
          ? undefined
          : extras.currentGithubUserId,
      tokenCipher: extras.clearToken ? null : undefined,
      ...(leavingRun
        ? {
            runElapsedMs: Math.max(
              0,
              Date.now() - current.runStartedAt!.getTime(),
            ),
            runStartedAt: null,
          }
        : {}),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));
}

export async function touchActivity(ownerGithubUserId: number) {
  const db = getDb();
  await db
    .update(crawlerState)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));
}

export async function updateSettings(
  ownerGithubUserId: number,
  settings: { delaySeconds?: number; queueLimit?: number },
) {
  const db = getDb();
  await db
    .update(crawlerState)
    .set({
      delaySeconds: settings.delaySeconds,
      queueLimit: settings.queueLimit,
      updatedAt: new Date(),
    })
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));
}

export async function appendLog(
  ownerGithubUserId: number,
  input: {
    type: string;
    message: string;
    githubUserId?: number | null;
    username?: string | null;
  },
) {
  const db = getDb();
  await db.insert(crawlerLogs).values({
    ownerGithubUserId,
    type: input.type,
    message: input.message,
    githubUserId: input.githubUserId ?? null,
    username: input.username ?? null,
  });
  await touchActivity(ownerGithubUserId);
}

export async function getQueueCount(ownerGithubUserId: number) {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        inArray(crawlerQueue.status, ["queued", "processing"]),
      ),
    );
  return row?.value ?? 0;
}

/** Waiting + in-progress queue rows, oldest first (claim order). */
export async function listWaitingQueue(
  ownerGithubUserId: number,
  limit = 80,
) {
  const db = getDb();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
  return db
    .select({
      id: crawlerQueue.id,
      githubUserId: crawlerQueue.githubUserId,
      username: crawlerQueue.username,
      status: crawlerQueue.status,
      discoveredAt: crawlerQueue.discoveredAt,
    })
    .from(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        inArray(crawlerQueue.status, ["queued", "processing"]),
      ),
    )
    .orderBy(asc(crawlerQueue.discoveredAt), asc(crawlerQueue.id))
    .limit(safeLimit);
}

export async function getProcessedCounts(ownerGithubUserId: number) {
  const db = getDb();
  const rows = await db
    .select({
      result: crawlerProcessed.result,
      value: count(),
    })
    .from(crawlerProcessed)
    .where(eq(crawlerProcessed.ownerGithubUserId, ownerGithubUserId))
    .groupBy(crawlerProcessed.result);

  const counts = {
    followed: 0,
    skipped: 0,
    failed: 0,
    discovered: 0,
  };

  for (const row of rows) {
    if (row.result === "followed") {
      counts.followed = row.value;
    } else if (row.result === "failed") {
      counts.failed = row.value;
    } else if (
      row.result === "skipped_already_following" ||
      row.result === "skipped_already_processed"
    ) {
      counts.skipped += row.value;
    }
  }

  const [discovered] = await db
    .select({ value: count() })
    .from(crawlerQueue)
    .where(eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId));
  const [processedTotal] = await db
    .select({ value: count() })
    .from(crawlerProcessed)
    .where(eq(crawlerProcessed.ownerGithubUserId, ownerGithubUserId));

  counts.discovered = (discovered?.value ?? 0) + (processedTotal?.value ?? 0);
  return counts;
}

export async function listRecentLogs(
  ownerGithubUserId: number,
  limit?: number | null,
) {
  const db = getDb();
  const base = db
    .select()
    .from(crawlerLogs)
    .where(eq(crawlerLogs.ownerGithubUserId, ownerGithubUserId))
    .orderBy(desc(crawlerLogs.createdAt), desc(crawlerLogs.id));

  if (limit == null || limit <= 0) {
    return base;
  }
  return base.limit(limit);
}

/** Delete all logs for this owner created up to now. Newer inserts stay. */
export async function clearCrawlerLogs(ownerGithubUserId: number) {
  const db = getDb();
  const until = new Date();
  await db
    .delete(crawlerLogs)
    .where(
      and(
        eq(crawlerLogs.ownerGithubUserId, ownerGithubUserId),
        lte(crawlerLogs.createdAt, until),
      ),
    );
}

export async function tryClaimLease(
  ownerGithubUserId: number,
  workerId: string,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);

  const updated = await db
    .update(crawlerState)
    .set({
      workerId,
      workerLeaseUntil: leaseUntil,
      updatedAt: now,
    })
    .where(
      and(
        eq(crawlerState.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerState.status, "running"),
        or(
          isNull(crawlerState.workerId),
          eq(crawlerState.workerId, workerId),
          isNull(crawlerState.workerLeaseUntil),
          lt(crawlerState.workerLeaseUntil, now),
        ),
      ),
    )
    .returning({ ownerGithubUserId: crawlerState.ownerGithubUserId });

  return updated.length > 0;
}

export async function renewLease(
  ownerGithubUserId: number,
  workerId: string,
): Promise<boolean> {
  const db = getDb();
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const updated = await db
    .update(crawlerState)
    .set({
      workerLeaseUntil: leaseUntil,
      updatedAt: now,
      lastActivityAt: now,
    })
    .where(
      and(
        eq(crawlerState.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerState.workerId, workerId),
        eq(crawlerState.status, "running"),
      ),
    )
    .returning({ ownerGithubUserId: crawlerState.ownerGithubUserId });
  return updated.length > 0;
}

export async function listRunningOwners() {
  const db = getDb();
  return db
    .select({
      ownerGithubUserId: crawlerState.ownerGithubUserId,
      status: crawlerState.status,
    })
    .from(crawlerState)
    .where(eq(crawlerState.status, "running"));
}

export async function markProcessed(
  ownerGithubUserId: number,
  githubUserId: number,
  username: string,
  result: ProcessedResult,
) {
  const db = getDb();
  await db
    .insert(crawlerProcessed)
    .values({
      ownerGithubUserId,
      githubUserId,
      username,
      result,
      processedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [
        crawlerProcessed.ownerGithubUserId,
        crawlerProcessed.githubUserId,
      ],
    });
}
