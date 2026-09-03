// Pure helpers around the `project-*` topic convention. No chrome.* / DOM access here.

export const PROJECT_PREFIX = "project-";
/** GitHub: topics are lowercase letters, numbers and hyphens, 50 chars max, 20 per repo (verified 2026-09-03). */
export const TOPIC_MAX_LENGTH = 50;
export const TOPICS_PER_REPO_MAX = 20;
export const PROJECT_NAME_MAX_LENGTH = TOPIC_MAX_LENGTH - PROJECT_PREFIX.length; // 42

const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isValidTopic(topic: string): boolean {
  return topic.length > 0 && topic.length <= TOPIC_MAX_LENGTH && TOPIC_PATTERN.test(topic);
}

export function isProjectTopic(topic: string): boolean {
  return topic.startsWith(PROJECT_PREFIX) && topic.length > PROJECT_PREFIX.length;
}

export function projectTopics(topics: readonly string[]): string[] {
  return topics.filter(isProjectTopic);
}

/** `project-client-a` -> `Client A`. Lossy on purpose (the topic stays the source of truth). */
export function displayNameFromTopic(topic: string): string {
  const slug = topic.startsWith(PROJECT_PREFIX) ? topic.slice(PROJECT_PREFIX.length) : topic;
  return slug
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type NormalizedProjectName =
  | { ok: true; topic: string; slug: string }
  | { ok: false; error: string; slug: string };

/**
 * `Client A` -> `project-client-a`. NFKC-normalises, lowercases, collapses anything that is not [a-z0-9] into single hyphens.
 * Characters GitHub topics cannot hold (e.g. Japanese) are dropped; the caller must show the resulting topic before writing.
 */
export function normalizeProjectName(displayName: string): NormalizedProjectName {
  const slug = displayName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    return { ok: false, slug, error: "Project name must contain letters (a-z) or numbers." };
  }
  if (slug.length > PROJECT_NAME_MAX_LENGTH) {
    return { ok: false, slug, error: `Project name is too long (max ${PROJECT_NAME_MAX_LENGTH} characters after normalisation).` };
  }
  const topic = PROJECT_PREFIX + slug;
  if (!isValidTopic(topic)) {
    return { ok: false, slug, error: "Project name produces an invalid GitHub topic." };
  }
  return { ok: true, topic, slug };
}
