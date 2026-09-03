import test from "node:test";
import assert from "node:assert/strict";
import { groupRepos } from "./grouping.ts";
import { repo } from "./fixtures.ts";

test("Plan.md §33 Case 1: api+frontend under Client A, firmware Ungrouped", () => {
  const g = groupRepos([repo("frontend", ["project-client-a"]), repo("firmware", []), repo("api", ["project-client-a"])]);
  assert.deepEqual(
    g.projects.map((p) => ({ name: p.name, topic: p.topic, repos: p.repos.map((r) => r.name) })),
    [{ name: "Client A", topic: "project-client-a", repos: ["api", "frontend"] }],
  );
  assert.deepEqual(g.ungrouped.map((r) => r.name), ["firmware"]);
  assert.deepEqual(g.conflicts, []);
});

test("projects sort alphabetically by display name; repos by name (numeric aware)", () => {
  const g = groupRepos([repo("z", ["project-oss"]), repo("repo10", ["project-client-b"]), repo("repo2", ["project-client-b"]), repo("a", ["project-client-a"])]);
  assert.deepEqual(g.projects.map((p) => p.name), ["Client A", "Client B", "Oss"]);
  assert.deepEqual(g.projects[1]?.repos.map((r) => r.name), ["repo2", "repo10"]);
});

test("Plan.md §25: several project topics -> conflict, never auto-resolved, not shown in any group", () => {
  const g = groupRepos([repo("api", ["project-client-a", "project-client-b", "python"])]);
  assert.deepEqual(g.projects, []);
  assert.deepEqual(g.ungrouped, []);
  assert.equal(g.conflicts.length, 1);
  assert.deepEqual(g.conflicts[0]?.topics, ["project-client-a", "project-client-b"]);
});

test("non-project topics never influence grouping", () => {
  const g = groupRepos([repo("cli", ["python", "cli"])]);
  assert.deepEqual(g.ungrouped.map((r) => r.name), ["cli"]);
});
