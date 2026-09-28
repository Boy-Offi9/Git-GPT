import { githubRequest, GitHubApiError } from "@/lib/github/client";
import {
  isValidGitHubRepoName,
  isValidGitHubUsername,
  normalizeUsername,
  parseRepoFullName,
} from "@/lib/github/validate";

const COMMIT_MESSAGES = [
  "Update README.md",
  "docs: update README",
  "Update readme",
  "docs: touch README",
] as const;

export type OwnedRepo = {
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
};

export type DatedCommitAuthor = {
  name: string;
  email: string;
};

export type DatedCommitResult = {
  htmlUrl: string;
  sha: string;
  date: string;
  path: string;
  message: string;
};

export type DatedCommitBatchResult = {
  created: number;
  days: number;
  commitsPerDay: number;
  startDate: string;
  endDate: string;
  last: DatedCommitResult | null;
};

/** Safety caps for range runs. */
export const MAX_RANGE_DAYS = 31;
export const MAX_COMMITS_PER_DAY = 10;
export const MAX_TOTAL_COMMITS = 100;
const COMMIT_GAP_MS = 350;

type ContentFile = {
  type: string;
  path: string;
  sha: string;
  encoding?: string;
  content?: string;
};

function enc(owner: string, repo: string) {
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function postJson<T>(
  accessToken: string,
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const response = await githubRequest(path, accessToken, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

async function getDefaultBranch(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string> {
  const response = await githubRequest(
    `/repos/${enc(owner, repo)}`,
    accessToken,
  );
  const body = (await response.json()) as { default_branch?: string };
  return body.default_branch || "main";
}

async function getBranchHead(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ commitSha: string; treeSha: string }> {
  const refResponse = await githubRequest(
    `/repos/${enc(owner, repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
    accessToken,
  );
  const ref = (await refResponse.json()) as {
    object?: { sha?: string };
  };
  const commitSha = ref.object?.sha;
  if (!commitSha) {
    throw new GitHubApiError("not_found", 404);
  }

  const commitResponse = await githubRequest(
    `/repos/${enc(owner, repo)}/git/commits/${commitSha}`,
    accessToken,
  );
  const commit = (await commitResponse.json()) as {
    tree?: { sha?: string };
  };
  const treeSha = commit.tree?.sha;
  if (!treeSha) {
    throw new GitHubApiError("not_found", 404);
  }
  return { commitSha, treeSha };
}

/** Parse `owner/repo` or `https://github.com/owner/repo`. */
export function parseRepoSource(source: string): {
  owner: string;
  repo: string;
} | null {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.includes("://") || trimmed.startsWith("github.com/")) {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
      );
      if (!/^(www\.)?github\.com$/i.test(url.hostname)) {
        return null;
      }
      const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length < 2) {
        return null;
      }
      return parseRepoFullName(`${parts[0]}/${parts[1].replace(/\.git$/i, "")}`);
    }
  } catch {
    return null;
  }

  return parseRepoFullName(trimmed.replace(/\.git$/i, ""));
}

export function isValidCommitDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [y, m, d] = date.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const parsed = new Date(utc);
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return false;
  }
  const now = Date.now();
  const maxFuture = now + 7 * 24 * 60 * 60 * 1000;
  const minPast = Date.UTC(2008, 0, 1);
  if (utc > maxFuture || utc < minPast) {
    return false;
  }
  return true;
}

/**
 * ISO timestamp for author/committer.
 * `index` spreads commits across the day (minutes after 10:00 UTC).
 */
export function commitDateIso(date: string, index = 0): string {
  const safe = Math.max(0, Math.floor(index));
  const minutes = 10 * 60 + safe * 7;
  const hh = Math.min(23, Math.floor(minutes / 60));
  const mm = minutes % 60;
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`;
}

export function pickCommitMessage(date: string, index = 0): string {
  let n = 0;
  for (let i = 0; i < date.length; i++) {
    n = (n + date.charCodeAt(i) * (i + 1)) % COMMIT_MESSAGES.length;
  }
  n = (n + Math.max(0, Math.floor(index))) % COMMIT_MESSAGES.length;
  return COMMIT_MESSAGES[n] ?? COMMIT_MESSAGES[0];
}

/** Inclusive UTC calendar days from startDate to endDate. */
export function enumerateDates(startDate: string, endDate: string): string[] {
  if (!isValidCommitDate(startDate) || !isValidCommitDate(endDate)) {
    return [];
  }
  const [ys, ms, ds] = startDate.split("-").map(Number);
  const [ye, me, de] = endDate.split("-").map(Number);
  let t = Date.UTC(ys, ms - 1, ds);
  const end = Date.UTC(ye, me - 1, de);
  if (t > end) {
    return [];
  }
  const out: string[] = [];
  while (t <= end) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    t += 24 * 60 * 60 * 1000;
  }
  return out;
}

export function clampCommitsPerDay(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_COMMITS_PER_DAY, Math.max(1, Math.floor(n)));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tiny toggle so the file content always changes. */
export function touchReadmeContent(
  existing: string | null,
  repoName: string,
): string {
  if (!existing) {
    return `# ${repoName}\n`;
  }
  if (existing.endsWith(" \n")) {
    return `${existing.slice(0, -2)}\n`;
  }
  if (existing.endsWith(" ")) {
    return existing.slice(0, -1);
  }
  if (existing.endsWith("\n")) {
    return `${existing.slice(0, -1)} \n`;
  }
  return `${existing} `;
}

function decodeBase64Utf8(content: string): string {
  return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

export async function listOwnedRepos(
  accessToken: string,
  options: { perPage?: number; maxPages?: number } = {},
): Promise<OwnedRepo[]> {
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 100));
  const maxPages = Math.min(5, Math.max(1, options.maxPages ?? 2));
  const out: OwnedRepo[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const response = await githubRequest(
      `/user/repos?affiliation=owner&sort=updated&per_page=${perPage}&page=${page}`,
      accessToken,
    );
    const rows = (await response.json()) as Array<{
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
      owner?: { login?: string };
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const parsed = parseRepoFullName(row.full_name);
      if (!parsed) continue;
      out.push({
        fullName: `${parsed.owner}/${parsed.repo}`,
        name: row.name,
        private: Boolean(row.private),
        defaultBranch: row.default_branch || "main",
        htmlUrl: row.html_url,
      });
    }
    if (rows.length < perPage) {
      break;
    }
  }

  return out;
}

async function getReadmeFile(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<{ path: string; sha: string; text: string } | null> {
  const candidates = ["README.md", "readme.md", "Readme.md"];
  for (const path of candidates) {
    try {
      const response = await githubRequest(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
        accessToken,
      );
      const body = (await response.json()) as ContentFile;
      if (body.type !== "file" || !body.sha) {
        continue;
      }
      const text =
        body.encoding === "base64" && body.content
          ? decodeBase64Utf8(body.content)
          : "";
      return { path: body.path || path, sha: body.sha, text };
    } catch (error) {
      if (error instanceof GitHubApiError && error.code === "not_found") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

/**
 * Create a README commit with real git author/committer dates via Git Data API
 * (same effect as GIT_AUTHOR_DATE / GIT_COMMITTER_DATE + git push).
 */
export async function createDatedReadmeCommit(
  accessToken: string,
  input: {
    owner: string;
    repo: string;
    date: string;
    author: DatedCommitAuthor;
    branch?: string;
    /** Spreads time-of-day when multiple commits share a date. */
    index?: number;
  },
): Promise<DatedCommitResult> {
  const owner = normalizeUsername(input.owner);
  const repo = input.repo.trim();
  const index = input.index ?? 0;
  if (!isValidGitHubUsername(owner) || !isValidGitHubRepoName(repo)) {
    throw new Error("validation");
  }
  if (!isValidCommitDate(input.date)) {
    throw new Error("validation");
  }

  const branch =
    input.branch?.trim() ||
    (await getDefaultBranch(accessToken, owner, repo));
  const { commitSha: parentSha, treeSha: baseTreeSha } = await getBranchHead(
    accessToken,
    owner,
    repo,
    branch,
  );

  const existing = await getReadmeFile(accessToken, owner, repo);
  const path = existing?.path ?? "README.md";
  const nextText = touchReadmeContent(existing?.text ?? null, repo);
  const message = pickCommitMessage(input.date, index);
  const dateIso = commitDateIso(input.date, index);
  const person = {
    name: input.author.name,
    email: input.author.email,
    date: dateIso,
  };

  const blob = await postJson<{ sha: string }>(
    accessToken,
    `/repos/${enc(owner, repo)}/git/blobs`,
    { content: nextText, encoding: "utf-8" },
  );

  const tree = await postJson<{ sha: string }>(
    accessToken,
    `/repos/${enc(owner, repo)}/git/trees`,
    {
      base_tree: baseTreeSha,
      tree: [
        {
          path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        },
      ],
    },
  );

  const commit = await postJson<{ sha: string; html_url?: string }>(
    accessToken,
    `/repos/${enc(owner, repo)}/git/commits`,
    {
      message,
      tree: tree.sha,
      parents: [parentSha],
      author: person,
      committer: person,
    },
  );

  await postJson(
    accessToken,
    `/repos/${enc(owner, repo)}/git/refs/heads/${encodeURIComponent(branch)}`,
    { sha: commit.sha, force: false },
    "PATCH",
  );

  return {
    htmlUrl:
      commit.html_url ??
      `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
    sha: commit.sha,
    date: input.date,
    path,
    message,
  };
}

export async function createDatedReadmeCommitRange(
  accessToken: string,
  input: {
    owner: string;
    repo: string;
    startDate: string;
    endDate: string;
    commitsPerDay: number;
    author: DatedCommitAuthor;
    branch?: string;
  },
): Promise<DatedCommitBatchResult> {
  const days = enumerateDates(input.startDate, input.endDate);
  if (days.length === 0) {
    throw new Error("validation");
  }
  if (days.length > MAX_RANGE_DAYS) {
    throw new Error("range_too_long");
  }

  const commitsPerDay = clampCommitsPerDay(input.commitsPerDay);
  const total = days.length * commitsPerDay;
  if (total > MAX_TOTAL_COMMITS) {
    throw new Error("too_many_commits");
  }

  let created = 0;
  let last: DatedCommitResult | null = null;

  for (const day of days) {
    for (let i = 0; i < commitsPerDay; i++) {
      last = await createDatedReadmeCommit(accessToken, {
        owner: input.owner,
        repo: input.repo,
        date: day,
        author: input.author,
        branch: input.branch,
        index: i,
      });
      created += 1;
      if (created < total) {
        await sleep(COMMIT_GAP_MS);
      }
    }
  }

  return {
    created,
    days: days.length,
    commitsPerDay,
    startDate: days[0]!,
    endDate: days[days.length - 1]!,
    last,
  };
}

export function noreplyEmail(userId: number, login: string): string {
  return `${userId}+${login}@users.noreply.github.com`;
}
