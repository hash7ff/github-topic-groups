import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFIX, displayNameFromTopic, isProjectTopic, isValidPrefix, isValidTopic, normalizeProjectName, projectTopics } from "./topic.ts";

const P = "project-"; // Plan.md examples use this prefix explicitly

/** topic on success, error text on failure (keeps assertions one-liners) */
const topicOf = (name: string, prefix = P): string => {
  const r = normalizeProjectName(name, prefix);
  return r.ok ? r.topic : `ERROR: ${r.error}`;
};

test("isProjectTopic recognises the project- prefix only", () => {
  assert.equal(isProjectTopic("project-client-a", P), true);
  assert.equal(isProjectTopic("python", P), false);
  assert.equal(isProjectTopic("project-", P), false, "bare prefix is not a project");
  assert.equal(isProjectTopic("myproject-x", P), false);
});

test("projectTopics keeps order and drops everything else", () => {
  assert.deepEqual(projectTopics(["python", "project-b", "backend", "project-a"], P), ["project-b", "project-a"]);
});

test("displayNameFromTopic: Plan.md §7 examples", () => {
  assert.equal(displayNameFromTopic("project-client-a", P), "Client A");
  assert.equal(displayNameFromTopic("project-my-oss", P), "My Oss");
  assert.equal(displayNameFromTopic("project-p001", P), "P001");
});

test("normalizeProjectName: Plan.md §7 examples and GitHub constraints", () => {
  assert.deepEqual(normalizeProjectName("Client A", P), { ok: true, topic: "project-client-a", slug: "client-a" });
  assert.deepEqual(normalizeProjectName("My OSS", P), { ok: true, topic: "project-my-oss", slug: "my-oss" });
  assert.equal(topicOf("  Client   A  "), "project-client-a");
  assert.equal(topicOf("Client_A / v2!"), "project-client-a-v2");
  assert.equal(topicOf("ＡＢＣ"), "project-abc", "full-width letters fold via NFKC");
  assert.equal(topicOf("株式会社ABC極秘案件"), "project-abc", "characters GitHub cannot hold are dropped; caller shows the preview");
  assert.equal(normalizeProjectName("極秘案件", P).ok, false, "nothing left -> error");
  assert.equal(normalizeProjectName("---", P).ok, false);
  assert.equal(normalizeProjectName("a".repeat(42), P).ok, true, "42 chars + 'project-' = 50");
  assert.equal(normalizeProjectName("a".repeat(43), P).ok, false, "43 chars would exceed 50");
});

test("isValidTopic follows GitHub rules", () => {
  assert.equal(isValidTopic("project-client-a"), true);
  assert.equal(isValidTopic("1abc"), true);
  assert.equal(isValidTopic("-abc"), false);
  assert.equal(isValidTopic("Abc"), false);
  assert.equal(isValidTopic("a".repeat(51)), false);
  assert.equal(isValidTopic(""), false);
});

test("default prefix is topic-folders- and leaves 36 characters for the name", () => {
  assert.equal(DEFAULT_PREFIX, "topic-folders-");
  assert.equal(topicOf("Client A", DEFAULT_PREFIX), "topic-folders-client-a");
  assert.equal(displayNameFromTopic("topic-folders-client-a"), "Client A");
  assert.equal(isProjectTopic("project-management"), false, "existing project-* topics are NOT folders by default");
  assert.equal(normalizeProjectName("a".repeat(36)).ok, true);
  assert.equal(normalizeProjectName("a".repeat(37)).ok, false);
});

test("isValidPrefix: lowercase topic fragment ending with a hyphen, 2..30 chars", () => {
  assert.equal(isValidPrefix("topic-folders-"), true);
  assert.equal(isValidPrefix("project-"), true);
  assert.equal(isValidPrefix("p-"), true);
  assert.equal(isValidPrefix("project"), false, "must end with a hyphen");
  assert.equal(isValidPrefix("-project-"), false);
  assert.equal(isValidPrefix("Project-"), false);
  assert.equal(isValidPrefix("-"), false);
  assert.equal(isValidPrefix("a".repeat(30) + "-"), false);
});
