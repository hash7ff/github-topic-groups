import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFIX, displayNameFromTopic, isGroupTopic, isValidPrefix, isValidTopic, normalizeGroupName, groupTopics } from "./topic.ts";

const P = "project-"; // a non-default prefix on purpose: it proves the prefix is a parameter, and it is the one docs/Plan.md was written against

/** topic on success, error text on failure (keeps assertions one-liners) */
const topicOf = (name: string, prefix = P): string => {
  const r = normalizeGroupName(name, prefix);
  return r.ok ? r.topic : `ERROR: ${r.error}`;
};

test("isGroupTopic recognises the group- prefix only", () => {
  assert.equal(isGroupTopic("project-client-a", P), true);
  assert.equal(isGroupTopic("python", P), false);
  assert.equal(isGroupTopic("project-", P), false, "bare prefix is not a group");
  assert.equal(isGroupTopic("myproject-x", P), false);
});

test("groupTopics keeps order and drops everything else", () => {
  assert.deepEqual(groupTopics(["python", "project-b", "backend", "project-a"], P), ["project-b", "project-a"]);
});

test("displayNameFromTopic: Plan.md §7 examples", () => {
  assert.equal(displayNameFromTopic("project-client-a", P), "Client A");
  assert.equal(displayNameFromTopic("project-my-oss", P), "My Oss");
  assert.equal(displayNameFromTopic("project-p001", P), "P001");
});

test("normalizeGroupName: Plan.md §7 examples and GitHub constraints", () => {
  assert.deepEqual(normalizeGroupName("Client A", P), { ok: true, topic: "project-client-a", slug: "client-a" });
  assert.deepEqual(normalizeGroupName("My OSS", P), { ok: true, topic: "project-my-oss", slug: "my-oss" });
  assert.equal(topicOf("  Client   A  "), "project-client-a");
  assert.equal(topicOf("Client_A / v2!"), "project-client-a-v2");
  assert.equal(topicOf("ＡＢＣ"), "project-abc", "full-width letters fold via NFKC");
  assert.equal(topicOf("株式会社ABC極秘案件"), "project-abc", "characters GitHub cannot hold are dropped; caller shows the preview");
  assert.equal(normalizeGroupName("極秘案件", P).ok, false, "nothing left -> error");
  assert.equal(normalizeGroupName("---", P).ok, false);
  assert.equal(normalizeGroupName("a".repeat(42), P).ok, true, "42 chars + 'project-' = 50");
  assert.equal(normalizeGroupName("a".repeat(43), P).ok, false, "43 chars would exceed 50");
});

test("isValidTopic follows GitHub rules", () => {
  assert.equal(isValidTopic("project-client-a"), true);
  assert.equal(isValidTopic("1abc"), true);
  assert.equal(isValidTopic("-abc"), false);
  assert.equal(isValidTopic("Abc"), false);
  assert.equal(isValidTopic("a".repeat(51)), false);
  assert.equal(isValidTopic(""), false);
});

test("default prefix is topic-groups- and leaves 37 characters for the name", () => {
  assert.equal(DEFAULT_PREFIX, "topic-groups-");
  assert.equal(topicOf("Client A", DEFAULT_PREFIX), "topic-groups-client-a");
  assert.equal(displayNameFromTopic("topic-groups-client-a"), "Client A");
  assert.equal(isGroupTopic("project-management"), false, "existing project-* topics are NOT folders by default");
  assert.equal(normalizeGroupName("a".repeat(37)).ok, true);
  assert.equal(normalizeGroupName("a".repeat(38)).ok, false);
});

test("isValidPrefix: lowercase topic fragment ending with a hyphen, 2..30 chars", () => {
  assert.equal(isValidPrefix("topic-groups-"), true);
  assert.equal(isValidPrefix("project-"), true);
  assert.equal(isValidPrefix("p-"), true);
  assert.equal(isValidPrefix("group"), false, "must end with a hyphen");
  assert.equal(isValidPrefix("-group-"), false);
  assert.equal(isValidPrefix("Group-"), false);
  assert.equal(isValidPrefix("-"), false);
  assert.equal(isValidPrefix("a".repeat(30) + "-"), false);
});
