const GITHUB_USERNAME =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const GITHUB_REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidGitHubUsername(username: string): boolean {
  if (!username || username.length > 39) {
    return false;
  }
  return GITHUB_USERNAME.test(username);
}

export function normalizeUsername(username: string): string {
  return username.trim();
}

export function isValidGitHubRepoName(name: string): boolean {
  if (!name || name.length > 100) {
    return false;
  }
  return GITHUB_REPO_NAME.test(name);
}

export function parseRepoFullName(fullName: string): {
  owner: string;
  repo: string;
} | null {
  const parts = fullName.trim().replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) {
    return null;
  }
  const owner = normalizeUsername(parts[0]);
  const repo = parts[1].trim();
  if (!isValidGitHubUsername(owner) || !isValidGitHubRepoName(repo)) {
    return null;
  }
  return { owner, repo };
}
