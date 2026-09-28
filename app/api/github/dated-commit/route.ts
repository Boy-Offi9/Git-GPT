import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import { clearSession } from "@/lib/auth/session";
import { ReauthRequiredError } from "@/lib/auth/tokens";
import {
  clampCommitsPerDay,
  createDatedReadmeCommitRange,
  isValidCommitDate,
  noreplyEmail,
  parseRepoSource,
} from "@/lib/github/dated-commit";
import { getAuthenticatedUser } from "@/lib/github/user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("forbidden", 403);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("validation", 422);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("validation", 422);
  }

  const source = (body as { source?: unknown }).source;
  const startRaw =
    (body as { startDate?: unknown }).startDate ??
    (body as { date?: unknown }).date;
  const endRaw =
    (body as { endDate?: unknown }).endDate ?? startRaw;
  const commitsRaw = (body as { commitsPerDay?: unknown }).commitsPerDay;

  if (typeof source !== "string" || typeof startRaw !== "string") {
    return jsonError("validation", 422);
  }
  if (typeof endRaw !== "string") {
    return jsonError("validation", 422);
  }

  const startDate = startRaw.trim();
  const endDate = endRaw.trim();
  const commitsPerDay = clampCommitsPerDay(
    typeof commitsRaw === "number"
      ? commitsRaw
      : typeof commitsRaw === "string"
        ? Number(commitsRaw)
        : 1,
  );

  const parsed = parseRepoSource(source);
  if (
    !parsed ||
    !isValidCommitDate(startDate) ||
    !isValidCommitDate(endDate)
  ) {
    return jsonError("validation", 422);
  }

  const ownerLogin = auth.session.login;
  if (parsed.owner.toLowerCase() !== ownerLogin.toLowerCase()) {
    return jsonError("forbidden", 403);
  }

  try {
    const { value } = await withGitHubRetry(
      auth.session,
      auth.token,
      async (token) => {
        const user = await getAuthenticatedUser(token);
        return createDatedReadmeCommitRange(token, {
          owner: parsed.owner,
          repo: parsed.repo,
          startDate,
          endDate,
          commitsPerDay,
          author: {
            name: user.name?.trim() || user.login,
            email: noreplyEmail(user.id, user.login),
          },
        });
      },
    );
    return NextResponse.json({ ok: true, ...value });
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      await clearSession();
      return jsonError("unauthorized", 401);
    }
    if (error instanceof Error && error.message === "validation") {
      return jsonError("validation", 422);
    }
    if (error instanceof Error && error.message === "range_too_long") {
      return jsonError("range_too_long", 422);
    }
    if (error instanceof Error && error.message === "too_many_commits") {
      return jsonError("too_many_commits", 422);
    }
    return githubErrorResponse(error);
  }
}
