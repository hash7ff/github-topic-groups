// Pure helpers around the `project-*` topic convention. No chrome.* / DOM access here.

export const PROJECT_PREFIX = "project-";
/** GitHub: topics are lowercase letters, numbers and hyphens, 50 chars max, 20 per repo (verified 2026-09-03). */
export const TOPIC_MAX_LENGTH = 50;
export const TOPICS_PER_REPO_MAX = 20;

export function isProjectTopic(topic: string): boolean {
  return topic.startsWith(PROJECT_PREFIX) && topic.length > PROJECT_PREFIX.length;
}

export function projectTopics(topics: readonly string[]): string[] {
  return topics.filter(isProjectTopic);
}
