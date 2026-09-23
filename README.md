# Git-GPT

Git-GPT is a simple tool for managing your GitHub following list.

It compares your **Followers** and **Following** lists to find people you follow who don't follow you back. You can review the results, select multiple users, and unfollow them directly from the app.

## Features

* 🔍 Compare Followers and Following
* 👤 Find users who don't follow you back
* ☑️ Select multiple users
* 🚀 Unfollow multiple users at once
* 🔐 GitHub OAuth authentication
* 🛡️ No GitHub password required
* 📦 Public repository starring via `public_repo` (no private repo contents)
* 🤖 Server-side follower crawler (Neon PostgreSQL + separate worker)
* 🧹 Clean up stars and forks — spot repos that have gone stale, check a fork against its upstream, and unstar/archive/delete in bulk

## How It Works

1. Sign in with your GitHub account.
2. Git-GPT fetches your Followers and Following lists.
3. The app compares both lists.
4. Users who don't follow you back are displayed.
5. Select the users you want to remove.
6. Unfollow them directly through GitHub.

The app uses GitHub's official REST API for follower/following data and follow/star management. Explore and Stars features also read public GitHub HTML for list extraction.

### Crawler (optional)

The crawler runs as a **separate Node process** and stores queue/state in Neon PostgreSQL (`DATABASE_URL`). Closing the browser does not stop it.

1. Add `DATABASE_URL` to `.env.local` (never commit it).
2. Apply schema: `npm run db:push` (or run `drizzle/0000_crawler.sql`).
3. Start the app: `npm run dev` (or `npm run start`).
4. In another terminal: `npm run crawler:worker`.
5. Open `/crawler` → Start.

On Vercel (or other serverless hosts), deploy the **web app** there and run `npm run crawler:worker` on a long-running host (Railway, Fly, VPS) with the same `DATABASE_URL`, `SESSION_SECRET`, and GitHub OAuth env vars.

## Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* GitHub REST API
* GitHub OAuth

## Security

Git-GPT uses GitHub OAuth instead of asking for your GitHub password.

The application requests `read:user`, `user:follow`, and `public_repo` so it can manage follows and star public repositories. It does not need access to private repository contents.

> **Note:** deleting a fork from the cleanup view calls GitHub's repo-delete endpoint, which requires the `delete_repo` OAuth scope. That scope is not currently requested by the sign-in flow, so delete will return a permission error until `delete_repo` is added to the GitHub OAuth `scope` parameter (and existing users re-authorize). Archiving does not need it.

## Open Source

Git-GPT is open source. Contributions, feedback, and improvements are welcome.

If you find it useful, consider giving the repository a ⭐.
