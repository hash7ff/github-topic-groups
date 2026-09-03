# GitHub Topic Folders

A Chrome extension that shows your GitHub repositories grouped into folders, GitLab-group style,
using **GitHub Topics** as the only source of truth.

Tag a repository with a topic like `topic-folders-client-a` and the Repositories tab on your profile
(`github.com/<you>?tab=repositories`) shows it under a collapsible **Client A** folder.
Repositories without a `topic-folders-*` topic appear under **Ungrouped**. The prefix is configurable in the
extension settings; the default was chosen because generic prefixes such as `project-` already appear on thousands of
repositories (`project-management`, `project-euler`, …) and would be misread as folders. Nothing is stored anywhere but GitHub:
uninstall the extension and your classification is still there, as plain topics.

> **Status: early development.** v0.1 (read-only grouped view) works; moving repositories between
> projects, renaming and deleting projects, and "Sign in with GitHub" are in progress.
> Not yet on the Chrome Web Store. Website: https://hash7ff.github.io/github-topic-folders/

## Principles

- **Topics are the source of truth.** No hidden database. Works from any machine with the same GitHub account.
- **Never rename repositories.** `api` stays `api`; the project lives in the topic.
- **Never destroy topics.** Every non-`topic-folders-*` topic is preserved when a repository is moved.
- **Always escapable.** A `Grouped | Original` switch restores GitHub's own list at any time, and the
  original list is never hidden while the extension has an error.
- **Minimal DOM dependency.** Only the owner (from the URL) and one anchor element are read from GitHub's page;
  repository data comes from the REST API and is rendered as the extension's own DOM.

## Install (development build)

```
npm install
npm run check      # typecheck + unit tests + build + token-isolation check
```

Then open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked* and select the `dist/` folder.
Open the extension's settings to connect your GitHub account (a fine-grained personal access token for now;
Sign in with GitHub is coming).

Required token permissions: **Metadata: Read-only** and **Administration: Read and write**
(GitHub requires Administration write to replace repository topics; the extension uses it for nothing else).

## Privacy and security

- Your token is stored in the browser profile (`chrome.storage.local`) and is sent only to `api.github.com`.
  It is never given to the GitHub web page, never logged, and the content script that runs on github.com
  cannot access it (verified at build time).
- The extension calls exactly four GitHub endpoints: `GET /user`, `GET /user/repos`,
  `GET /repos/{owner}/{repo}/topics` and `PUT /repos/{owner}/{repo}/topics`. It cannot delete repositories.
- **Topic names are public, even on private repositories.** Do not use confidential client or project names
  as project topics.
- Full policy: https://hash7ff.github.io/github-topic-folders/privacy.html

## Documentation

- `docs/Plan.md` — specification (Japanese)
- `docs/ImplementationPlan.md` — implementation plan, verified facts and decision log (Japanese)

## License

MIT © 2026 HASH7FF LLC
