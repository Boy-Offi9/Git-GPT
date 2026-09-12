import { githubRequest, GitHubApiError } from "@/lib/github/client";
import { isValidGitHubUsername, normalizeUsername } from "@/lib/github/validate";

/** Returns true if the authenticated user follows `username`. */
export async function isFollowingUser(
  accessToken: string,
  username: string,
): Promise<boolean> {
  const login = normalizeUsername(username);
  if (!isValidGitHubUsername(login)) {
    throw new Error("validation");
  }

  try {
    await githubRequest(
      `/user/following/${encodeURIComponent(login)}`,
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
