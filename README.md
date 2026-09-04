# Topic Groups for GitHub

A Chrome extension that shows your GitHub repositories grouped into groups, GitLab-group style,
using **GitHub Topics** as the only source of truth.

Tag a repository with a topic like `topic-groups-client-a` and the Repositories tab on your profile
(`github.com/<you>?tab=repositories`) shows it under a collapsible **Client A** group.
Repositories without a `topic-groups-*` topic appear under **Ungrouped**. The prefix is configurable in the
extension settings; the default was chosen because generic prefixes such as `group-` already appear on thousands of
repositories (`group-management`, `group-euler`, …) and would be misread as groups. Nothing is stored anywhere but GitHub:
uninstall the extension and your classification is still there, as plain topics.

> **Status: v0.3.0 — feature complete for the MVP, not yet on the Chrome Web Store.**
> Grouped view, Move to…, New group, Rename, Delete, conflict fix and "Sign in with GitHub" all work and were
> verified against real repositories. Website: https://hash7ff.github.io/github-topic-groups/

## Principles

- **Topics are the source of truth.** No hidden database. Works from any machine with the same GitHub account.
- **Never rename repositories.** `api` stays `api`; the group lives in the topic.
- **Never destroy topics.** Every non-`topic-groups-*` topic is preserved when a repository is moved.
- **Always escapable.** A `Grouped | Original` switch restores GitHub's own list at any time, and the
  original list is never hidden while the extension has an error.
- **Minimal DOM dependency.** Only the owner (from the URL) and one anchor element are read from GitHub's page;
  repository data comes from the REST API and is rendered as the extension's own DOM.

## Features

- **Grouped view** on your Repositories tab, with a `Grouped | Original` switch, search, collapsible groups and
  an **Ungrouped** group for everything else.
- **Move to…** any repository to another group, to Ungrouped, or into a new group.
- **New group** from one or many repositories; **Rename** and **Delete** a group (repositories are never deleted).
- **Conflicts**: a repository carrying several group topics is shown separately with a **Fix** action.
- **GitHub's own controls keep working**: the Find / Type / Language / Sort controls above the list drive the
  grouped view too, because their state is read from the URL rather than from GitHub's DOM.
- **Add repositories to a group in bulk** from the group's menu, with a filter and select-all.
- **Organizations too**: the same view works on `github.com/orgs/<org>/repositories` for organizations where the
  app is installed; elsewhere it says so and links to the installation page.
- **Sign in with GitHub** through the *Topic Groups* GitHub App (device flow: enter a short code on GitHub).
  A personal access token still works as an advanced fallback.

## Install (development build)

```
npm install
npm run check      # typecheck + unit tests + build + token-isolation check
```

Then open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked* and select the `dist/` group.
Open the extension's settings and click **Sign in with GitHub**: you get a short code, enter it on
github.com/login/device and approve the *Topic Groups* app. Then install the app on your repositories when the
extension asks (choose *All repositories* unless you want to limit it). GitHub requires the app's
**Administration: Read and write** permission to replace repository topics; the extension uses it for nothing else.

Advanced: a fine-grained personal access token (Metadata: Read-only, Administration: Read and write) can be
pasted instead of signing in.

## Privacy and security

- Your credential is stored in the browser profile (`chrome.storage.local`) and is sent only to GitHub.
  It is never given to the GitHub web page, never logged, and the content script that runs on github.com
  cannot access it (verified at build time). There is no client secret anywhere: device-flow tokens are refreshed
  with the public client ID alone.
- The extension calls exactly six GitHub REST endpoints: `GET /user`, `GET /user/repos`, `GET /orgs/{org}/repos`,
  `GET /user/installations`, `GET /repos/{owner}/{repo}/topics` and `PUT /repos/{owner}/{repo}/topics`.
  It cannot delete repositories.
- Every write is journaled locally (last 200, including dry runs) so a mistake can be traced and undone by hand.
- **Topic names are public, even on private repositories.** Do not use confidential client or group names
  as group topics.
- Full policy: https://hash7ff.github.io/github-topic-groups/privacy.html

## Known limitations

- GitHub's topics API replaces the whole topic list and offers no conditional write. The extension re-reads the
  topics immediately before each write and refuses to write when the group topic differs from what you saw, but a
  topic added by another client in the fraction of a second between that read and the write could still be lost.
- With a GitHub App installation limited to selected repositories, GitHub still lists all your public repositories
  (read-only); moving one of them fails until the app is installed on it. Installing on *All repositories* avoids this.
- Group names are derived from the topic (`topic-groups-my-oss` → "My Oss"); casing is not preserved.
- For an organization, the app must be installed on that organization. If you are not an owner, GitHub turns the
  install button into a request that an owner has to approve. Changing topics additionally requires admin
  permission on the repository, because a user access token grants only what both the app and you may do.

## Documentation

- `docs/Plan.md` — specification (Japanese)
- `docs/ImplementationPlan.md` — implementation plan, verified facts and decision log (Japanese)

## License

MIT © 2026 HASH7FF LLC
