import test from "node:test";
import assert from "node:assert/strict";
import { sameTopicSet, withGroupTopic } from "./topicsMerge.ts";

test("Plan.md §33 Case 3: moving api to Client B keeps python and backend", () => {
  assert.deepEqual(withGroupTopic(["project-client-a", "python", "backend"], "project-client-b", "project-"), ["python", "backend", "project-client-b"]);
});

test("Plan.md §33 Case 2: adding a group to an ungrouped repo", () => {
  assert.deepEqual(withGroupTopic([], "project-client-a", "project-"), ["project-client-a"]);
  assert.deepEqual(withGroupTopic(["cli"], "project-client-a", "project-"), ["cli", "project-client-a"]);
});

test("Plan.md §33 Case 5 / §11: group deletion removes only project-* topics", () => {
  assert.deepEqual(withGroupTopic(["project-client-a", "python", "backend"], null, "project-"), ["python", "backend"]);
});

test("conflict fix: all group topics are replaced by the chosen one", () => {
  assert.deepEqual(withGroupTopic(["project-a", "python", "project-b"], "project-b", "project-"), ["python", "project-b"]);
});

test("property: non-group topics are preserved exactly, in order, for arbitrary inputs", () => {
  const inputs = [
    ["a", "project-x", "b", "c"],
    ["project-x"],
    ["z", "y", "x", "project-1", "project-2"],
    ["dup", "dup", "project-x"],
  ];
  for (const input of inputs) {
    for (const group of ["project-new", null]) {
      const out = withGroupTopic(input, group, "project-");
      const nonGroupIn = [...new Set(input.filter((t) => !t.startsWith("project-")))];
      const nonGroupOut = out.filter((t) => !t.startsWith("project-"));
      assert.deepEqual(nonGroupOut, nonGroupIn, `input=${input} group=${group}`);
      assert.ok(out.filter((t) => t.startsWith("project-")).length <= 1, "at most one group topic");
      assert.equal(new Set(out).size, out.length, "no duplicates");
    }
  }
});

test("sameTopicSet ignores order", () => {
  assert.equal(sameTopicSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameTopicSet(["a"], ["a", "b"]), false);
});

test("default prefix: moving a repo keeps project-* topics because they are not group topics", () => {
  assert.deepEqual(withGroupTopic(["project-management", "topic-groups-a"], "topic-groups-b"), ["project-management", "topic-groups-b"]);
});
