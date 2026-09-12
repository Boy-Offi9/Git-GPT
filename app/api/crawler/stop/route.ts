import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { stopCrawler } from "@/lib/crawler/control";
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

  try {
    await stopCrawler(auth.session.githubUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("failed", 500);
  }
}
