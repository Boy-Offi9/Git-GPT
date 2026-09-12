import * as cheerio from "cheerio";
import type { HtmlRepo, HtmlReposPayload } from "@/types/github";
import { GitHubApiError } from "@/lib/github/client";
import {
  isValidGitHubRepoName,
  isValidGitHubUsername,
} from "@/lib/github/validate";
import { normalizeGithubReposUrl } from "@/lib/github/html-repos-url";
import { enrichReposStarredState } from "@/lib/github/star";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchGithubReposHtml(
  accessToken: string,
  fetchUrl: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(fetchUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": BROWSER_UA,
      },
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    throw new GitHubApiError("network", 0);
  }

  if (response.status === 404) {
    throw new GitHubApiError("not_found", 404);
  }
  if (response.status === 401) {
    throw new GitHubApiError("unauthorized", 401);
  }
  if (response.status === 429) {
    throw new GitHubApiError("rate_limited", 429);
  }
  if (response.status === 403) {
    throw new GitHubApiError("forbidden", 403);
  }
  if (!response.ok) {
    throw new GitHubApiError("unknown", response.status);
  }

  return response.text();
}

function parseRepoHref(
  href: string,
): { owner: string; name: string } | null {
  const match = href.match(
    /^\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})\/([A-Za-z0-9._-]{1,100})\/?$/,
  );
  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  if (!isValidGitHubUsername(owner) || !isValidGitHubRepoName(name)) {
    return null;
  }
  return { owner, name };
}

function parseStarCount(text: string): number {
  const cleaned = text.replace(/,/g, "").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/([\d.]+)\s*([kKmMbB])?/);
  if (!match) {
    const digits = cleaned.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const suffix = (match[2] ?? "").toLowerCase();
  if (suffix === "k") return Math.round(value * 1_000);
  if (suffix === "m") return Math.round(value * 1_000_000);
  if (suffix === "b") return Math.round(value * 1_000_000_000);
  return Math.round(value);
}

function detectStarredFromRow(
  // cheerio element typing varies across versions
  root: cheerio.Cheerio<never>,
  $: cheerio.CheerioAPI,
  owner: string,
  name: string,
): boolean | null {
  const ownerLower = owner.toLowerCase();
  const nameLower = name.toLowerCase();

  const unstarForm = root.find("form[action*='/unstar']").filter((_, form) => {
    const action = ($(form).attr("action") ?? "").toLowerCase();
    return action.includes(`/${ownerLower}/${nameLower}/unstar`);
  });
  if (unstarForm.length > 0) return true;

  const starredButton = root.find("button[aria-label]").filter((_, btn) => {
    const label = (
      ($(btn).attr("aria-label") ?? "") + $(btn).text()
    ).toLowerCase();
    return (
      label.includes("unstar") ||
      label.includes("starred") ||
      label.includes("click to unstar")
    );
  });
  if (starredButton.length > 0) return true;

  if (root.find("form.starred, form.js-social-form.starred").length > 0) {
    return true;
  }

  const starForm = root.find("form[action*='/star']").filter((_, form) => {
    const action = ($(form).attr("action") ?? "").toLowerCase();
    return (
      action.includes(`/${ownerLower}/${nameLower}/star`) &&
      !action.includes("/unstar")
    );
  });
  if (starForm.length > 0) return false;

  const starButton = root.find("button[aria-label]").filter((_, btn) => {
    const label = (
      ($(btn).attr("aria-label") ?? "") + $(btn).text()
    ).toLowerCase();
    return label.includes("star this repository") || label.trim() === "star";
  });
  if (starButton.length > 0) return false;

  return null;
}

/**
 * Parse github.com repositories tab HTML.
 * isStarred prefers unstar/star form actions and button aria-labels.
 */
export function parseGithubReposHtml(
  html: string,
  meta: { login: string; page: number; sourceUrl: string },
): HtmlReposPayload {
  const $ = cheerio.load(html);
  const byFullName = new Map<string, HtmlRepo>();

  const links = $('a[itemprop="name codeRepository"]');

  links.each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const parsed = parseRepoHref(href);
    if (!parsed) return;

    const { owner, name } = parsed;
    const fullName = `${owner}/${name}`;
    const key = fullName.toLowerCase();
    const container = $(el).closest('li[itemprop="owns"]');
    const root = container.length ? container : $(el).parent();

    const detected = detectStarredFromRow(root as never, $, owner, name);
    const isStarred = detected === true;

    const description =
      root.find('[itemprop="description"]').first().text().trim() || null;

    const starLink = root
      .find(`a[href$="/${owner}/${name}/stargazers"], a[href*="/stargazers"]`)
      .filter((_, a) => {
        const h = ($(a).attr("href") ?? "").toLowerCase();
        return h.includes(
          `/${owner.toLowerCase()}/${name.toLowerCase()}/stargazers`,
        );
      })
      .first();
    const stars = parseStarCount(starLink.text() || "0");

    const existing = byFullName.get(key);
    if (existing) {
      byFullName.set(key, {
        ...existing,
        description: existing.description ?? description,
        stars: Math.max(existing.stars, stars),
        isStarred: existing.isStarred || isStarred,
      });
      return;
    }

    byFullName.set(key, {
      name,
      fullName,
      owner,
      url: `https://github.com/${fullName}`,
      stars,
      description,
      isStarred,
    });
  });

  let hasNextPage = false;
  $("a").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const href = $(el).attr("href") ?? "";
    if (
      (text === "next" || rel.includes("next") || text.includes("next")) &&
      href.includes("tab=repositories")
    ) {
      hasNextPage = true;
    }
  });

  const repositories = [...byFullName.values()];
  const starredCount = repositories.filter((r) => r.isStarred).length;
  const notStarredCount = repositories.length - starredCount;

  return {
    repositories,
    page: meta.page,
    hasNextPage,
    sourceUrl: meta.sourceUrl,
    login: meta.login,
    starredCount,
    notStarredCount,
    maybeUnpersonalized: repositories.length > 0 && starredCount === 0,
  };
}

export async function extractHtmlRepos(
  accessToken: string,
  urlOrUsername: string,
): Promise<HtmlReposPayload> {
  const normalized = normalizeGithubReposUrl(urlOrUsername);
  const html = await fetchGithubReposHtml(accessToken, normalized.fetchUrl);
  const parsed = parseGithubReposHtml(html, {
    login: normalized.login,
    page: normalized.page,
    sourceUrl: normalized.fetchUrl,
  });

  // HTML often lacks personalized star forms for OAuth fetches — confirm via REST.
  const starredMap = await enrichReposStarredState(
    accessToken,
    parsed.repositories,
  );
  const repositories = parsed.repositories.map((repo) => ({
    ...repo,
    isStarred: starredMap.get(repo.fullName.toLowerCase()) ?? repo.isStarred,
  }));
  const starredCount = repositories.filter((r) => r.isStarred).length;

  return {
    ...parsed,
    repositories,
    starredCount,
    notStarredCount: repositories.length - starredCount,
    maybeUnpersonalized: false,
  };
}
