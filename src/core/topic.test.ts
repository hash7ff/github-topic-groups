import test from "node:test";
import assert from "node:assert/strict";
import { isProjectTopic, projectTopics } from "./topic.ts";

test("isProjectTopic recognises the project- prefix only", () => {
  assert.equal(isProjectTopic("project-client-a"), true);
  assert.equal(isProjectTopic("python"), false);
  assert.equal(isProjectTopic("project-"), false, "bare prefix is not a project");
  assert.equal(isProjectTopic("myproject-x"), false);
});

test("projectTopics keeps order and drops everything else", () => {
  assert.deepEqual(projectTopics(["python", "project-b", "backend", "project-a"]), ["project-b", "project-a"]);
});
