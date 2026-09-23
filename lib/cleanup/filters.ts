import type { ForkCheck, ForkRepo, StarredRepo } from "@/types/cleanup";
import type { MessageKey } from "@/lib/i18n/core";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTH_MS = 30.44 * DAY_MS;

export type StarView = "all" | "archived" | "stale1" | "stale2" | "stale3";
export type StarSort = "starred_asc" | "starred_desc" | "push_asc" | "stars_desc";
export type ForkView = "all" | "untouched" | "safe" | "archived";
export type ForkStatus = "unchecked" | "unknown" | "unique" | "clean";

export const STAR_VIEWS: { id: StarView; labelKey: MessageKey }[] = [
  { id: "all", labelKey: "cleanupFilterAll" },
  { id: "archived", labelKey: "cleanupFilterArchived" },
  { id: "stale1", labelKey: "cleanupFilterStale1" },
  { id: "stale2", labelKey: "cleanupFilterStale2" },
  { id: "stale3", labelKey: "cleanupFilterStale3" },
];

export const STAR_SORTS: { id: StarSort; labelKey: MessageKey }[] = [
  { id: "starred_asc", labelKey: "cleanupSortStarredAsc" },
  { id: "starred_desc", labelKey: "cleanupSortStarredDesc" },
  { id: "push_asc", labelKey: "cleanupSortPushAsc" },
  { id: "stars_desc", labelKey: "cleanupSortStarsDesc" },
];

export const FORK_VIEWS: { id: ForkView; labelKey: MessageKey }[] = [
  { id: "all", labelKey: "cleanupFilterAll" },
  { id: "untouched", labelKey: "cleanupForkUntouched" },
  { id: "safe", labelKey: "cleanupForkSafe" },
  { id: "archived", labelKey: "cleanupFilterArchived" },
];

const STALE_MONTHS = { stale1: 12, stale2: 24, stale3: 36 } as const;

export function timestamp(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

export function monthsSince(iso: string | null, now: number): number | null {
  const value = timestamp(iso);
  if (value === null) return null;
  return Math.max(0, (now - value) / MONTH_MS);
}

/** A repo that has never been pushed to counts as inactive. */
export function isInactive(
  pushedAt: string | null,
  months: number,
  now: number,
): boolean {
  const since = monthsSince(pushedAt, now);
  return since === null || since >= months;
}

/** 0 = fresh … 4 = dormant. Drives the staleness gauge. */
export function stalenessLevel(
  pushedAt: string | null,
  now: number,
): 0 | 1 | 2 | 3 | 4 {
  const since = monthsSince(pushedAt, now);
  if (since === null) return 4;
  if (since < 6) return 0;
  if (since < 12) return 1;
  if (since < 24) return 2;
  if (since < 48) return 3;
  return 4;
}

export function matchesQuery(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/* ---------- stars ---------- */

export function matchesStarView(
  repo: StarredRepo,
  view: StarView,
  now: number,
): boolean {
  if (view === "all") return true;
  if (view === "archived") return repo.archived;
  return isInactive(repo.pushedAt, STALE_MONTHS[view], now);
}

export function filterStars(
  repos: StarredRepo[],
  view: StarView,
  query: string,
  now: number,
): StarredRepo[] {
  return repos.filter(
    (repo) =>
      matchesStarView(repo, view, now) &&
      matchesQuery(query, repo.fullName, repo.description, repo.language),
  );
}

export function starViewCounts(
  repos: StarredRepo[],
  now: number,
): Record<StarView, number> {
  const counts: Record<StarView, number> = {
    all: 0,
    archived: 0,
    stale1: 0,
    stale2: 0,
    stale3: 0,
  };
  for (const repo of repos) {
    for (const view of Object.keys(counts) as StarView[]) {
      if (matchesStarView(repo, view, now)) counts[view] += 1;
    }
  }
  return counts;
}

function compareNullable(
  a: number | null,
  b: number | null,
  nulls: "first" | "last",
): number {
  if (a === b) return 0;
  if (a === null) return nulls === "first" ? -1 : 1;
  if (b === null) return nulls === "first" ? 1 : -1;
  return a - b;
}

export function sortStars(repos: StarredRepo[], sort: StarSort): StarredRepo[] {
  const copy = [...repos];
  switch (sort) {
    case "starred_asc":
      return copy.sort((a, b) =>
        compareNullable(timestamp(a.starredAt), timestamp(b.starredAt), "last"),
      );
    case "starred_desc":
      return copy.sort((a, b) =>
        compareNullable(timestamp(b.starredAt), timestamp(a.starredAt), "last"),
      );
    case "push_asc":
      return copy.sort((a, b) =>
        compareNullable(timestamp(a.pushedAt), timestamp(b.pushedAt), "first"),
      );
    case "stars_desc":
      return copy.sort((a, b) => b.stars - a.stars);
  }
}

/* ---------- forks ---------- */

/**
 * A fresh fork's pushed_at is the upstream's last push, which is earlier than
 * the fork's own created_at. Any later push (including "Sync fork") flips this.
 * It is a hint only: a comparison against upstream is the source of truth.
 */
export function isUntouchedFork(
  fork: Pick<ForkRepo, "createdAt" | "pushedAt">,
): boolean {
  if (!fork.pushedAt) return true;
  const pushed = timestamp(fork.pushedAt);
  const created = timestamp(fork.createdAt);
  if (pushed === null || created === null) return false;
  return pushed <= created;
}

export function forkStatus(check: ForkCheck | undefined): ForkStatus {
  if (!check) return "unchecked";
  if (check.aheadBy === null) return "unknown";
  return check.aheadBy > 0 ? "unique" : "clean";
}

export function matchesForkView(
  fork: ForkRepo,
  view: ForkView,
  check: ForkCheck | undefined,
): boolean {
  switch (view) {
    case "all":
      return true;
    case "untouched":
      return isUntouchedFork(fork);
    case "safe":
      return forkStatus(check) === "clean";
    case "archived":
      return fork.archived;
  }
}

export function filterForks(
  forks: ForkRepo[],
  view: ForkView,
  query: string,
  checks: Record<string, ForkCheck>,
): ForkRepo[] {
  return forks.filter(
    (fork) =>
      matchesForkView(fork, view, checks[fork.fullName]) &&
      matchesQuery(
        query,
        fork.fullName,
        fork.description,
        checks[fork.fullName]?.parent,
      ),
  );
}

export function forkViewCounts(
  forks: ForkRepo[],
  checks: Record<string, ForkCheck>,
): Record<ForkView, number> {
  const counts: Record<ForkView, number> = {
    all: 0,
    untouched: 0,
    safe: 0,
    archived: 0,
  };
  for (const fork of forks) {
    for (const view of Object.keys(counts) as ForkView[]) {
      if (matchesForkView(fork, view, checks[fork.fullName])) counts[view] += 1;
    }
  }
  return counts;
}
