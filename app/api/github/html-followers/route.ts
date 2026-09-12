import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import {
  requireAuthenticatedSession,
  withGitHubRetry,
} from "@/lib/auth/require-session";
import { clearSession } from "@/lib/auth/session";
import { ReauthRequiredError } from "@/lib/auth/tokens";
import { extractHtmlFollowers } from "@/lib/github/html-followers";

export const dynamic = "force-dynamic";

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

  const url =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { url?: unknown }).url === "string"
      ? (body as { url: string }).url
      : null;

  if (!url?.trim()) {
    return jsonError("validation", 422);
  }

  try {
    const { value } = await withGitHubRetry(auth.session, auth.token, (token) =>
      extractHtmlFollowers(token, url),
    );
    return NextResponse.json(value);
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
