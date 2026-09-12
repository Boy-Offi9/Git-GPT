import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { resetCrawler } from "@/lib/crawler/control";
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

  let hard = false;
  try {
    const body = (await request.json()) as { hard?: unknown };
    hard = body?.hard === true;
  } catch {
    // empty body = soft reset
  }

  try {
    await resetCrawler(auth.session.githubUserId, { hard });
    return NextResponse.json({ ok: true, hard });
  } catch (error) {
    console.error(error);
    return jsonError("failed", 500);
  }
}
