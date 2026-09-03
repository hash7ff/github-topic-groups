// Rendering of the grouped view. Pure DOM construction from state; all text goes through textContent (see h.ts).
import { h, clear } from "./h.ts";
import type { Grouped, ProjectGroup } from "../../core/grouping.ts";
import type { RepoSummary, ApiErrorInfo } from "../../core/types.ts";
import { UNGROUPED_KEY } from "../../core/messages.ts";
import { displayNameFromTopic } from "../../core/topic.ts";
import { relativeTime } from "../../core/relativeTime.ts";

export type ViewActions = {
  toggleGroup(key: string): void;
  setMode(mode: "grouped" | "original"): void;
  setQuery(query: string): void;
  refresh(): void;
  retry(): void;
  openSettings(): void;
  moveRepo(repoName: string): void;
  newProject(): void;
  projectMenu(topic: string): void;
  fixConflict(repoName: string): void;
};

export function describeError(error: ApiErrorInfo): string {
  let text = error.message;
  if (error.kind === "forbidden" && error.acceptedPermissions) text += ` (required permission: ${error.acceptedPermissions})`;
  if (error.kind === "rate_limited" && error.retryAfterSeconds) text += ` Retry after ${error.retryAfterSeconds}s.`;
  return text;
}

export function buildToolbar(actions: ViewActions): { toolbar: HTMLElement; status: HTMLElement; search: HTMLInputElement; seg: HTMLElement } {
  const seg = h(
    "div",
    { className: "gtf-segmented", ariaLabel: "View" },
    h("button", { className: "gtf-seg-btn", type: "button", dataset: { mode: "grouped" }, onClick: () => actions.setMode("grouped") }, "Grouped"),
    h("button", { className: "gtf-seg-btn", type: "button", dataset: { mode: "original" }, onClick: () => actions.setMode("original") }, "Original"),
  );
  const search = h("input", {
    className: "gtf-search",
    type: "search",
    placeholder: "Search repositories…",
    ariaLabel: "Search repositories",
    onInput: (e) => actions.setQuery((e.target as HTMLInputElement).value),
  });
  const status = h("span", { className: "gtf-toolbar-status" });
  const toolbar = h(
    "div",
    { className: "gtf-toolbar" },
    seg,
    search,
    h("button", { className: "gtf-btn", type: "button", onClick: () => actions.newProject() }, "New project"),
    h("button", { className: "gtf-btn", type: "button", title: "Reload repositories from GitHub", onClick: () => actions.refresh() }, "Refresh"),
    status,
  );
  return { toolbar, status, search, seg };
}

export function setSegmentedMode(seg: HTMLElement, mode: "grouped" | "original"): void {
  for (const btn of seg.querySelectorAll<HTMLButtonElement>(".gtf-seg-btn")) {
    btn.setAttribute("aria-pressed", btn.dataset["mode"] === mode ? "true" : "false");
  }
}

function labels(repo: RepoSummary): HTMLElement[] {
  const out = [h("span", { className: "gtf-label" }, repo.private ? "Private" : "Public")];
  if (repo.archived) out.push(h("span", { className: "gtf-label gtf-label-attention" }, "Archived"));
  if (repo.fork) out.push(h("span", { className: "gtf-label" }, "Fork"));
  return out;
}

export function repoRow(repo: RepoSummary, extra?: HTMLElement, actions?: ViewActions): HTMLElement {
  const updated = relativeTime(repo.pushedAt ?? repo.updatedAt);
  const moveBtn = actions
    ? h(
        "button",
        { className: "gtf-btn", type: "button", disabled: repo.archived, title: repo.archived ? "Archived repositories are read-only on GitHub" : "Move this repository to another project", onClick: () => actions.moveRepo(repo.name) },
        "Move to…",
      )
    : null;
  return h(
    "li",
    { className: "gtf-repo", dataset: { repo: repo.name } },
    h(
      "div",
      { className: "gtf-repo-main" },
      h("div", { className: "gtf-repo-title" }, h("a", { className: "gtf-repo-name", href: repo.htmlUrl }, repo.name), ...labels(repo)),
      repo.description ? h("p", { className: "gtf-repo-desc" }, repo.description) : null,
      h(
        "div",
        { className: "gtf-repo-meta" },
        repo.language ? h("span", { className: "gtf-repo-lang" }, repo.language) : null,
        updated ? h("span", {}, `Updated ${updated}`) : null,
      ),
    ),
    extra || moveBtn ? h("div", { className: "gtf-repo-actions" }, extra ?? null, moveBtn) : null,
  );
}

function groupSection(key: string, name: string, repos: readonly RepoSummary[], collapsed: boolean, actions: ViewActions, className = "", withMenu = false): HTMLElement {
  const list = h("ul", { className: "gtf-repos", hidden: collapsed }, ...repos.map((r) => repoRow(r, undefined, actions)));
  const header = h(
    "button",
    { className: "gtf-group-header", type: "button", onClick: () => actions.toggleGroup(key) },
    h("span", { className: "gtf-caret", ariaLabel: collapsed ? "Expand" : "Collapse" }),
    h("span", { className: "gtf-group-name" }, name),
    h("span", { className: "gtf-count" }, String(repos.length)),
  );
  header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const head = h(
    "div",
    { className: "gtf-group-head" },
    header,
    withMenu ? h("button", { className: "gtf-btn gtf-group-menu", type: "button", title: "Rename or delete this project", ariaLabel: `Project menu for ${name}`, onClick: () => actions.projectMenu(key) }, "…") : null,
  );
  return h("section", { className: `gtf-group ${className}`.trim(), dataset: { key } }, head, list);
}

function conflictSection(grouped: Grouped, prefix: string, actions: ViewActions): HTMLElement | null {
  if (grouped.conflicts.length === 0) return null;
  const rows = grouped.conflicts.map((c) =>
    repoRow(
      c.repo,
      h(
        "span",
        { className: "gtf-conflict-cell" },
        h("span", { className: "gtf-conflict-note" }, `Multiple folder topics: ${c.topics.map((t) => displayNameFromTopic(t, prefix)).join(", ")}`),
        h("button", { className: "gtf-btn", type: "button", onClick: () => actions.fixConflict(c.repo.name) }, "Fix"),
      ),
    ),
  );
  const header = h(
    "div",
    { className: "gtf-group-header gtf-group-header-static" },
    h("span", { className: "gtf-group-name" }, "Conflicts"),
    h("span", { className: "gtf-count" }, String(grouped.conflicts.length)),
  );
  return h("section", { className: "gtf-group gtf-conflicts", dataset: { key: "__conflicts" } }, header, h("ul", { className: "gtf-repos" }, ...rows));
}

export function renderGroups(body: HTMLElement, grouped: Grouped, collapsed: Record<string, boolean>, searching: boolean, prefix: string, actions: ViewActions): void {
  clear(body);
  const isCollapsed = (key: string) => !searching && collapsed[key] === true;
  const total = grouped.projects.reduce((n, p) => n + p.repos.length, 0) + grouped.ungrouped.length + grouped.conflicts.length;
  if (total === 0) {
    body.append(h("p", { className: "gtf-empty" }, searching ? "No repositories match your search." : "No repositories found."));
    return;
  }
  const conflicts = conflictSection(grouped, prefix, actions);
  if (conflicts) body.append(conflicts);
  for (const p of grouped.projects as ProjectGroup[]) body.append(groupSection(p.topic, p.name, p.repos, isCollapsed(p.topic), actions, "", true));
  if (grouped.ungrouped.length > 0) body.append(groupSection(UNGROUPED_KEY, "Ungrouped", grouped.ungrouped, isCollapsed(UNGROUPED_KEY), actions, "gtf-ungrouped"));
}

export function renderError(body: HTMLElement, error: ApiErrorInfo, actions: ViewActions): void {
  clear(body);
  body.append(
    h(
      "div",
      { className: "gtf-error-panel" },
      h("p", { className: "gtf-error" }, "Failed to load repository groups. ", describeError(error)),
      h(
        "div",
        { className: "gtf-actions" },
        h("button", { className: "gtf-btn", type: "button", onClick: () => actions.retry() }, "Retry"),
        h("button", { className: "gtf-btn", type: "button", onClick: () => actions.setMode("original") }, "Show original GitHub view"),
        error.kind === "not_installed" && error.installUrl
          ? h("a", { className: "gtf-btn", href: error.installUrl }, "Install on your repositories")
          : null,
        error.kind === "unauthorized" || error.kind === "forbidden" || error.kind === "not_installed"
          ? h("button", { className: "gtf-btn", type: "button", onClick: () => actions.openSettings() }, "Open settings")
          : null,
      ),
    ),
  );
}

export function renderUnconfigured(body: HTMLElement, actions: ViewActions): void {
  clear(body);
  body.append(
    h(
      "div",
      { className: "gtf-notice" },
      "Sign in with GitHub to enable the grouped view. ",
      h("button", { className: "gtf-btn", type: "button", onClick: () => actions.openSettings() }, "Sign in"),
    ),
  );
}

export function renderLoading(body: HTMLElement): void {
  clear(body);
  body.append(h("p", { className: "gtf-loading" }, "Loading repositories…"));
}
