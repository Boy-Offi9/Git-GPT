import { describe, expect, it } from "vitest";
import {
  commitDateIso,
  enumerateDates,
  isValidCommitDate,
  parseRepoSource,
  pickCommitMessage,
  touchReadmeContent,
} from "@/lib/github/dated-commit";

describe("parseRepoSource", () => {
  it("parses owner/repo", () => {
    expect(parseRepoSource("MiladJoodi/Git-GPT")).toEqual({
      owner: "MiladJoodi",
      repo: "Git-GPT",
    });
  });

  it("parses github URLs", () => {
    expect(parseRepoSource("https://github.com/MiladJoodi/Git-GPT")).toEqual({
      owner: "MiladJoodi",
      repo: "Git-GPT",
    });
    expect(
      parseRepoSource("https://github.com/MiladJoodi/Git-GPT.git"),
    ).toEqual({
      owner: "MiladJoodi",
      repo: "Git-GPT",
    });
  });

  it("rejects junk", () => {
    expect(parseRepoSource("not a repo")).toBeNull();
    expect(parseRepoSource("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("isValidCommitDate", () => {
  it("accepts real calendar days", () => {
    expect(isValidCommitDate("2023-01-13")).toBe(true);
  });

  it("rejects invalid days", () => {
    expect(isValidCommitDate("2023-02-30")).toBe(false);
    expect(isValidCommitDate("13-01-2023")).toBe(false);
  });
});

describe("touchReadmeContent", () => {
  it("creates a default README when missing", () => {
    expect(touchReadmeContent(null, "demo")).toBe("# demo\n");
  });

  it("toggles trailing space so content always changes", () => {
    const a = touchReadmeContent("# hi\n", "demo");
    expect(a).toBe("# hi \n");
    const b = touchReadmeContent(a, "demo");
    expect(b).toBe("# hi\n");
  });
});

describe("commit helpers", () => {
  it("builds staggered UTC iso times", () => {
    expect(commitDateIso("2023-01-13", 0)).toBe("2023-01-13T10:00:00Z");
    expect(commitDateIso("2023-01-13", 1)).toBe("2023-01-13T10:07:00Z");
  });

  it("picks a natural message", () => {
    const msg = pickCommitMessage("2023-01-13");
    expect(msg.length).toBeGreaterThan(3);
    expect(msg.toLowerCase()).not.toContain("backdated");
  });

  it("enumerates inclusive date ranges", () => {
    expect(enumerateDates("2023-01-13", "2023-01-15")).toEqual([
      "2023-01-13",
      "2023-01-14",
      "2023-01-15",
    ]);
    expect(enumerateDates("2023-01-15", "2023-01-13")).toEqual([]);
  });
});

