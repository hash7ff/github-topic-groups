import { DEFAULT_PREFIX, isGroupTopic } from "./topic.ts";

/**
 * The single most important function in this extension: build the full topic list to PUT back.
 * Every topic outside the group prefix is preserved in its original order; the group topic (if any) is appended once.
 * `group === null` means "Ungrouped" (all group topics removed).
 */
export function withGroupTopic(current: readonly string[], group: string | null, prefix: string = DEFAULT_PREFIX): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const topic of current) {
    if (isGroupTopic(topic, prefix) || seen.has(topic)) continue;
    seen.add(topic);
    kept.push(topic);
  }
  if (group !== null && !seen.has(group)) kept.push(group);
  return kept;
}

export function sameTopicSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((t) => set.has(t));
}
