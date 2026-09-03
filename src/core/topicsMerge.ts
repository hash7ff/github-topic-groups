import { isProjectTopic } from "./topic.ts";

/**
 * The single most important function in this extension: build the full topic list to PUT back.
 * Every non-`project-*` topic is preserved in its original order; the project topic (if any) is appended once.
 * `project === null` means "Ungrouped" (all project topics removed).
 */
export function withProjectTopic(current: readonly string[], project: string | null): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const topic of current) {
    if (isProjectTopic(topic) || seen.has(topic)) continue;
    seen.add(topic);
    kept.push(topic);
  }
  if (project !== null && !seen.has(project)) kept.push(project);
  return kept;
}

export function sameTopicSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((t) => set.has(t));
}
