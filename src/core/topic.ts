// Pure helpers around the folder-topic convention (`<prefix><slug>`). No chrome.* / DOM access here.
//
// EXTENSION POINT — ordering and nesting.
// A GitHub topic is a flat string, so anything beyond a name has to be encoded in it (for example
// `topic-groups-10-client-a` for a sort key, or a separator for `Client A / Backend`). Every conversion between a
// topic and what the user sees goes through exactly two functions here: `displayNameFromTopic` (topic -> label) and
// `normalizeGroupName` (label -> topic), with `isGroupTopic` deciding what counts as a folder. Grouping, the
// dialogs and the write path never parse topic strings themselves, so a future convention can be added by changing
// these functions and returning richer values, without touching the UI or the write path.
// Deliberately NOT done in v0.1: such a convention leaks into every topic name and cannot be undone for users who
// already tagged repositories, so it needs real usage evidence first.

/**
 * Default prefix. `group-` was rejected because thousands of public repositories already carry topics such as
 * `group-management` / `group-euler` (counted 2026-09-03), which the extension would misread as folders and could
 * even delete via "Delete group". The prefix is configurable per browser (Prefs.prefix).
 */
export const DEFAULT_PREFIX = "topic-groups-";
/** GitHub: topics are lowercase letters, numbers and hyphens, 50 chars max, 20 per repo (verified 2026-09-03). */
export const TOPIC_MAX_LENGTH = 50;
export const TOPICS_PER_REPO_MAX = 20;
export const PREFIX_MAX_LENGTH = 30;

const TOPIC_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]*-$/;

export function isValidTopic(topic: string): boolean {
  return topic.length > 0 && topic.length <= TOPIC_MAX_LENGTH && TOPIC_PATTERN.test(topic);
}

/** A prefix is a valid topic fragment that ends with a hyphen and leaves room for a name. */
export function isValidPrefix(prefix: string): boolean {
  return prefix.length >= 2 && prefix.length <= PREFIX_MAX_LENGTH && PREFIX_PATTERN.test(prefix);
}

export function maxNameLength(prefix: string): number {
  return TOPIC_MAX_LENGTH - prefix.length;
}

export function isGroupTopic(topic: string, prefix: string = DEFAULT_PREFIX): boolean {
  return topic.startsWith(prefix) && topic.length > prefix.length;
}

export function groupTopics(topics: readonly string[], prefix: string = DEFAULT_PREFIX): string[] {
  return topics.filter((t) => isGroupTopic(t, prefix));
}

/** `topic-groups-client-a` -> `Client A`. Lossy on purpose (the topic stays the source of truth). */
export function displayNameFromTopic(topic: string, prefix: string = DEFAULT_PREFIX): string {
  const slug = topic.startsWith(prefix) ? topic.slice(prefix.length) : topic;
  return slug
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type NormalizedGroupName =
  | { ok: true; topic: string; slug: string }
  | { ok: false; error: string; slug: string };

/**
 * `Client A` -> `<prefix>client-a`. NFKC-normalises, lowercases, collapses anything that is not [a-z0-9] into single hyphens.
 * Characters GitHub topics cannot hold (e.g. Japanese) are dropped; the caller must show the resulting topic before writing.
 */
export function normalizeGroupName(displayName: string, prefix: string = DEFAULT_PREFIX): NormalizedGroupName {
  const slug = displayName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0) {
    return { ok: false, slug, error: "Group name must contain letters (a-z) or numbers." };
  }
  const max = maxNameLength(prefix);
  if (slug.length > max) {
    return { ok: false, slug, error: `Group name is too long (max ${max} characters after normalisation).` };
  }
  const topic = prefix + slug;
  if (!isValidTopic(topic)) {
    return { ok: false, slug, error: "Group name produces an invalid GitHub topic." };
  }
  return { ok: true, topic, slug };
}
