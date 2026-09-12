import type { SessionPayload } from "@/types/auth";

export function isAccessTokenFresh(
  session: Pick<SessionPayload, "accessTokenExpiresAt">,
  skewMs = 60_000,
  now = Date.now(),
): boolean {
  if (!session.accessTokenExpiresAt) {
    return true;
  }
  return session.accessTokenExpiresAt - skewMs > now;
}
