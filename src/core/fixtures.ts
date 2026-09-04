import type { RepoSummary } from "./types.ts";

export function repo(name: string, topics: string[], extra: Partial<RepoSummary> = {}): RepoSummary {
  return {
    name,
    fullName: `mutsuyuki/${name}`,
    owner: "mutsuyuki",
    private: true,
    description: null,
    language: null,
    pushedAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    htmlUrl: `https://github.com/mutsuyuki/${name}`,
    topics,
    archived: false,
    fork: false,
    mirror: false,
    template: false,
    stargazers: 0,
    ...extra,
  };
}
