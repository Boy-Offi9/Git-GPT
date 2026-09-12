import * as cheerio from "cheerio";
import { GitHubApiError } from "@/lib/github/client";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type GithubWebStarAction = "star" | "unstar";

async function readAuthenticityToken(
  accessToken: string,
  owner: string,
  repo: string,
  action: GithubWebStarAction,
): Promise<string | null> {
  const pageUrl = `https://github.com/${owner}/${repo}`;
  let response: Response;
  try {
    response = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": BROWSER_UA,
      },
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const needle = `/${owner.toLowerCase()}/${repo.toLowerCase()}/${action}`;

  const form = $("form[action]").filter((_, el) => {
    const actionAttr = ($(el).attr("action") ?? "").toLowerCase();
    return actionAttr.includes(needle);
  }).first();

  const fromForm = form.find('input[name="authenticity_token"]').attr("value");
  if (fromForm) {
    return fromForm;
  }

  return $('input[name="authenticity_token"]').first().attr("value") ?? null;
}

/**
 * POST the same web endpoint GitHub's UI uses:
 * https://github.com/{owner}/{repo}/star|unstar
 */
export async function postGithubWebStarAction(
  accessToken: string,
  owner: string,
  repo: string,
  action: GithubWebStarAction,
): Promise<void> {
  const authenticityToken = await readAuthenticityToken(
    accessToken,
    owner,
    repo,
    action,
  );

  const body = new URLSearchParams();
  if (authenticityToken) {
    body.set("authenticity_token", authenticityToken);
  }

  const target = `https://github.com/${owner}/${repo}/${action}`;
  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://github.com",
        Referer: `https://github.com/${owner}/${repo}`,
        "User-Agent": BROWSER_UA,
      },
      body: body.toString(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw new GitHubApiError("network", 0);
  }

  // GitHub usually responds with 302 back to the repo on success.
  if (
    response.status === 200 ||
    response.status === 204 ||
    response.status === 302 ||
    response.status === 303 ||
    response.status === 307
  ) {
    return;
  }

  if (response.status === 401) {
    throw new GitHubApiError("unauthorized", 401);
  }
  if (response.status === 404) {
    throw new GitHubApiError("not_found", 404);
  }
  if (response.status === 429) {
    throw new GitHubApiError("rate_limited", 429);
  }
  if (response.status === 403) {
    throw new GitHubApiError("forbidden", 403);
  }
  if (response.status === 422) {
    throw new GitHubApiError("validation", 422);
  }

  throw new GitHubApiError("unknown", response.status);
}
