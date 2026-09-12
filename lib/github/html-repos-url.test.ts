import { describe, expect, it } from "vitest";
import {
  buildReposPageUrl,
  normalizeGithubReposUrl,
} from "@/lib/github/html-repos-url";

describe("normalizeGithubReposUrl", () => {
  it("forces tab=repositories and keeps page", () => {
    expect(
      normalizeGithubReposUrl("https://github.com/MiladJoodi?page=2"),
    ).toEqual({
      login: "MiladJoodi",
      page: 2,
      fetchUrl: "https://github.com/MiladJoodi?page=2&tab=repositories",
    });
  });

  it("accepts bare username", () => {
    expect(normalizeGithubReposUrl("MiladJoodi")).toEqual({
      login: "MiladJoodi",
      page: 1,
      fetchUrl: "https://github.com/MiladJoodi?page=1&tab=repositories",
    });
  });
});

describe("buildReposPageUrl", () => {
  it("builds page urls", () => {
    expect(buildReposPageUrl("abc", 2)).toBe(
      "https://github.com/abc?page=2&tab=repositories",
    );
  });
});
