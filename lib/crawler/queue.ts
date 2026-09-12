import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { crawlerProcessed, crawlerQueue, crawlerState } from "@/lib/db/schema";
import type { LatestFollower } from "@/lib/github/latest-followers";
import { isUnlimitedQueue } from "@/lib/crawler/types";

export async function isKnownUser(
  ownerGithubUserId: number,
  githubUserId: number,
): Promise<boolean> {
  const db = getDb();
  const [queued] = await db
    .select({ id: crawlerQueue.id })
    .from(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerQueue.githubUserId, githubUserId),
      ),
    )
    .limit(1);
  if (queued) {
    return true;
  }

  const [processed] = await db
    .select({ id: crawlerProcessed.id })
    .from(crawlerProcessed)
    .where(
      and(
        eq(crawlerProcessed.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerProcessed.githubUserId, githubUserId),
      ),
    )
    .limit(1);
  return Boolean(processed);
}

export async function enqueueFollowers(
  ownerGithubUserId: number,
  followers: LatestFollower[],
  options: { excludeGithubUserId?: number; queueLimit: number },
): Promise<number> {
  const db = getDb();
  let added = 0;

  const [active] = await db
    .select({
      value: sql<number>`count(*)::int`,
    })
    .from(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        inArray(crawlerQueue.status, ["queued", "processing"]),
      ),
    );

  const unlimited = isUnlimitedQueue(options.queueLimit);
  let remaining = unlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, options.queueLimit - (active?.value ?? 0));
  if (!unlimited && remaining <= 0) {
    return 0;
  }

  for (const follower of followers) {
    if (remaining <= 0) {
      break;
    }
    if (
      options.excludeGithubUserId !== undefined &&
      follower.id === options.excludeGithubUserId
    ) {
      continue;
    }

    const known = await isKnownUser(ownerGithubUserId, follower.id);
    if (known) {
      continue;
    }

    try {
      await db.insert(crawlerQueue).values({
        ownerGithubUserId,
        githubUserId: follower.id,
        username: follower.login,
        status: "queued",
      });
      added += 1;
      remaining -= 1;
    } catch {
      // unique constraint — already present
    }
  }

  return added;
}

export async function claimNextQueued(ownerGithubUserId: number) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: crawlerQueue.id,
        githubUserId: crawlerQueue.githubUserId,
        username: crawlerQueue.username,
      })
      .from(crawlerQueue)
      .where(
        and(
          eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
          eq(crawlerQueue.status, "queued"),
        ),
      )
      .orderBy(asc(crawlerQueue.discoveredAt), asc(crawlerQueue.id))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!row) {
      return null;
    }

    await tx
      .update(crawlerQueue)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(crawlerQueue.id, row.id));

    await tx
      .update(crawlerState)
      .set({
        currentUsername: row.username,
        currentGithubUserId: row.githubUserId,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId));

    return row;
  });
}

export async function listInterruptedProcessing(ownerGithubUserId: number) {
  const db = getDb();
  return db
    .select()
    .from(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerQueue.status, "processing"),
      ),
    )
    .orderBy(asc(crawlerQueue.discoveredAt), asc(crawlerQueue.id));
}

export async function finishQueueItem(
  id: number,
  status: "done" | "failed" | "skipped",
  error?: string | null,
) {
  const db = getDb();
  await db
    .update(crawlerQueue)
    .set({
      status,
      error: error ?? null,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(crawlerQueue.id, id));
}
