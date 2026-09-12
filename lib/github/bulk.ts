import type {
  BulkUnfollowProgress,
  BulkUnfollowResult,
  UnfollowErrorCode,
} from "@/types/github";
import { emptyBulkProgress } from "@/types/github";

export type UnfollowFn = (username: string) => Promise<void>;

export type BulkUnfollowOptions = {
  concurrency?: number;
  /** Delay between starting successive mutations (ms). Applied after each finished request when concurrency is 1. */
  delayMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: BulkUnfollowProgress) => void;
};

function mapUnfollowError(error: unknown): UnfollowErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    if (code === "unauthorized") return "unauthorized";
    if (code === "rate_limited") return "rate_limited";
    if (code === "not_found") return "not_found";
    if (code === "validation") return "validation";
  }
  if (error instanceof Error && error.message === "validation") {
    return "validation";
  }
  if (error instanceof Error && error.message === "reauth_required") {
    return "unauthorized";
  }
  return "failed";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runBulkUnfollow(
  usernames: string[],
  unfollow: UnfollowFn,
  options: BulkUnfollowOptions = {},
): Promise<BulkUnfollowResult> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const result: BulkUnfollowResult = {
    succeeded: [],
    failed: [],
    aborted: [],
  };

  let index = 0;
  let sent = 0;
  let abort: "unauthorized" | "rate_limited" | "cancelled" | null = null;
  const inFlight = new Set<string>();

  function emit() {
    options.onProgress?.({
      total: usernames.length,
      sent,
      remaining: Math.max(0, usernames.length - sent),
      succeeded: result.succeeded.length,
      failed: result.failed.length,
      inFlight: inFlight.size,
      current: [...inFlight],
    });
  }

  function requestAbort(
    reason: "unauthorized" | "rate_limited" | "cancelled",
  ) {
    if (!abort) {
      abort = reason;
    }
  }

  if (options.signal?.aborted) {
    result.aborted = [...usernames];
    result.abortReason = "cancelled";
    options.onProgress?.(emptyBulkProgress(usernames.length));
    return result;
  }

  const onAbort = () => requestAbort("cancelled");
  options.signal?.addEventListener("abort", onAbort);
  emit();

  async function worker() {
    while (index < usernames.length) {
      if (abort) {
        return;
      }

      const current = index;
      index += 1;
      const username = usernames[current];

      if (abort) {
        result.aborted.push(username);
        return;
      }

      sent += 1;
      inFlight.add(username);
      emit();

      try {
        await unfollow(username);
        result.succeeded.push(username);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          requestAbort("cancelled");
          result.aborted.push(username);
        } else {
          const code = mapUnfollowError(error);
          if (code === "unauthorized" || code === "rate_limited") {
            requestAbort(code);
            result.failed.push({ username, error: code });
          } else {
            result.failed.push({ username, error: code });
          }
        }
      } finally {
        inFlight.delete(username);
        emit();
      }

      if (
        !abort &&
        delayMs > 0 &&
        concurrency === 1 &&
        index < usernames.length
      ) {
        try {
          await sleep(delayMs, options.signal);
        } catch {
          requestAbort("cancelled");
          for (let i = index; i < usernames.length; i += 1) {
            result.aborted.push(usernames[i]);
          }
          return;
        }
      }
    }
  }

  try {
    const workers = Array.from(
      { length: Math.min(concurrency, usernames.length) },
      () => worker(),
    );
    await Promise.all(workers);
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (abort) {
    result.abortReason = abort;
    for (let i = index; i < usernames.length; i += 1) {
      if (!result.aborted.includes(usernames[i]) && !result.succeeded.includes(usernames[i]) && !result.failed.some((f) => f.username === usernames[i])) {
        result.aborted.push(usernames[i]);
      }
    }
    emit();
  }

  return result;
}

export function summarizeBulkResult(result: BulkUnfollowResult): {
  succeeded: number;
  failed: number;
  aborted: number;
} {
  return {
    succeeded: result.succeeded.length,
    failed: result.failed.length,
    aborted: result.aborted.length,
  };
}
