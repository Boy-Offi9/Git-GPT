"use client";

import type { BulkUnfollowProgress, UnfollowErrorCode } from "@/types/github";
import { runBulkUnfollow } from "@/lib/github/bulk";
import { parseRepoFullName } from "@/lib/github/validate";

type ActionResponse = {
  ok?: boolean;
  fullName?: string;
  error?: string;
};

function starPath(fullName: string): string {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    throw Object.assign(new Error("validation"), { code: "validation" });
  }
  return `/api/github/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/star`;
}

function unstarPath(fullName: string): string {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    throw Object.assign(new Error("validation"), { code: "validation" });
  }
  return `/api/github/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/unstar`;
}

async function postRepoAction(path: string): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  const body = (await response.json()) as ActionResponse;
  if (response.status === 401) {
    const error = new Error("unauthorized") as Error & {
      code: UnfollowErrorCode;
    };
    error.code = "unauthorized";
    throw error;
  }

  if (!response.ok) {
    const code = (body.error ?? "failed") as UnfollowErrorCode;
    const error = new Error(code) as Error & { code: UnfollowErrorCode };
    error.code = code;
    throw error;
  }
}

export async function starOneRepo(fullName: string): Promise<void> {
  await postRepoAction(starPath(fullName));
}

export async function unstarOneRepo(fullName: string): Promise<void> {
  await postRepoAction(unstarPath(fullName));
}

export async function starManySequential(
  fullNames: string[],
  onProgress: (progress: BulkUnfollowProgress) => void,
  signal?: AbortSignal,
) {
  return runBulkUnfollow(
    fullNames,
    (fullName) => postRepoAction(starPath(fullName)),
    {
      concurrency: 1,
      delayMs: 350,
      onProgress,
      signal,
    },
  );
}
