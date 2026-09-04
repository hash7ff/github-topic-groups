# Dev-loop scripts (host Chrome via CDP)

Prerequisite: a dedicated Chrome profile launched on the host with `--remote-debugging-port=9224`, the unpacked
extension loaded from `dist/`, and a GitHub login in that profile. Run from this directory with
`NODE_PATH=/usr/lib/node_modules node <script>` (playwright-core is installed globally in the dev container).

- `ext-reload.cjs` — reloads OUR unpacked extension (resolved by name + UNPACKED, prints its ID). Run after `npm run build`.
- `verify-m1-mount.cjs` — mount idempotency across Turbo tab switches / history / pagination.
- `verify-m2-options.cjs <extId>` — no-token hint, "Open settings", bad-token 401 path, clear token.

Never reload or touch extensions other than ours; never use CDP ports other than 9224 (other projects own them).
- `verify-m3-status.cjs <extId>` — pastes `$GTF_TEST_TOKEN` (read-only token from env) into the options page and reads the repo/project counts.
- `verify-m4-grouped-view.cjs <extId>` — Plan.md §33 Case 1 + Case 6, collapse/search/toggle persistence. Needs `$GTF_TEST_TOKEN` to restore the token after the forced-error step.
- `set-prefix.cjs <extId> <prefix>` — saves a folder-topic prefix through the options page and prints the groups rendered afterwards.
- `signin-start.cjs <extId>` / `signin-restart.cjs <extId>` — start (or restart) "Sign in with GitHub" from the options page, print the user code, open GitHub's device page. Approving is a human step.
- `verify-m45-signin.cjs <extId>` — signed-in state, stored auth shape (kind/expiry only), grouped view under the GitHub App token.
- `verify-m45-refresh.cjs <extId>` — forces the access token to look expired and checks that it is refreshed transparently.
- `verify-m5-writes.cjs <extId>` — write layer against the three gtf-test-* repos only (dry run, Case 2, Case 3, unchanged, wrong prefix, bulk port, journal); restores the Case 1 state. Needs `$GTF_READ_TOKEN` to read topics back.
- `verify-m6-move-new.cjs` — drives the real UI: Move to… dialog, New project (privacy notice, preselect), bulk create, restore Case 1. Needs `$GTF_READ_TOKEN`.
- `verify-m7-rename-delete.cjs` — Plan §33 Case 4 (rename) and Case 5 (delete) through the project menu; restores Case 1. Needs `$GTF_READ_TOKEN`.
- `verify-m8-conflict.cjs <extId>` — seeds two folder topics on gtf-test-firmware, checks the Conflicts section and Fix, restores. Needs `$GTF_READ_TOKEN`.
- `verify-hardening.cjs <extId>` — evaluates inside the content-script world (via CDP): storage.local must be denied, options-only messages refused, prefix/dry-run changes refused, writes for other owners refused, stale expectations abort without writing, malformed messages rejected.
- `verify-filters-and-bulk.cjs` — GitHub's own Find/Type/Language/Sort controls driving the grouped view, language colour dots, and the "Add repositories…" bulk move. Needs `$GTF_READ_TOKEN`.

Note: run these one at a time. GitHub's repository *list* endpoint lags behind topic writes by a few seconds, so a script that starts right after another one wrote topics can load a stale list; the scripts wait for the list and topics endpoints to agree and clear the extension cache before starting.
- `verify-org-page.cjs <extId>` — the grouped view on github.com/orgs/hash7ff/repositories: mount, create/move/delete against the gtf-org-test-* repos, survival across React re-render and soft navigation, and that the personal page still works.
- `verify-org-not-installed.cjs` — an organization without the app installed must show the install link and leave GitHub's list visible.
