import test from "node:test";
import assert from "node:assert/strict";
import { displayNameFromTopic, isProjectTopic, isValidTopic, normalizeProjectName, projectTopics } from "./topic.ts";

/** topic on success, error text on failure (keeps assertions one-liners) */
const topicOf = (name: string): string => {
  const r = normalizeProjectName(name);
  return r.ok ? r.topic : `ERROR: ${r.error}`;
};

test("isProjectTopic recognises the project- prefix only", () => {
  assert.equal(isProjectTopic("project-client-a"), true);
  assert.equal(isProjectTopic("python"), false);
  assert.equal(isProjectTopic("project-"), false, "bare prefix is not a project");
  assert.equal(isProjectTopic("myproject-x"), false);
});

test("projectTopics keeps order and drops everything else", () => {
  assert.deepEqual(projectTopics(["python", "project-b", "backend", "project-a"]), ["project-b", "project-a"]);
});

test("displayNameFromTopic: Plan.md §7 examples", () => {
  assert.equal(displayNameFromTopic("project-client-a"), "Client A");
  assert.equal(displayNameFromTopic("project-my-oss"), "My Oss");
  assert.equal(displayNameFromTopic("project-p001"), "P001");
});

test("normalizeProjectName: Plan.md §7 examples and GitHub constraints", () => {
  assert.deepEqual(normalizeProjectName("Client A"), { ok: true, topic: "project-client-a", slug: "client-a" });
  assert.deepEqual(normalizeProjectName("My OSS"), { ok: true, topic: "project-my-oss", slug: "my-oss" });
  assert.equal(topicOf("  Client   A  "), "project-client-a");
  assert.equal(topicOf("Client_A / v2!"), "project-client-a-v2");
  assert.equal(topicOf("ＡＢＣ"), "project-abc", "full-width letters fold via NFKC");
  assert.equal(topicOf("株式会社ABC極秘案件"), "project-abc", "characters GitHub cannot hold are dropped; caller shows the preview");
  assert.equal(normalizeProjectName("極秘案件").ok, false, "nothing left -> error");
  assert.equal(normalizeProjectName("---").ok, false);
  assert.equal(normalizeProjectName("a".repeat(42)).ok, true, "42 chars + 'project-' = 50");
  assert.equal(normalizeProjectName("a".repeat(43)).ok, false, "43 chars would exceed 50");
});

test("isValidTopic follows GitHub rules", () => {
  assert.equal(isValidTopic("project-client-a"), true);
  assert.equal(isValidTopic("1abc"), true);
  assert.equal(isValidTopic("-abc"), false);
  assert.equal(isValidTopic("Abc"), false);
  assert.equal(isValidTopic("a".repeat(51)), false);
  assert.equal(isValidTopic(""), false);
});
