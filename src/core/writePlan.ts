// Decide what (if anything) to PUT for one repository. Pure; the service worker executes the plan.
import { isProjectTopic, isValidTopic, TOPICS_PER_REPO_MAX } from "./topic.ts";
import { sameTopicSet, withProjectTopic } from "./topicsMerge.ts";

export type WritePlan =
  | { kind: "unchanged"; topics: string[] }
  | { kind: "write"; before: string[]; after: string[] }
  | { kind: "error"; message: string };

/**
 * @param current  the repository's topics as freshly read from GitHub (never from a cache)
 * @param project  the folder topic to assign (must start with `prefix`), or null for Ungrouped
 */
export function planTopicWrite(current: readonly string[], project: string | null, prefix: string): WritePlan {
  if (project !== null) {
    if (!isValidTopic(project)) return { kind: "error", message: `"${project}" is not a valid GitHub topic.` };
    if (!isProjectTopic(project, prefix)) return { kind: "error", message: `"${project}" does not start with the folder prefix "${prefix}".` };
  }
  const after = withProjectTopic(current, project, prefix);
  if (sameTopicSet(current, after)) return { kind: "unchanged", topics: [...current] };
  if (after.length > TOPICS_PER_REPO_MAX) {
    return { kind: "error", message: `GitHub allows at most ${TOPICS_PER_REPO_MAX} topics per repository; this one already has ${current.length}.` };
  }
  return { kind: "write", before: [...current], after };
}
