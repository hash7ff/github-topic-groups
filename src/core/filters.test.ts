import test from "node:test";
import assert from "node:assert/strict";
import { applyFilter, EMPTY_FILTER, isFiltering, matchesFilter, matchesQuery, parseFilterFromUrl, sortRepos, urlWithout } from "./filters.ts";
import { groupRepos } from "./grouping.ts";
import { repo } from "./fixtures.ts";

const base = "https://github.com/mutsuyuki?tab=repositories";

test("parseFilterFromUrl reads GitHub's own parameters and ignores unknown values", () => {
  assert.deepEqual(parseFilterFromUrl(base), EMPTY_FILTER);
  assert.deepEqual(parseFilterFromUrl(`${base}&q=gtf&type=private&language=TypeScript&sort=updated`), { q: "gtf", type: "private", language: "TypeScript", sort: "updated" });
  assert.deepEqual(parseFilterFromUrl(`${base}&q=&type=&language=&sort=`), EMPTY_FILTER, "GitHub sends empty values for 'All'");
  assert.deepEqual(parseFilterFromUrl(`${base}&type=nonsense&sort=nonsense`), EMPTY_FILTER, "unknown values are ignored, not applied");
});

test("urlWithout removes a single parameter", () => {
  assert.equal(urlWithout(`${base}&q=x&language=dart`, "language"), `${base}&q=x`);
});

test("matchesQuery searches name and description, case-insensitively", () => {
  const r = repo("api", [], { description: "Backend for Client A" });
  assert.equal(matchesQuery(r, "API"), true);
  assert.equal(matchesQuery(r, "client a"), true);
  assert.equal(matchesQuery(r, "firmware"), false);
  assert.equal(matchesQuery(r, "   "), true);
});

test("type and language filters follow GitHub's semantics", () => {
  const pub = repo("pub", [], { private: false, language: "Dart" });
  const forked = repo("forked", [], { fork: true });
  const arch = repo("arch", [], { archived: true });
  const f = (patch: Partial<typeof EMPTY_FILTER>) => ({ ...EMPTY_FILTER, ...patch });
  assert.equal(matchesFilter(pub, f({ type: "public" })), true);
  assert.equal(matchesFilter(pub, f({ type: "private" })), false);
  assert.equal(matchesFilter(forked, f({ type: "source" })), false);
  assert.equal(matchesFilter(forked, f({ type: "fork" })), true);
  assert.equal(matchesFilter(arch, f({ type: "archived" })), true);
  assert.equal(matchesFilter(pub, f({ language: "dart" })), true, "language matching is case-insensitive");
  assert.equal(matchesFilter(pub, f({ language: "python" })), false);
});

test("sortRepos: default alphabetical, GitHub's choice wins when set", () => {
  const a = repo("alpha", [], { pushedAt: "2026-01-01T00:00:00Z", stargazers: 1 });
  const b = repo("beta", [], { pushedAt: "2026-09-01T00:00:00Z", stargazers: 9 });
  assert.deepEqual(sortRepos([b, a], "").map((r) => r.name), ["alpha", "beta"]);
  assert.deepEqual(sortRepos([a, b], "updated").map((r) => r.name), ["beta", "alpha"]);
  assert.deepEqual(sortRepos([a, b], "stargazers").map((r) => r.name), ["beta", "alpha"]);
});

test("applyFilter drops folders with no matches but keeps them when nothing is filtered", () => {
  const g = groupRepos([repo("api", ["topic-folders-client-a"]), repo("firmware", ["topic-folders-client-b"]), repo("tool", [])]);
  const filtered = applyFilter(g, { ...EMPTY_FILTER, q: "api" });
  assert.deepEqual(filtered.projects.map((p) => p.name), ["Client A"]);
  assert.deepEqual(filtered.ungrouped, []);
  assert.deepEqual(applyFilter(g, EMPTY_FILTER).projects.map((p) => p.name), ["Client A", "Client B"], "an empty folder survives when not filtering");
});

test("isFiltering ignores sort (ordering is not filtering)", () => {
  assert.equal(isFiltering(EMPTY_FILTER), false);
  assert.equal(isFiltering({ ...EMPTY_FILTER, sort: "updated" }), false);
  assert.equal(isFiltering({ ...EMPTY_FILTER, type: "private" }), true);
});
