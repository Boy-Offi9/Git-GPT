import { describe, expect, it } from "vitest";
import {
  buildFollowersPageUrl,
  normalizeGithubFollowersUrl,
} from "@/lib/github/html-followers-url";

describe("normalizeGithubFollowersUrl", () => {
  it("adds tab=followers to a bare profile URL", () => {
    const result = normalizeGithubFollowersUrl("https://github.com/MiladJoodi");
    expect(result).toEqual({
      login: "MiladJoodi",
      page: 1,
      fetchUrl: "https://github.com/MiladJoodi?page=1&tab=followers",
    });
  });

  it("preserves page and forces tab=followers", () => {
    const result = normalizeGithubFollowersUrl(
      "https://github.com/MiladJoodi?page=2",
    );
    expect(result.page).toBe(2);
    expect(result.fetchUrl).toBe(
      "https://github.com/MiladJoodi?page=2&tab=followers",
    );
  });

  it("keeps page when tab is already present", () => {
    const result = normalizeGithubFollowersUrl(
      "https://github.com/MiladJoodi?page=3&tab=followers",
    );
    expect(result.page).toBe(3);
    expect(result.fetchUrl).toContain("tab=followers");
  });

  it("accepts a bare username", () => {
    expect(normalizeGithubFollowersUrl("MiladJoodi").login).toBe("MiladJoodi");
  });

  it("rejects non-github hosts", () => {
    expect(() =>
      normalizeGithubFollowersUrl("https://gitlab.com/foo"),
    ).toThrow("validation");
  });
});

describe("buildFollowersPageUrl", () => {
  it("builds page URLs", () => {
    expect(buildFollowersPageUrl("abc", 2)).toBe(
      "https://github.com/abc?page=2&tab=followers",
    );
  });
});
