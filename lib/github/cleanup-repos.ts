import type { ForkRepo, StarredRepo } from "@/types/cleanup";
import { githubRequest, parseLinkHeader } from "@/lib/github/client";

/**
 * Simple Link-header pagination for endpoints that need their own query
 * string (githubPaginate's own `?per_page=` suffix would collide with one).
 */
async function paginateWithQuery<T>(
  pathWithQuery: string,
  accessToken: string,
  perPage = 100,
  headers?: HeadersInit,
): Promise<T[]> {
  const separator = pathWithQuery.includes("?") ? "&" : "?";
  let next: string | undefined = `${pathWithQuery}${separator}per_page=${perPage}&page=1`;
  const out: T[] = [];

  while (next) {
    const response = await githubRequest(next, accessToken, { headers });
    const page = (await response.json()) as T[];
    out.push(...page);
    next = parseLinkHeader(response.headers.get("link")).next;
  }

  return out;
}

type ApiRepo = {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  stargazers_count: number;
  open_issues_count: number;
  language: string | null;
  archived: boolean;
  fork: boolean;
  created_at: string;
  pushed_at: string | null;
  default_branch: string;
  parent?: { full_name: string; default_branch: string } | null;
};

type ApiStarred = { starred_at: string; repo: ApiRepo };

/** The signed-in user's starred repos, newest-starred last (matches GitHub's default). */
export async function listStarredRepos(
  accessToken: string,
): Promise<StarredRepo[]> {
  // The star+json media type wraps each repo with the time it was starred.
  const items = await paginateWithQuery<ApiStarred>(
    "/user/starred?sort=created&direction=asc",
    accessToken,
    100,
    { Accept: "application/vnd.github.star+json" },
  );

  return items.map(({ starred_at, repo }) => ({
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description,
    htmlUrl: repo.html_url,
    stars: repo.stargazers_count,
    language: repo.language,
    archived: repo.archived,
    pushedAt: repo.pushed_at,
    starredAt: starred_at,
  }));
}

/** Repos owned by the signed-in user that are forks of something else. */
export async function listOwnedForks(accessToken: string): Promise<ForkRepo[]> {
  const repos = await paginateWithQuery<ApiRepo>(
    "/user/repos?affiliation=owner&sort=pushed&direction=desc",
    accessToken,
  );

  return repos
    .filter((repo) => repo.fork)
    .map((repo) => ({
      fullName: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stars: repo.stargazers_count,
      openIssues: repo.open_issues_count,
      language: repo.language,
      archived: repo.archived,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      defaultBranch: repo.default_branch,
    }));
}

export async function getRepoDetails(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<ApiRepo> {
  const response = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    accessToken,
  );
  return (await response.json()) as ApiRepo;
}

export type { ApiRepo };
