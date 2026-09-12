import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { isSameOriginRequest } from "@/lib/auth/csrf";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import {
  clearCrawlerLogs,
  ensureCrawlerState,
  listRecentLogs,
} from "@/lib/crawler/state";
import { tryGetDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

const PREVIEW_MAX = 100;
/** Hard ceiling so a runaway table cannot dump unbounded rows into the browser. */
const ALL_MAX = 10_000;

function mapLogs(
  logs: Awaited<ReturnType<typeof listRecentLogs>>,
) {
  return logs.map((log) => ({
    id: log.id,
    type: log.type,
    githubUserId: log.githubUserId,
    username: log.username,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
  }));
}

export async function GET(request: Request) {
  if (!tryGetDatabaseUrl()) {
    return jsonError("database_unconfigured", 503);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = all
    ? ALL_MAX
    : Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), PREVIEW_MAX)
      : 40;

  try {
    await ensureCrawlerState(auth.session.githubUserId);
    const logs = await listRecentLogs(auth.session.githubUserId, limit);
    return NextResponse.json({
      logs: mapLogs(logs),
      truncated: all && logs.length >= ALL_MAX,
      limit,
    });
  } catch (error) {
    console.error(error);
    return jsonError("failed", 500);
  }
}

export async function DELETE(request: Request) {
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
    await ensureCrawlerState(auth.session.githubUserId);
    await clearCrawlerLogs(auth.session.githubUserId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError("failed", 500);
  }
}
