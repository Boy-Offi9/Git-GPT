/** A repo the signed-in user has starred, enough to judge whether it's gone stale. */
export type StarredRepo = {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  stars: number;
  language: string | null;
  archived: boolean;
  pushedAt: string | null;
  starredAt: string | null;
};

/** A repo the signed-in user owns that is a fork of something else. */
export type ForkRepo = {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  htmlUrl: string;
  stars: number;
  openIssues: number;
  language: string | null;
  archived: boolean;
  createdAt: string;
  pushedAt: string | null;
  defaultBranch: string;
};

/** Result of comparing a fork's default branch against its parent's. */
export type ForkCheck = {
  fullName: string;
  /** Upstream repo, or null when GitHub no longer reports one. */
  parent: string | null;
  /** Commits on the fork that upstream doesn't have. Null when it couldn't be determined. */
  aheadBy: number | null;
  checkedAt: string;
};
