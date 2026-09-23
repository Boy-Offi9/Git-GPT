import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import { checkFork } from "@/lib/github/fork-cleanup";
import { parseRepoFullName } from "@/lib/github/validate";
import { saveForkCheck } from "@/lib/db/fork-checks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("forbidden", 403);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  let fullName: string;
  try {
    const body = (await request.json()) as { fullName?: string };
    fullName = String(body.fullName ?? "");
  } catch {
    return jsonError("validation", 422);
  }

  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    return jsonError("validation", 422);
  }

  try {
    const { value } = await withGitHubRetry(auth.session, auth.token, (token) =>
      checkFork(token, parsed.owner, parsed.repo),
    );
    await saveForkCheck(auth.session.githubUserId, value);
    return NextResponse.json({ check: value });
  } catch (error) {
    return githubErrorResponse(error);
  }
}
