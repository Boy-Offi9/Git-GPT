import * as cheerio from "cheerio";
import type { HtmlFollower, HtmlFollowersPayload } from "@/types/github";
import { GitHubApiError } from "@/lib/github/client";
import { isValidGitHubUsername } from "@/lib/github/validate";
import { normalizeGithubFollowersUrl } from "@/lib/github/html-followers-url";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchGithubFollowersHtml(
  accessToken: string,
  fetchUrl: string,
): Promise<string> {
  let response: Response;
  try {
    // Prefer cookie-less HTML for the public list. OAuth Bearer is still sent
    // so authenticated personalization is used when GitHub honors it.
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

function usernameFromHref(href: string): string | null {
  const match = href.match(/^\/([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})\/?$/);
  if (!match) return null;
  const login = match[1];
  if (!isValidGitHubUsername(login)) return null;
  // Skip reserved path segments that might look like usernames
  const reserved = new Set([
    "settings",
    "notifications",
    "marketplace",
    "explore",
    "topics",
    "collections",
    "events",
    "sponsors",
    "orgs",
    "users",
    "login",
    "signup",
    "about",
    "pricing",
    "features",
    "enterprise",
    "customer-stories",
    "security",
    "team",
    "enterprise",
  ]);
  if (reserved.has(login.toLowerCase())) return null;
  return login;
}

function findRowRoot($: cheerio.CheerioAPI, el: unknown) {
  // cheerio accepts Element | Document | ...; keep typing loose across cheerio versions
  const $el = $(el as never);
  const table = $el.closest("div.d-table, .d-table-cell, li, .Box-row");
  if (table.length) {
    const root = table.closest("div.d-table");
    if (root.length) return root;
    return table.first();
  }
  return $el.parent();
}

/**
 * Parse github.com followers tab HTML.
 * isFollowing is derived from follow/unfollow form actions, not button text.
 */
export function parseGithubFollowersHtml(
  html: string,
  meta: { login: string; page: number; sourceUrl: string },
): HtmlFollowersPayload {
  const $ = cheerio.load(html);
  const byUsername = new Map<string, HtmlFollower>();

  let links = $("#user-profile-frame a[data-hovercard-type=\"user\"][href^=\"/\"]");
  if (links.length === 0) {
    // Fallback when GitHub omits the turbo-frame wrapper
    links = $("a[data-hovercard-type=\"user\"][href^=\"/\"]");
  }

  links.each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const username = usernameFromHref(href);
    if (!username) return;
    // Skip the profile owner themselves if linked in the frame chrome
    if (username.toLowerCase() === meta.login.toLowerCase()) return;

    const key = username.toLowerCase();
    const row = findRowRoot($, el);

    const unfollowForm = row.find(
      `form[action*="/users/unfollow?target=${username}"], form[action*="/users/unfollow?target=${encodeURIComponent(username)}"]`,
    );
    const followForm = row.find(
      `form[action*="/users/follow?target=${username}"], form[action*="/users/follow?target=${encodeURIComponent(username)}"]`,
    );

    // Broader match if exact username casing differs in action
    const unfollowAny = row.find('form[action*="/users/unfollow?target="]').filter(
      (_, form) => {
        const action = $(form).attr("action") ?? "";
        return action.toLowerCase().includes(`target=${username.toLowerCase()}`);
      },
    );
    const followAny = row.find('form[action*="/users/follow?target="]').filter(
      (_, form) => {
        const action = $(form).attr("action") ?? "";
        return action.toLowerCase().includes(`target=${username.toLowerCase()}`);
      },
    );

    const isFollowing =
      unfollowForm.length > 0 || unfollowAny.length > 0
        ? true
        : followForm.length > 0 || followAny.length > 0
          ? false
          : false;

    const spans = $(el).find("span");
    let name: string | null = null;
    if (spans.length >= 2) {
      const candidate = $(spans[0]).text().trim();
      const loginSpan = $(spans[1]).text().trim();
      if (candidate && loginSpan.toLowerCase() === username.toLowerCase()) {
        name = candidate;
      }
    } else if (spans.length === 1) {
      const text = $(spans[0]).text().trim();
      if (text && text.toLowerCase() !== username.toLowerCase()) {
        name = text;
      }
    }

    const img = row.find("img.avatar, img.avatar-user, a[data-hovercard-type=\"user\"] img").first();
    let avatar = img.attr("src") ?? null;
    if (avatar && avatar.startsWith("/")) {
      avatar = `https://github.com${avatar}`;
    }

    const existing = byUsername.get(key);
    if (existing) {
      byUsername.set(key, {
        ...existing,
        name: existing.name ?? name,
        avatar: existing.avatar ?? avatar,
        isFollowing: existing.isFollowing || isFollowing,
      });
      return;
    }

    byUsername.set(key, {
      username,
      name,
      avatar,
      profileUrl: `https://github.com/${username}`,
      isFollowing,
    });
  });

  // Pagination: Next link with tab=followers
  let hasNextPage = false;
  $("a").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const href = $(el).attr("href") ?? "";
    if (
      (text === "next" || rel.includes("next") || text.includes("next")) &&
      href.includes("tab=followers")
    ) {
      hasNextPage = true;
    }
  });

  const users = [...byUsername.values()];
  const followingCount = users.filter((u) => u.isFollowing).length;
  const notFollowingCount = users.length - followingCount;

  return {
    users,
    page: meta.page,
    hasNextPage,
    sourceUrl: meta.sourceUrl,
    login: meta.login,
    followingCount,
    notFollowingCount,
    maybeUnpersonalized: users.length > 0 && followingCount === 0,
  };
}

export async function extractHtmlFollowers(
  accessToken: string,
  urlOrUsername: string,
): Promise<HtmlFollowersPayload> {
  const normalized = normalizeGithubFollowersUrl(urlOrUsername);
  const html = await fetchGithubFollowersHtml(accessToken, normalized.fetchUrl);
  return parseGithubFollowersHtml(html, {
    login: normalized.login,
    page: normalized.page,
    sourceUrl: normalized.fetchUrl,
  });
}
