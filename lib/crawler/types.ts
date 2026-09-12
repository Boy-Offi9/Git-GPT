import type { SessionPayload } from "@/types/auth";

export type CrawlerTokenPayload = {
  githubUserId: number;
  login: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
};

export function sessionToTokenPayload(
  session: SessionPayload,
): CrawlerTokenPayload {
  return {
    githubUserId: session.githubUserId,
    login: session.login,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

export const DEFAULT_DELAY_SECONDS = 30;
export const DEFAULT_QUEUE_LIMIT = 50;
/** `0` means no queue size cap. */
export const UNLIMITED_QUEUE_LIMIT = 0;
/** `0` means no run time limit. */
export const UNLIMITED_RUN_DURATION = 0;
export const LEASE_MS = 60_000;
export const POLL_IDLE_MS = 2_000;
/** Wait between reseed attempts when the queue stays empty. */
export const EMPTY_QUEUE_RESEED_MS = 15_000;
export const LATEST_FOLLOWERS_LIMIT = 10;
/** How many own-follower pages to scan when seeding. */
export const OWN_FOLLOWERS_SEED_PAGES = 3;
/** How many recent processed users to try when own followers yield nobody new. */
export const PROCESSED_NETWORK_SEED_LIMIT = 15;

export const DELAY_PRESETS = [
  { labelKey: "crawlerDelay30s" as const, seconds: 30 },
  { labelKey: "crawlerDelay1m" as const, seconds: 60 },
  { labelKey: "crawlerDelay2m" as const, seconds: 120 },
  { labelKey: "crawlerDelay5m" as const, seconds: 300 },
];

/** Rendered after timed presets, before Custom (like Unlimited). */
export const DELAY_NONE_PRESET = {
  labelKey: "crawlerDelayNone" as const,
  seconds: 0,
};

export const QUEUE_LIMIT_PRESETS = [50, 100, 250, 500] as const;

export const RUN_DURATION_PRESETS = [
  { labelKey: "crawlerRun10m" as const, minutes: 10 },
  { labelKey: "crawlerRun30m" as const, minutes: 30 },
  { labelKey: "crawlerRun1h" as const, minutes: 60 },
  { labelKey: "crawlerRun2h" as const, minutes: 120 },
  { labelKey: "crawlerRun5h" as const, minutes: 300 },
  { labelKey: "crawlerRunUnlimited" as const, minutes: 0 },
];
export function isUnlimitedQueue(queueLimit: number): boolean {
  return queueLimit <= 0;
}

export function isUnlimitedRunDuration(minutes: number): boolean {
  return minutes <= 0;
}

export function computeRunEndsAt(
  durationMinutes: number,
  from = new Date(),
): Date | null {
  if (isUnlimitedRunDuration(durationMinutes)) {
    return null;
  }
  return new Date(from.getTime() + durationMinutes * 60_000);
}