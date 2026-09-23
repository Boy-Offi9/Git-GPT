import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import { listOwnedForks } from "@/lib/github/cleanup-repos";
import { getCachedForkChecks } from "@/lib/db/fork-checks";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  try {
    const { value } = await withGitHubRetry(auth.session, auth.token, (token) =>
      listOwnedForks(token),
    );
    const checks = await getCachedForkChecks(auth.session.githubUserId);
    return NextResponse.json({ forks: value, checks });
  } catch (error) {
    return githubErrorResponse(error);
  }
}
