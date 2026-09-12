import { githubRequest } from "@/lib/github/client";
import type { GitHubApiSimpleUser } from "@/types/github";
import { isValidGitHubUsername, normalizeUsername } from "@/lib/github/validate";
import { extractHtmlFollowers } from "@/lib/github/html-followers";
import { buildFollowersPageUrl } from "@/lib/github/html-followers-url";

export type LatestFollower = {
  id: number;
  login: string;
  avatarUrl: string;
  htmlUrl: string;
};

function mapUsers(users: GitHubApiSimpleUser[]): LatestFollower[] {
  return users.map((user) => ({
    id: user.id,
    login: user.login,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
  }));
}

function githubIdFromAvatar(avatar: string | null | undefined): number | null {
  if (!avatar) {
    return null;
  }
  const match = avatar.match(/\/u\/(\d+)/);
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function resolveGithubUserId(
  accessToken: string,
  username: string,
  avatar?: string | null,
): Promise<number | null> {
  const fromAvatar = githubIdFromAvatar(avatar);
  if (fromAvatar != null) {
    return fromAvatar;
  }
  try {
    const response = await githubRequest(
      `/users/${encodeURIComponent(username)}`,
      accessToken,
    );
    const user = (await response.json()) as GitHubApiSimpleUser;
    return typeof user.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

/** Authenticated user's followers for a single page (REST). */
export async function listOwnLatestFollowers(
  accessToken: string,
  limit = 10,
  page = 1,
): Promise<LatestFollower[]> {
  const safePage = Math.max(1, Math.floor(page));
  const response = await githubRequest(
    `/user/followers?per_page=${limit}&page=${safePage}`,
    accessToken,
  );
  const users = (await response.json()) as GitHubApiSimpleUser[];
  return mapUsers(users).slice(0, limit);
}

/**
 * Another user's followers via github.com HTML tab — same order as the website
 * (newest first). Do not use REST `/users/{user}/followers` for “latest”.
 */
export async function listUserLatestFollowers(
  accessToken: string,
  username: string,
  limit = 10,
  page = 1,
): Promise<LatestFollower[]> {
  const login = normalizeUsername(username);
  if (!isValidGitHubUsername(login)) {
    throw new Error("validation");
  }

  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));
  const payload = await extractHtmlFollowers(
    accessToken,
    buildFollowersPageUrl(login, safePage),
  );

  const out: LatestFollower[] = [];
  for (const row of payload.users) {
    if (out.length >= safeLimit) {
      break;
    }
    if (row.username.toLowerCase() === login.toLowerCase()) {
      continue;
    }
    const id = await resolveGithubUserId(
      accessToken,
      row.username,
      row.avatar,
    );
    if (id == null) {
      continue;
    }
    out.push({
      id,
      login: row.username,
      avatarUrl: row.avatar ?? "",
      htmlUrl: row.profileUrl,
    });
  }
  return out;
}
