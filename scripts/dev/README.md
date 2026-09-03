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
