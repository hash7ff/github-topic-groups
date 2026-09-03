import type { RepoSummary } from "./types.ts";
import type { Grouped } from "./grouping.ts";

export function matchesQuery(repo: RepoSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return repo.name.toLowerCase().includes(q) || (repo.description ?? "").toLowerCase().includes(q);
}

/** Client-side filter. Groups with no matching repositories are dropped. */
export function filterGrouped(grouped: Grouped, query: string): Grouped {
  if (query.trim() === "") return grouped;
  return {
    projects: grouped.projects
      .map((p) => ({ ...p, repos: p.repos.filter((r) => matchesQuery(r, query)) }))
      .filter((p) => p.repos.length > 0),
    ungrouped: grouped.ungrouped.filter((r) => matchesQuery(r, query)),
    conflicts: grouped.conflicts.filter((c) => matchesQuery(c.repo, query)),
  };
}
