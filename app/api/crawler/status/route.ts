import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { getCrawlerStatusPayload } from "@/lib/crawler/control";
import { tryGetDatabaseUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!tryGetDatabaseUrl()) {
    return jsonError("database_unconfigured", 503);
  }

  const auth = await requireAuthenticatedSession();
  if (!auth) {
    return jsonError("unauthorized", 401);
  }

  try {
    const payload = await getCrawlerStatusPayload(auth.session.githubUserId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return jsonError("failed", 500);
  }
}
