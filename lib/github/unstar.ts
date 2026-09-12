import { githubRequest } from "@/lib/github/client";
import { parseRepoFullName } from "@/lib/github/validate";
import { postGithubWebStarAction } from "@/lib/github/web-star";

export async function unstarRepository(
  accessToken: string,
  fullName: string,
): Promise<{ upstream: string; via: "web" | "rest" }> {
  const parsed = parseRepoFullName(fullName);
  if (!parsed) {
    throw new Error("validation");
  }

  const upstream = `https://github.com/${parsed.owner}/${parsed.repo}/unstar`;

  try {
    await postGithubWebStarAction(
      accessToken,
      parsed.owner,
      parsed.repo,
      "unstar",
    );
    return { upstream, via: "web" };
  } catch {
    // Fall through to REST.
  }

  await githubRequest(
    `/user/starred/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,
    accessToken,
    {
      method: "DELETE",
    },
  );
  return {
    upstream: `https://api.github.com/user/starred/${parsed.owner}/${parsed.repo}`,
    via: "rest",
  };
}
