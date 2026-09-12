import { and, asc, eq, isNull } from "drizzle-orm";
import { refreshAccessToken, tokensFromResponse } from "@/lib/auth/oauth";
import { isAccessTokenFresh } from "@/lib/auth/access-token";
import { ReauthRequiredError } from "@/lib/auth/reauth-error";
import {
  appendLog,
  getQueueCount,
  loadTokenPayload,
  markProcessed,
  setCrawlerStatus,
  updateTokenPayload,
} from "@/lib/crawler/state";
import {
  claimNextQueued,
  enqueueFollowers,
  finishQueueItem,
  isKnownUser,
  listInterruptedProcessing,
} from "@/lib/crawler/queue";
import {
  LATEST_FOLLOWERS_LIMIT,
  OWN_FOLLOWERS_SEED_PAGES,
  isUnlimitedQueue,
  type CrawlerTokenPayload,
} from "@/lib/crawler/types";
import { getDb } from "@/lib/db";
import { crawlerProcessed, crawlerQueue, crawlerState } from "@/lib/db/schema";
import { followUser } from "@/lib/github/follow";
import { GitHubApiError } from "@/lib/github/client";
import { isFollowingUser } from "@/lib/github/is-following";
import {
  listOwnLatestFollowers,
  listUserLatestFollowers,
} from "@/lib/github/latest-followers";
import { normalizeGithubFollowersUrl } from "@/lib/github/html-followers-url";

async function refreshWorkerPayload(
  ownerGithubUserId: number,
  payload: CrawlerTokenPayload,
): Promise<CrawlerTokenPayload> {
  if (!payload.refreshToken) {
    throw new ReauthRequiredError();
  }
  if (
    payload.refreshTokenExpiresAt &&
    payload.refreshTokenExpiresAt <= Date.now()
  ) {
    throw new ReauthRequiredError();
  }

  const response = await refreshAccessToken(payload.refreshToken);
  const tokens = tokensFromResponse(response);
  if (!tokens) {
    throw new ReauthRequiredError();
  }

  const next: CrawlerTokenPayload = {
    ...payload,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? payload.refreshToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt:
      tokens.refreshTokenExpiresAt ?? payload.refreshTokenExpiresAt,
  };
  await updateTokenPayload(ownerGithubUserId, next);
  return next;
}

/**
 * Prefer a fresh access token; if the clock says it expired but there is no
 * refresh token, still return it and let GitHub accept/reject (OAuth apps
 * without expiring tokens often have no refresh_token).
 */
async function getValidWorkerToken(
  ownerGithubUserId: number,
): Promise<CrawlerTokenPayload> {
  const payload = await loadTokenPayload(ownerGithubUserId);
  if (!payload?.accessToken) {
    throw new ReauthRequiredError();
  }

  if (isAccessTokenFresh(payload)) {
    return payload;
  }

  if (!payload.refreshToken) {
    return payload;
  }

  try {
    return await refreshWorkerPayload(ownerGithubUserId, payload);
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      // Last resort: try the stored access token anyway.
      return payload;
    }
    throw error;
  }
}

async function withWorkerGitHubRetry<T>(
  ownerGithubUserId: number,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const first = await getValidWorkerToken(ownerGithubUserId);
  try {
    return await fn(first.accessToken);
  } catch (error) {
    if (error instanceof GitHubApiError && error.code === "unauthorized") {
      const current = await loadTokenPayload(ownerGithubUserId);
      if (!current?.refreshToken) {
        throw new ReauthRequiredError();
      }
      const refreshed = await refreshWorkerPayload(ownerGithubUserId, current);
      return fn(refreshed.accessToken);
    }
    throw error;
  }
}

/** Confirm the DB-stored crawler token can call the GitHub API. */
export async function assertWorkerTokenWorks(
  ownerGithubUserId: number,
): Promise<void> {
  const { getAuthenticatedUser } = await import("@/lib/github/user");
  await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
    getAuthenticatedUser(token),
  );
}

/**
 * Fill waiting queue: own followers (several pages), then — if still empty —
 * latest followers of recently processed users.
 */
export async function fillCrawlerQueue(
  ownerGithubUserId: number,
  options: { log?: boolean } = {},
): Promise<number> {
  const shouldLog = options.log !== false;
  const db = getDb();
  const [state] = await db
    .select({
      queueLimit: crawlerState.queueLimit,
    })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!state) {
    return 0;
  }

  const queueLimit = state.queueLimit;
  const unlimited = isUnlimitedQueue(queueLimit);
  let totalAdded = 0;
  let fromOwn = 0;
  let fromNetwork = 0;

  async function hasRoom(): Promise<boolean> {
    if (unlimited) {
      return true;
    }
    return (await getQueueCount(ownerGithubUserId)) < queueLimit;
  }

  for (let page = 1; page <= OWN_FOLLOWERS_SEED_PAGES; page++) {
    if (!(await hasRoom())) {
      break;
    }
    const followers = await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
      listOwnLatestFollowers(token, LATEST_FOLLOWERS_LIMIT, page),
    );
    const added = await enqueueFollowers(ownerGithubUserId, followers, {
      excludeGithubUserId: ownerGithubUserId,
      queueLimit,
    });
    totalAdded += added;
    fromOwn += added;
    if (followers.length < LATEST_FOLLOWERS_LIMIT) {
      break;
    }
  }

  if ((await getQueueCount(ownerGithubUserId)) === 0) {
    fromNetwork = await expandProcessedWavesUntilQueued(ownerGithubUserId, {
      log: false,
    });
    totalAdded += fromNetwork;
  }

  if (shouldLog) {
    if (totalAdded > 0 && fromNetwork > 0 && fromOwn === 0) {
      await appendLog(ownerGithubUserId, {
        type: "info",
        message: `● Seeded ${totalAdded} user(s) from next processed wave`,
      });
    } else if (totalAdded > 0) {
      await appendLog(ownerGithubUserId, {
        type: "info",
        message: `● Seeded ${totalAdded} user(s)${fromNetwork > 0 ? " (own + wave)" : " from your followers"}`,
      });
    } else {
      await appendLog(ownerGithubUserId, {
        type: "info",
        message:
          "● Seeded 0 — no new users found (already known in queue/processed)",
      });
    }
  }

  return totalAdded;
}

/**
 * When the waiting queue is empty: take the oldest processed user who has not
 * yet contributed a follower wave, enqueue up to LATEST_FOLLOWERS_LIMIT of
 * their latest followers, then stop (so that wave is fully followed before
 * the next parent expands). Skips parents that yield nobody new.
 */
export async function expandProcessedWavesUntilQueued(
  ownerGithubUserId: number,
  options: { log?: boolean } = {},
): Promise<number> {
  const shouldLog = options.log !== false;
  let totalAdded = 0;
  /** Cap how many empty parents we skip in one refill. */
  const maxSkips = 40;

  for (let i = 0; i < maxSkips; i++) {
    if ((await getQueueCount(ownerGithubUserId)) > 0) {
      return totalAdded;
    }

    const added = await expandOneProcessedParent(ownerGithubUserId, {
      log: shouldLog,
    });
    if (added === null) {
      return totalAdded;
    }
    totalAdded += added;
    if (added > 0) {
      return totalAdded;
    }
  }

  return totalAdded;
}

/**
 * Expand a single unexpanded processed parent into the queue.
 * @returns number added, or `null` when no parent remains.
 */
async function expandOneProcessedParent(
  ownerGithubUserId: number,
  options: { log?: boolean } = {},
): Promise<number | null> {
  const shouldLog = options.log !== false;
  const db = getDb();

  const [parent] = await db
    .select({
      id: crawlerProcessed.id,
      username: crawlerProcessed.username,
    })
    .from(crawlerProcessed)
    .where(
      and(
        eq(crawlerProcessed.ownerGithubUserId, ownerGithubUserId),
        isNull(crawlerProcessed.networkExpandedAt),
      ),
    )
    .orderBy(asc(crawlerProcessed.processedAt), asc(crawlerProcessed.id))
    .limit(1);

  if (!parent) {
    return null;
  }

  const [state] = await db
    .select({ queueLimit: crawlerState.queueLimit })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  const queueLimit = state?.queueLimit ?? 50;

  let added = 0;
  try {
    const followers = await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
      listUserLatestFollowers(
        token,
        parent.username,
        LATEST_FOLLOWERS_LIMIT,
      ),
    );
    added = await enqueueFollowers(ownerGithubUserId, followers, {
      excludeGithubUserId: ownerGithubUserId,
      queueLimit,
    });
  } catch (error) {
    if (
      error instanceof GitHubApiError &&
      error.code === "rate_limited"
    ) {
      throw error;
    }
    if (error instanceof ReauthRequiredError) {
      throw error;
    }
    // Mark expanded so a bad parent cannot stall the wave forever.
    if (shouldLog) {
      await appendLog(ownerGithubUserId, {
        type: "info",
        message: `● Wave skipped @${parent.username} — could not list followers`,
      });
    }
  }

  await db
    .update(crawlerProcessed)
    .set({ networkExpandedAt: new Date() })
    .where(eq(crawlerProcessed.id, parent.id));

  if (shouldLog && added > 0) {
    await appendLog(ownerGithubUserId, {
      type: "info",
      message: `● Wave: queued ${added} from @${parent.username} followers`,
    });
  }

  return added;
}

export async function seedQueueFromOwnFollowers(
  ownerGithubUserId: number,
  _queueLimit: number,
  options: { logAlways?: boolean } = {},
) {
  return fillCrawlerQueue(ownerGithubUserId, {
    log: options.logAlways !== false,
  });
}

/**
 * Enqueue latest followers of an arbitrary GitHub profile
 * (`username` or `https://github.com/user`). Does not start the crawler.
 *
 * Uses github.com followers HTML (website order). Collects new users first,
 * then replaces the waiting (`queued`) line so Start processes this seed next.
 */
export async function seedQueueFromProfile(
  ownerGithubUserId: number,
  source: string,
  options: { log?: boolean } = {},
): Promise<{ added: number; login: string; page: number; cleared: number }> {
  const shouldLog = options.log !== false;
  const { login, page: startPage } = normalizeGithubFollowersUrl(source);

  const db = getDb();
  const [state] = await db
    .select({
      queueLimit: crawlerState.queueLimit,
    })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!state) {
    return { added: 0, login, page: startPage, cleared: 0 };
  }

  const unlimited = isUnlimitedQueue(state.queueLimit);
  const room = unlimited
    ? LATEST_FOLLOWERS_LIMIT
    : Math.max(1, Math.min(LATEST_FOLLOWERS_LIMIT, state.queueLimit));

  /** Full HTML tab page (~50), then take the first N unknown. */
  const htmlPageScan = 50;

  const picked: {
    id: number;
    login: string;
    avatarUrl: string;
    htmlUrl: string;
  }[] = [];
  const seen = new Set<number>();
  let lastPage = startPage;
  const maxPages = 3;

  for (let page = startPage; page < startPage + maxPages; page++) {
    lastPage = page;
    const followers = await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
      listUserLatestFollowers(token, login, htmlPageScan, page),
    );
    if (followers.length === 0) {
      break;
    }

    for (const follower of followers) {
      if (picked.length >= room) {
        break;
      }
      if (follower.id === ownerGithubUserId || seen.has(follower.id)) {
        continue;
      }
      seen.add(follower.id);
      if (await isKnownUser(ownerGithubUserId, follower.id)) {
        continue;
      }
      picked.push(follower);
    }

    if (picked.length >= room) {
      break;
    }
    if (followers.length < htmlPageScan) {
      break;
    }
  }

  if (picked.length === 0) {
    if (shouldLog) {
      await appendLog(ownerGithubUserId, {
        type: "info",
        message: `● No new users from @${login} followers — already known or empty`,
      });
    }
    return { added: 0, login, page: lastPage, cleared: 0 };
  }

  const clearedRows = await db
    .delete(crawlerQueue)
    .where(
      and(
        eq(crawlerQueue.ownerGithubUserId, ownerGithubUserId),
        eq(crawlerQueue.status, "queued"),
      ),
    )
    .returning({ id: crawlerQueue.id });
  const cleared = clearedRows.length;

  const added = await enqueueFollowers(ownerGithubUserId, picked, {
    excludeGithubUserId: ownerGithubUserId,
    queueLimit: state.queueLimit,
  });

  if (shouldLog) {
    await appendLog(ownerGithubUserId, {
      type: "info",
      message: `● Seeded ${added} from @${login} latest followers (HTML p${lastPage}${cleared > 0 ? `, cleared ${cleared} waiting` : ""})`,
    });
  }

  return { added, login, page: lastPage, cleared };
}

/** Fill the queue when Running and there is room / it is empty. */
export async function reseedOwnFollowersIfNeeded(
  ownerGithubUserId: number,
): Promise<number> {
  const db = getDb();
  const [state] = await db
    .select({
      status: crawlerState.status,
    })
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!state || state.status !== "running") {
    return 0;
  }

  if ((await getQueueCount(ownerGithubUserId)) === 0) {
    try {
      const waveAdded = await expandProcessedWavesUntilQueued(
        ownerGithubUserId,
        {
          log: true,
        },
      );
      if (waveAdded > 0) {
        return waveAdded;
      }
    } catch (error) {
      if (error instanceof GitHubApiError && error.code === "rate_limited") {
        await handleRateLimit(ownerGithubUserId, error);
        return 0;
      }
      if (error instanceof ReauthRequiredError) {
        await setCrawlerStatus(ownerGithubUserId, "error", {
          lastError: "GitHub session expired — sign in again and Start",
          clearToken: true,
        });
        await appendLog(ownerGithubUserId, {
          type: "error",
          message: "✗ Token expired — sign in again, then Start",
        });
        return 0;
      }
      throw error;
    }
  }

  const added = await fillCrawlerQueue(ownerGithubUserId, { log: false });
  if (added > 0) {
    await appendLog(ownerGithubUserId, {
      type: "info",
      message: `● Seeded ${added} user(s) into queue`,
    });
  }
  return added;
}

async function handleRateLimit(
  ownerGithubUserId: number,
  error: GitHubApiError,
) {
  const retryHint =
    error.rateLimit?.retryAfterSeconds != null
      ? ` (retry after ${error.rateLimit.retryAfterSeconds}s)`
      : error.rateLimit?.resetAt
        ? ` (resets at ${new Date(error.rateLimit.resetAt).toISOString()})`
        : "";
  await setCrawlerStatus(ownerGithubUserId, "rate_limited", {
    lastError: `GitHub rate limit${retryHint}`,
    currentUsername: null,
    currentGithubUserId: null,
  });
  await appendLog(ownerGithubUserId, {
    type: "rate_limited",
    message: `⏸ Paused — GitHub rate limit or abuse detection${retryHint}`,
  });
}

async function completeItem(
  ownerGithubUserId: number,
  item: { id: number; githubUserId: number; username: string },
  result:
    | "followed"
    | "skipped_already_following"
    | "skipped_already_processed"
    | "failed",
  message: string,
  errorText?: string,
) {
  await markProcessed(
    ownerGithubUserId,
    item.githubUserId,
    item.username,
    result,
  );
  const queueStatus =
    result === "failed"
      ? "failed"
      : result.startsWith("skipped")
        ? "skipped"
        : "done";
  await finishQueueItem(item.id, queueStatus, errorText ?? null);
  await appendLog(ownerGithubUserId, {
    type: result,
    message,
    githubUserId: item.githubUserId,
    username: item.username,
  });
}

export async function recoverInterrupted(
  ownerGithubUserId: number,
): Promise<"ok" | "paused" | "error"> {
  const interrupted = await listInterruptedProcessing(ownerGithubUserId);
  for (const row of interrupted) {
    const item = {
      id: row.id,
      githubUserId: row.githubUserId,
      username: row.username,
    };
    try {
      const following = await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
        isFollowingUser(token, item.username),
      );
      if (following) {
        await completeItem(
          ownerGithubUserId,
          item,
          "skipped_already_following",
          `↷ Skipped @${item.username} - already following`,
        );
      } else {
        await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
          followUser(token, item.username),
        );
        await completeItem(
          ownerGithubUserId,
          item,
          "followed",
          `✓ Followed @${item.username}`,
        );
      }
    } catch (error) {
      if (error instanceof GitHubApiError && error.code === "rate_limited") {
        await handleRateLimit(ownerGithubUserId, error);
        return "paused";
      }
      if (error instanceof ReauthRequiredError) {
        await setCrawlerStatus(ownerGithubUserId, "error", {
          lastError: "GitHub session expired — sign in again and Start",
          clearToken: true,
        });
        await appendLog(ownerGithubUserId, {
          type: "error",
          message: "✗ Token expired — sign in again, then Start",
        });
        return "error";
      }
      const msg =
        error instanceof GitHubApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : "unknown";
      await completeItem(
        ownerGithubUserId,
        item,
        "failed",
        `✗ Failed @${item.username} - GitHub API error (${msg})`,
        msg,
      );
    }
  }
  return "ok";
}

export async function processOneQueuedUser(
  ownerGithubUserId: number,
): Promise<"processed" | "empty" | "paused" | "error"> {
  const db = getDb();
  const [state] = await db
    .select()
    .from(crawlerState)
    .where(eq(crawlerState.ownerGithubUserId, ownerGithubUserId))
    .limit(1);
  if (!state || state.status !== "running") {
    return "paused";
  }

  const item = await claimNextQueued(ownerGithubUserId);
  if (!item) {
    await setCrawlerStatus(ownerGithubUserId, "running", {
      currentUsername: null,
      currentGithubUserId: null,
      lastError: null,
    });
    return "empty";
  }

  try {
    const [knownProcessed] = await db
      .select({ id: crawlerProcessed.id })
      .from(crawlerProcessed)
      .where(
        and(
          eq(crawlerProcessed.ownerGithubUserId, ownerGithubUserId),
          eq(crawlerProcessed.githubUserId, item.githubUserId),
        ),
      )
      .limit(1);
    if (knownProcessed) {
      await completeItem(
        ownerGithubUserId,
        item,
        "skipped_already_processed",
        `↷ Skipped @${item.username} - already processed`,
      );
      return "processed";
    }

    const following = await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
      isFollowingUser(token, item.username),
    );
    if (following) {
      await completeItem(
        ownerGithubUserId,
        item,
        "skipped_already_following",
        `↷ Skipped @${item.username} - already following`,
      );
    } else {
      await withWorkerGitHubRetry(ownerGithubUserId, (token) =>
        followUser(token, item.username),
      );
      await completeItem(
        ownerGithubUserId,
        item,
        "followed",
        `✓ Followed @${item.username}`,
      );
    }

    return "processed";
  } catch (error) {
    if (error instanceof GitHubApiError && error.code === "rate_limited") {
      await handleRateLimit(ownerGithubUserId, error);
      return "paused";
    }
    if (error instanceof ReauthRequiredError) {
      await setCrawlerStatus(ownerGithubUserId, "error", {
        lastError: "GitHub session expired — sign in again and Start",
        clearToken: true,
      });
      await appendLog(ownerGithubUserId, {
        type: "error",
        message: "✗ Token expired — sign in again, then Start",
      });
      return "error";
    }
    const msg =
      error instanceof GitHubApiError
        ? error.code
        : error instanceof Error
          ? error.message
          : "unknown";
    await completeItem(
      ownerGithubUserId,
      item,
      "failed",
      `✗ Failed @${item.username} - GitHub API error (${msg})`,
      msg,
    );
    return "processed";
  }
}
