import { isValidGitHubUsername, normalizeUsername } from "@/lib/github/validate";

export type NormalizedReposUrl = {
  login: string;
  page: number;
  fetchUrl: string;
};

/**
 * Accept a github.com profile URL or bare username and force tab=repositories.
 * Preserves page from the input (default 1).
 */
export function normalizeGithubReposUrl(input: string): NormalizedReposUrl {
  const raw = input.trim();
  if (!raw) {
    throw new Error("validation");
  }

  let login: string;
  let page = 1;

  if (/^https?:\/\//i.test(raw) || raw.includes("github.com/")) {
    let url: URL;
    try {
      url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    } catch {
      throw new Error("validation");
    }

    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") {
      throw new Error("validation");
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 1) {
      throw new Error("validation");
    }

    login = normalizeUsername(segments[0]);
    const pageParam = url.searchParams.get("page");
    if (pageParam) {
      const parsed = Number(pageParam);
      if (Number.isFinite(parsed) && parsed >= 1) {
        page = Math.floor(parsed);
      }
    }
  } else {
    login = normalizeUsername(raw.replace(/^@/, ""));
  }

  if (!isValidGitHubUsername(login)) {
    throw new Error("validation");
  }

  const fetchUrl = `https://github.com/${encodeURIComponent(login)}?page=${page}&tab=repositories`;
  return { login, page, fetchUrl };
}

export function buildReposPageUrl(login: string, page: number): string {
  const safePage = Math.max(1, Math.floor(page));
  return `https://github.com/${encodeURIComponent(login)}?page=${safePage}&tab=repositories`;
}
