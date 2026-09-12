import { describe, expect, it } from "vitest";
import { parseGithubFollowersHtml } from "@/lib/github/html-followers";

const FIXTURE = `
<html><body>
<turbo-frame id="user-profile-frame">
  <div data-hpc>
    <div class="d-table table-fixed col-12 width-full py-4 border-bottom color-border-muted">
      <a data-hovercard-type="user" data-hovercard-url="/users/alice/hovercard" href="/alice">
        <img class="avatar avatar-user" src="https://avatars.githubusercontent.com/u/1?v=4" />
      </a>
      <a data-hovercard-type="user" href="/alice">
        <span class="f4 Link--primary">Alice Name</span>
        <span class="Link--secondary">alice</span>
      </a>
      <form class="js-form-toggle-target" action="/users/follow?target=alice" method="post">
        <input type="submit" value="Follow" title="Follow alice" />
      </form>
    </div>
    <div class="d-table table-fixed col-12 width-full py-4 border-bottom color-border-muted">
      <a data-hovercard-type="user" href="/bob">
        <img class="avatar" src="https://avatars.githubusercontent.com/u/2?v=4" />
      </a>
      <a data-hovercard-type="user" href="/bob">
        <span>Bob</span>
        <span>bob</span>
      </a>
      <form class="js-form-toggle-target" action="/users/unfollow?target=bob" method="post">
        <input type="submit" value="Unfollow" title="Unfollow bob" />
      </form>
    </div>
  </div>
  <a href="https://github.com/owner?page=2&tab=followers">Next</a>
</turbo-frame>
</body></html>
`;

describe("parseGithubFollowersHtml", () => {
  it("dedupes links and detects follow state from form actions", () => {
    const result = parseGithubFollowersHtml(FIXTURE, {
      login: "owner",
      page: 1,
      sourceUrl: "https://github.com/owner?page=1&tab=followers",
    });

    expect(result.users).toHaveLength(2);
    const alice = result.users.find((u) => u.username === "alice");
    const bob = result.users.find((u) => u.username === "bob");
    expect(alice?.isFollowing).toBe(false);
    expect(alice?.name).toBe("Alice Name");
    expect(bob?.isFollowing).toBe(true);
    expect(result.followingCount).toBe(1);
    expect(result.notFollowingCount).toBe(1);
    expect(result.hasNextPage).toBe(true);
    expect(result.maybeUnpersonalized).toBe(false);
  });
});
