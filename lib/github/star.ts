import { githubRequest, GitHubApiError } from "@/lib/github/client";
import { parseRepoFullName } from "@/lib/github/validate";
import { postGithubWebStarAction } from "@/lib/github/web-star";

export async function starRepository(
  accessToken: string,
  fullName: string,
): Promise<{ upstream: string; via: "web" | "rest" }> {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    throw new Error("validation");
  }

  const upstream = `https://github.com/${parsed.owner}/${parsed.repo}/star`;

  // Always attempt the same web endpoint GitHub's UI uses first.
  try {
    await postGithubWebStarAction(
      accessToken,
      parsed.owner,
      parsed.repo,
      "star",
    );
    return { upstream, via: "web" };
  } catch {
    // Fall through to REST — still stars the repo when HTML forms are unavailable.
  }

  await githubRequest(
    `/user/starred/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
    accessToken,
    {
      method: "PUT",
      headers: { "Content-Length": "0" },
    },
  );
  return {
    upstream: `https://api.github.com/user/starred/${parsed.owner}/${parsed.repo}`,
    via: "rest",
  };
}

/** Returns true when the authenticated user has starred the repo (204). */
export async function isRepositoryStarred(
  accessToken: string,
  fullName: string,
): Promise<boolean> {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    throw new Error("validation");
  }

  try {
    await githubRequest(
      `/user/starred/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
      accessToken,
      { method: "GET" },
    );
    return true;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return false;
    }
    throw error;
  }
}

export async function enrichReposStarredState(
  accessToken: string,
  repositories: Array<{ fullName: string; isStarred: boolean }>,
  concurrency = 5,
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  let index = 0;

  async function worker() {
    while (index < repositories.length) {
      const current = index;
      index += 1;
      const repo = repositories[current];
      if (repo.isStarred) {
        result.set(repo.fullName.toLowerCase(), true);
        continue;
      }
      const starred = await isRepositoryStarred(accessToken, repo.fullName);
      result.set(repo.fullName.toLowerCase(), starred);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, repositories.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return result;
}
