// Decide what (if anything) to PUT for one repository. Pure; the service worker executes the plan.
import { isGroupTopic, isValidTopic, TOPICS_PER_REPO_MAX } from "./topic.ts";
import { sameTopicSet, withGroupTopic } from "./topicsMerge.ts";

/** True when the group topics currently on GitHub are exactly what the user saw when confirming the action. */
export function expectationMatches(currentGroupTopics: readonly string[], expect: readonly string[] | null): boolean {
  if (expect === null) return true;
  return sameTopicSet(currentGroupTopics, expect);
}

export type WritePlan =
  | { kind: "unchanged"; topics: string[] }
  | { kind: "write"; before: string[]; after: string[] }
  | { kind: "error"; message: string };

/**
 * @param current  the repository's topics as freshly read from GitHub (never from a cache)
 * @param group  the group topic to assign (must start with `prefix`), or null for Ungrouped
 */
export function planTopicWrite(current: readonly string[], group: string | null, prefix: string): WritePlan {
  if (group !== null) {
    if (!isValidTopic(group)) return { kind: "error", message: `"${group}" is not a valid GitHub topic.` };
    if (!isGroupTopic(group, prefix)) return { kind: "error", message: `"${group}" does not start with the group prefix "${prefix}".` };
  }
  const after = withGroupTopic(current, group, prefix);
  if (sameTopicSet(current, after)) return { kind: "unchanged", topics: [...current] };
  if (after.length > TOPICS_PER_REPO_MAX) {
    return { kind: "error", message: `GitHub allows at most ${TOPICS_PER_REPO_MAX} topics per repository; this one already has ${current.length}.` };
  }
  return { kind: "write", before: [...current], after };
}
