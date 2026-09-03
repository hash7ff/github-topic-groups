import test from "node:test";
import assert from "node:assert/strict";
import { planTopicWrite } from "./writePlan.ts";

const P = "topic-folders-";

test("Case 2: ungrouped repo gains the folder topic", () => {
  assert.deepEqual(planTopicWrite([], `${P}client-a`, P), { kind: "write", before: [], after: [`${P}client-a`] });
});

test("Case 3: move keeps every other topic", () => {
  assert.deepEqual(planTopicWrite(["backend", "python", `${P}client-a`], `${P}client-b`, P), {
    kind: "write",
    before: ["backend", "python", `${P}client-a`],
    after: ["backend", "python", `${P}client-b`],
  });
});

test("Case 5: null removes only folder topics", () => {
  assert.deepEqual(planTopicWrite(["backend", `${P}client-a`], null, P), { kind: "write", before: ["backend", `${P}client-a`], after: ["backend"] });
});

test("no-op when already in place; errors for invalid/foreign topics and the 20-topic limit", () => {
  assert.equal(planTopicWrite([`${P}client-a`, "x"], `${P}client-a`, P).kind, "unchanged");
  assert.equal(planTopicWrite([], "Client A", P).kind, "error");
  assert.equal(planTopicWrite([], "project-client-a", P).kind, "error", "wrong prefix is refused");
  const twenty = Array.from({ length: 20 }, (_, i) => `t${i}`);
  assert.equal(planTopicWrite(twenty, `${P}a`, P).kind, "error");
  assert.equal(planTopicWrite([...twenty.slice(0, 19), `${P}old`], `${P}new`, P).kind, "write", "replacing keeps the count at 20");
});
