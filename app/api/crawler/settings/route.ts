import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { patchCrawlerSettings } from "@/lib/crawler/control";
import { tryGetDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
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

  const delaySeconds = (body as { delaySeconds?: unknown }).delaySeconds;
  const queueLimit = (body as { queueLimit?: unknown }).queueLimit;
  const runDurationMinutes = (body as { runDurationMinutes?: unknown })
    .runDurationMinutes;

  const patch: {
    delaySeconds?: number;
    queueLimit?: number;
    runDurationMinutes?: number;
  } = {};
  if (delaySeconds !== undefined) {
    if (typeof delaySeconds !== "number") {
      return jsonError("validation", 422);
    }
    patch.delaySeconds = delaySeconds;
  }
  if (queueLimit !== undefined) {
    if (typeof queueLimit !== "number") {
      return jsonError("validation", 422);
    }
    patch.queueLimit = queueLimit;
  }
  if (runDurationMinutes !== undefined) {
    if (typeof runDurationMinutes !== "number") {
      return jsonError("validation", 422);
    }
    patch.runDurationMinutes = runDurationMinutes;
  }

  try {
    await patchCrawlerSettings(auth.session.githubUserId, patch);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "validation") {
      return jsonError("validation", 422);
    }
    console.error(error);
    return jsonError("failed", 500);
  }
}
