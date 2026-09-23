import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import {
  archiveRepo,
  assertOwnedFork,
  deleteRepo,
  ForkActionError,
} from "@/lib/github/fork-cleanup";
import { parseRepoFullName } from "@/lib/github/validate";
import { deleteCachedForkCheck, logForkAction } from "@/lib/db/fork-checks";

export const dynamic = "force-dynamic";

type ForkAction = "archive" | "delete";

function isForkAction(value: unknown): value is ForkAction {
  return value === "archive" || value === "delete";
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("forbidden", 403);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  let fullName: string;
  let action: unknown;
  try {
    const body = (await request.json()) as {
      fullName?: string;
      action?: unknown;
    };
    fullName = String(body.fullName ?? "");
    action = body.action;
  } catch {
    return jsonError("validation", 422);
  }

  const parsed = parseRepoFullName(fullName);
  if (!parsed || !isForkAction(action)) {
    return jsonError("validation", 422);
  }

  try {
    await withGitHubRetry(auth.session, auth.token, async (token) => {
      // Re-verified on every call: it must be a fork, and it must be owned
      // by the signed-in user. The client can't point this at anything else.
      await assertOwnedFork(token, auth.session.login, parsed.owner, parsed.repo);
      if (action === "archive") {
        await archiveRepo(token, parsed.owner, parsed.repo);
      } else {
        await deleteRepo(token, parsed.owner, parsed.repo);
      }
    });

    if (action === "delete") {
      await deleteCachedForkCheck(auth.session.githubUserId, fullName);
    }
    await logForkAction(auth.session.githubUserId, fullName, action);

    return NextResponse.json({ ok: true, fullName, action });
  } catch (error) {
    if (error instanceof ForkActionError) {
      return jsonError("forbidden", 403);
    }
    return githubErrorResponse(error);
  }
}
