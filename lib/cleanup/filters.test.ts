import { describe, expect, it } from "vitest";
import type { ForkCheck, ForkRepo, StarredRepo } from "@/types/cleanup";
import {
  filterForks,
  filterStars,
  forkStatus,
  forkViewCounts,
  isUntouchedFork,
  matchesQuery,
  sortStars,
  stalenessLevel,
  starViewCounts,
} from "@/lib/cleanup/filters";

const NOW = Date.parse("2026-09-20T00:00:00Z");
const monthsAgo = (months: number) =>
  new Date(NOW - months * 30.44 * 86_400_000).toISOString();

function star(overrides: Partial<StarredRepo> = {}): StarredRepo {
  return {
    fullName: "octo/thing",
    owner: "octo",
    name: "thing",
    description: null,
    htmlUrl: "https://github.com/octo/thing",
    stars: 10,
    language: null,
    archived: false,
    pushedAt: monthsAgo(1),
    starredAt: monthsAgo(5),
    ...overrides,
  };
}

function fork(overrides: Partial<ForkRepo> = {}): ForkRepo {
  return {
    fullName: "me/thing",
    owner: "me",
    name: "thing",
    description: null,
    htmlUrl: "https://github.com/me/thing",
    stars: 0,
    openIssues: 0,
    language: null,
    archived: false,
    createdAt: "2024-01-10T00:00:00Z",
    pushedAt: "2023-12-01T00:00:00Z",
    defaultBranch: "main",
    ...overrides,
  };
}

function check(overrides: Partial<ForkCheck> = {}): ForkCheck {
  return {
    fullName: "me/thing",
    parent: "up/thing",
    aheadBy: null,
    checkedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("stalenessLevel", () => {
  it("maps age to 0-4 and treats never-pushed as dormant", () => {
    expect(stalenessLevel(monthsAgo(2), NOW)).toBe(0);
    expect(stalenessLevel(monthsAgo(8), NOW)).toBe(1);
    expect(stalenessLevel(monthsAgo(18), NOW)).toBe(2);
    expect(stalenessLevel(monthsAgo(30), NOW)).toBe(3);
    expect(stalenessLevel(monthsAgo(60), NOW)).toBe(4);
    expect(stalenessLevel(null, NOW)).toBe(4);
  });
});

describe("matchesQuery", () => {
  it("requires every term, case-insensitively, across fields", () => {
    expect(matchesQuery("", "anything")).toBe(true);
    expect(matchesQuery("REACT ui", "octo/react-kit", "A UI toolkit")).toBe(
      true,
    );
    expect(matchesQuery("react vue", "octo/react-kit", "A UI toolkit")).toBe(
      false,
    );
    expect(matchesQuery("kit", null, undefined, "octo/kit")).toBe(true);
  });
});

describe("filterStars", () => {
  const repos = [
    star({ fullName: "a/fresh", pushedAt: monthsAgo(2) }),
    star({ fullName: "a/old", pushedAt: monthsAgo(30) }),
    star({ fullName: "a/ancient", pushedAt: monthsAgo(50) }),
    star({ fullName: "a/never", pushedAt: null }),
    star({ fullName: "a/frozen", pushedAt: monthsAgo(3), archived: true }),
  ];
  const names = (list: StarredRepo[]) => list.map((r) => r.fullName);

  it("filters by archived", () => {
    expect(names(filterStars(repos, "archived", "", NOW))).toEqual([
      "a/frozen",
    ]);
  });

  it("filters by inactivity, counting never-pushed repos", () => {
    expect(names(filterStars(repos, "stale2", "", NOW))).toEqual([
      "a/old",
      "a/ancient",
      "a/never",
    ]);
    expect(names(filterStars(repos, "stale3", "", NOW))).toEqual([
      "a/ancient",
      "a/never",
    ]);
  });

  it("combines a view with a search query", () => {
    expect(names(filterStars(repos, "stale1", "anc", NOW))).toEqual([
      "a/ancient",
    ]);
  });

  it("counts every view", () => {
    expect(starViewCounts(repos, NOW)).toEqual({
      all: 5,
      archived: 1,
      stale1: 3,
      stale2: 3,
      stale3: 2,
    });
  });
});

describe("sortStars", () => {
  const repos = [
    star({
      fullName: "a/x",
      starredAt: monthsAgo(10),
      pushedAt: monthsAgo(1),
      stars: 5,
    }),
    star({ fullName: "a/y", starredAt: monthsAgo(40), pushedAt: null, stars: 900 }),
    star({
      fullName: "a/z",
      starredAt: monthsAgo(2),
      pushedAt: monthsAgo(20),
      stars: 50,
    }),
  ];
  const names = (list: StarredRepo[]) => list.map((r) => r.fullName);

  it("sorts without mutating the input", () => {
    const before = names(repos);
    sortStars(repos, "stars_desc");
    expect(names(repos)).toEqual(before);
  });

  it("supports every sort key", () => {
    expect(names(sortStars(repos, "starred_asc"))).toEqual(["a/y", "a/x", "a/z"]);
    expect(names(sortStars(repos, "starred_desc"))).toEqual(["a/z", "a/x", "a/y"]);
    expect(names(sortStars(repos, "push_asc"))).toEqual(["a/y", "a/z", "a/x"]);
    expect(names(sortStars(repos, "stars_desc"))).toEqual(["a/y", "a/z", "a/x"]);
  });
});

describe("forks", () => {
  it("detects untouched forks from push vs create time", () => {
    expect(isUntouchedFork(fork())).toBe(true);
    expect(isUntouchedFork(fork({ pushedAt: "2024-05-01T00:00:00Z" }))).toBe(
      false,
    );
    expect(isUntouchedFork(fork({ pushedAt: null }))).toBe(true);
    expect(
      isUntouchedFork(fork({ pushedAt: "2024-01-10T00:00:00Z" })),
    ).toBe(true);
  });

  it("derives a status from a check", () => {
    expect(forkStatus(undefined)).toBe("unchecked");
    expect(forkStatus(check({ aheadBy: null }))).toBe("unknown");
    expect(forkStatus(check({ aheadBy: 0 }))).toBe("clean");
    expect(forkStatus(check({ aheadBy: 3 }))).toBe("unique");
  });

  it("filters views using check results", () => {
    const forks = [
      fork({ fullName: "me/a", pushedAt: "2023-01-01T00:00:00Z" }),
      fork({ fullName: "me/b", pushedAt: "2025-01-01T00:00:00Z" }),
      fork({ fullName: "me/c", archived: true }),
    ];
    const checks: Record<string, ForkCheck> = {
      "me/a": check({ fullName: "me/a", parent: "up/a", aheadBy: 0 }),
      "me/b": check({ fullName: "me/b", parent: "up/b", aheadBy: 4 }),
    };
    const names = (list: ForkRepo[]) => list.map((f) => f.fullName);

    expect(names(filterForks(forks, "untouched", "", checks))).toEqual([
      "me/a",
      "me/c",
    ]);
    expect(names(filterForks(forks, "safe", "", checks))).toEqual(["me/a"]);
    expect(names(filterForks(forks, "archived", "", checks))).toEqual([
      "me/c",
    ]);
    expect(names(filterForks(forks, "all", "up/b", checks))).toEqual([
      "me/b",
    ]);
    expect(forkViewCounts(forks, checks)).toEqual({
      all: 3,
      untouched: 2,
      safe: 1,
      archived: 1,
    });
  });
});
