import type { RepoSummary } from "./types.ts";
import { DEFAULT_PREFIX, displayNameFromTopic, groupTopics } from "./topic.ts";

export type RepoGroup = { topic: string; name: string; repos: RepoSummary[] };
export type Conflict = { repo: RepoSummary; topics: string[] };
export type Grouped = { groups: RepoGroup[]; ungrouped: RepoSummary[]; conflicts: Conflict[] };

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
export const byName = (a: { name: string }, b: { name: string }): number => collator.compare(a.name, b.name);

/** Exactly one group topic -> that group; none -> Ungrouped; several -> Conflict (never auto-resolved). */
export function groupRepos(repos: readonly RepoSummary[], prefix: string = DEFAULT_PREFIX): Grouped {
  const byTopic = new Map<string, RepoSummary[]>();
  const ungrouped: RepoSummary[] = [];
  const conflicts: Conflict[] = [];

  for (const repo of repos) {
    const topics = groupTopics(repo.topics, prefix);
    const first = topics[0];
    if (first === undefined) {
      ungrouped.push(repo);
    } else if (topics.length === 1) {
      const list = byTopic.get(first) ?? [];
      list.push(repo);
      byTopic.set(first, list);
    } else {
      conflicts.push({ repo, topics });
    }
  }

  const groups: RepoGroup[] = [...byTopic.entries()].map(([topic, list]) => ({
    topic,
    name: displayNameFromTopic(topic, prefix),
    repos: list.sort(byName),
  }));
  groups.sort(byName);
  ungrouped.sort(byName);
  conflicts.sort((a, b) => byName(a.repo, b.repo));
  return { groups, ungrouped, conflicts };
}
