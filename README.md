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

## How It Works

1. Sign in with your GitHub account.
2. Git-GPT fetches your Followers and Following lists.
3. The app compares both lists.
4. Users who don't follow you back are displayed.
5. Select the users you want to remove.
6. Unfollow them directly through GitHub.

The app uses GitHub's official REST API for follower/following data and follow/star management. Explore and Stars features also read public GitHub HTML for list extraction.

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

## Open Source

Git-GPT is open source. Contributions, feedback, and improvements are welcome.

If you find it useful, consider giving the repository a ⭐.
