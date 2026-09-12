import { NextResponse } from "next/server";
import { githubErrorResponse, jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { seedCrawlerFromProfile } from "@/lib/crawler/control";
import { tryGetDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return jsonError("forbidden", 403);
  }
  if (!tryGetDatabaseUrl()) {
    return jsonError("database_unconfigured", 503);
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
  if (typeof source !== "string" || !source.trim()) {
    return jsonError("validation", 422);
  }

  try {
    const result = await seedCrawlerFromProfile(
      auth.session,
      source.trim(),
      auth.token,
    );
    if (!result.ok) {
      if (result.error === "validation") {
        return jsonError("validation", 422);
      }
      if (result.error === "not_found") {
        return jsonError("not_found", 404);
      }
      if (result.error === "rate_limited") {
        return jsonError("rate_limited", 429);
      }
      if (result.error === "unauthorized") {
        return jsonError("unauthorized", 401);
      }
      if (result.error === "seed_empty") {
        return jsonError("seed_empty", 409, {
          login: result.login ?? null,
        });
      }
      return jsonError(result.error, 502);
    }
    return NextResponse.json({
      ok: true,
      added: result.added,
      login: result.login,
      page: result.page,
      cleared: result.cleared,
    });
  } catch (error) {
    console.error(error);
    return githubErrorResponse(error);
  }
}
