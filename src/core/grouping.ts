import type { RepoSummary } from "./types.ts";
import { displayNameFromTopic, projectTopics } from "./topic.ts";

export type ProjectGroup = { topic: string; name: string; repos: RepoSummary[] };
export type Conflict = { repo: RepoSummary; topics: string[] };
export type Grouped = { projects: ProjectGroup[]; ungrouped: RepoSummary[]; conflicts: Conflict[] };

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
export const byName = (a: { name: string }, b: { name: string }): number => collator.compare(a.name, b.name);

/** Exactly one project topic -> that project; none -> Ungrouped; several -> Conflict (never auto-resolved). */
export function groupRepos(repos: readonly RepoSummary[]): Grouped {
  const byTopic = new Map<string, RepoSummary[]>();
  const ungrouped: RepoSummary[] = [];
  const conflicts: Conflict[] = [];

  for (const repo of repos) {
    const topics = projectTopics(repo.topics);
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

  const projects: ProjectGroup[] = [...byTopic.entries()].map(([topic, list]) => ({
    topic,
    name: displayNameFromTopic(topic),
    repos: list.sort(byName),
  }));
  projects.sort(byName);
  ungrouped.sort(byName);
  conflicts.sort((a, b) => byName(a.repo, b.repo));
  return { projects, ungrouped, conflicts };
}
