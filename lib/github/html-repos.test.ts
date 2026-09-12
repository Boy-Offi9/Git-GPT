import { describe, expect, it } from "vitest";
import { parseGithubReposHtml } from "@/lib/github/html-repos";

const FIXTURE = `
<html><body>
<ul>
  <li class="col-12" itemprop="owns" itemscope itemtype="http://schema.org/Code">
    <h3>
      <a href="/owner/alpha" itemprop="name codeRepository">alpha</a>
    </h3>
    <p itemprop="description">Alpha description</p>
    <a href="/owner/alpha/stargazers">
      <svg aria-label="star"></svg>
      4
    </a>
    <form action="/owner/alpha/star" method="post"></form>
  </li>
  <li class="col-12" itemprop="owns" itemscope itemtype="http://schema.org/Code">
    <h3>
      <a href="/owner/beta" itemprop="name codeRepository">beta</a>
    </h3>
    <a href="/owner/beta/stargazers">12</a>
    <form action="/owner/beta/unstar" method="post"></form>
  </li>
</ul>
<a href="https://github.com/owner?page=2&tab=repositories">Next</a>
</body></html>
`;

describe("parseGithubReposHtml", () => {
  it("parses repos, star counts, and star state from forms", () => {
    const result = parseGithubReposHtml(FIXTURE, {
      login: "owner",
      page: 1,
      sourceUrl: "https://github.com/owner?page=1&tab=repositories",
    });

    expect(result.repositories).toHaveLength(2);
    const alpha = result.repositories.find((r) => r.name === "alpha");
    const beta = result.repositories.find((r) => r.name === "beta");
    expect(alpha?.isStarred).toBe(false);
    expect(alpha?.stars).toBe(4);
    expect(alpha?.description).toBe("Alpha description");
    expect(alpha?.fullName).toBe("owner/alpha");
    expect(beta?.isStarred).toBe(true);
    expect(beta?.stars).toBe(12);
    expect(result.starredCount).toBe(1);
    expect(result.notStarredCount).toBe(1);
    expect(result.hasNextPage).toBe(true);
    expect(result.maybeUnpersonalized).toBe(false);
  });
});
