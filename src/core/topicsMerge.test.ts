import test from "node:test";
import assert from "node:assert/strict";
import { sameTopicSet, withProjectTopic } from "./topicsMerge.ts";

test("Plan.md §33 Case 3: moving api to Client B keeps python and backend", () => {
  assert.deepEqual(withProjectTopic(["project-client-a", "python", "backend"], "project-client-b"), ["python", "backend", "project-client-b"]);
});

test("Plan.md §33 Case 2: adding a project to an ungrouped repo", () => {
  assert.deepEqual(withProjectTopic([], "project-client-a"), ["project-client-a"]);
  assert.deepEqual(withProjectTopic(["cli"], "project-client-a"), ["cli", "project-client-a"]);
});

test("Plan.md §33 Case 5 / §11: project deletion removes only project-* topics", () => {
  assert.deepEqual(withProjectTopic(["project-client-a", "python", "backend"], null), ["python", "backend"]);
});

test("conflict fix: all project topics are replaced by the chosen one", () => {
  assert.deepEqual(withProjectTopic(["project-a", "python", "project-b"], "project-b"), ["python", "project-b"]);
});

test("property: non-project topics are preserved exactly, in order, for arbitrary inputs", () => {
  const inputs = [
    ["a", "project-x", "b", "c"],
    ["project-x"],
    ["z", "y", "x", "project-1", "project-2"],
    ["dup", "dup", "project-x"],
  ];
  for (const input of inputs) {
    for (const project of ["project-new", null]) {
      const out = withProjectTopic(input, project);
      const nonProjectIn = [...new Set(input.filter((t) => !t.startsWith("project-")))];
      const nonProjectOut = out.filter((t) => !t.startsWith("project-"));
      assert.deepEqual(nonProjectOut, nonProjectIn, `input=${input} project=${project}`);
      assert.ok(out.filter((t) => t.startsWith("project-")).length <= 1, "at most one project topic");
      assert.equal(new Set(out).size, out.length, "no duplicates");
    }
  }
});

test("sameTopicSet ignores order", () => {
  assert.equal(sameTopicSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameTopicSet(["a"], ["a", "b"]), false);
});
