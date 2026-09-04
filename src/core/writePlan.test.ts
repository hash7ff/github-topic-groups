import test from "node:test";
import assert from "node:assert/strict";
import { expectationMatches, planTopicWrite } from "./writePlan.ts";

const P = "topic-groups-";

test("Case 2: ungrouped repo gains the group topic", () => {
  assert.deepEqual(planTopicWrite([], `${P}client-a`, P), { kind: "write", before: [], after: [`${P}client-a`] });
});

test("Case 3: move keeps every other topic", () => {
  assert.deepEqual(planTopicWrite(["backend", "python", `${P}client-a`], `${P}client-b`, P), {
    kind: "write",
    before: ["backend", "python", `${P}client-a`],
    after: ["backend", "python", `${P}client-b`],
  });
});

test("Case 5: null removes only group topics", () => {
  assert.deepEqual(planTopicWrite(["backend", `${P}client-a`], null, P), { kind: "write", before: ["backend", `${P}client-a`], after: ["backend"] });
});

test("no-op when already in place; errors for invalid/foreign topics and the 20-topic limit", () => {
  assert.equal(planTopicWrite([`${P}client-a`, "x"], `${P}client-a`, P).kind, "unchanged");
  assert.equal(planTopicWrite([], "Client A", P).kind, "error");
  assert.equal(planTopicWrite([], "group-client-a", P).kind, "error", "wrong prefix is refused");
  const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);
  assert.equal(planTopicWrite(twenty, `${P}a`, P).kind, "error");
  assert.equal(planTopicWrite([...twenty.slice(0, 19), `${P}old`], `${P}new`, P).kind, "write", "replacing keeps the count at 20");
});

test("expectationMatches: null skips, otherwise set equality of group topics", () => {
  assert.equal(expectationMatches(["topic-groups-a"], null), true);
  assert.equal(expectationMatches(["topic-groups-a"], ["topic-groups-a"]), true);
  assert.equal(expectationMatches([], []), true);
  assert.equal(expectationMatches(["topic-groups-b"], ["topic-groups-a"]), false, "moved elsewhere since the list was loaded");
  assert.equal(expectationMatches(["topic-groups-a", "topic-groups-b"], ["topic-groups-a"]), false, "a new conflict appeared");
});
