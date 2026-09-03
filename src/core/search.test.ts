import test from "node:test";
import assert from "node:assert/strict";
import { filterGrouped, matchesQuery } from "./search.ts";
import { groupRepos } from "./grouping.ts";
import { repo } from "./fixtures.ts";

test("matchesQuery searches name and description, case-insensitively", () => {
  const r = repo("api", [], { description: "Backend for Client A" });
  assert.equal(matchesQuery(r, "API"), true);
  assert.equal(matchesQuery(r, "client a"), true);
  assert.equal(matchesQuery(r, "firmware"), false);
  assert.equal(matchesQuery(r, "   "), true);
});

test("filterGrouped drops projects with no matches (Plan.md §21)", () => {
  const g = groupRepos([repo("api", ["project-client-a"]), repo("firmware", ["project-client-b"]), repo("tool", [])]);
  const f = filterGrouped(g, "api");
  assert.deepEqual(f.projects.map((p) => p.name), ["Client A"]);
  assert.deepEqual(f.ungrouped, []);
});
