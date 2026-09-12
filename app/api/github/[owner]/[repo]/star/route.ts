import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import { clearSession } from "@/lib/auth/session";
import { ReauthRequiredError } from "@/lib/auth/tokens";
import { starRepository } from "@/lib/github/star";
import {
  isValidGitHubRepoName,
  isValidGitHubUsername,
  normalizeUsername,
} from "@/lib/github/validate";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ owner: string; repo: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return jsonError("forbidden", 403);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  const { owner: rawOwner, repo: rawRepo } = await context.params;
  const owner = normalizeUsername(decodeURIComponent(rawOwner));
  const repo = decodeURIComponent(rawRepo).trim();
  if (!isValidGitHubUsername(owner) || !isValidGitHubRepoName(repo)) {
    return jsonError("validation", 422);
  }

  const fullName = `${owner}/${repo}`;

  try {
    const { value } = await withGitHubRetry(auth.session, auth.token, (token) =>
      starRepository(token, fullName),
    );
    return NextResponse.json({
      ok: true,
      fullName,
      upstream: value.upstream,
      via: value.via,
    });
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      await clearSession();
      return jsonError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "validation") {
      return jsonError("validation", 422);
    }
    return githubErrorResponse(error);
  }
}
