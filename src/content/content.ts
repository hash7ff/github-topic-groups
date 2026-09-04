// Content script: mount the grouped view on a repository list page.
// Rules: read as little as possible from GitHub's DOM (that knowledge lives entirely in ./pages/*),
// never use innerHTML with GitHub-derived strings, never touch chrome.storage or the token (service worker only).
import { h } from "./ui/h.ts";
import { pickAdapter, type PageAdapter, type PageContext } from "./pages/index.ts";
import { closeAllDialogs } from "./ui/dialog.ts";
import { send } from "./messaging.ts";
import { groupRepos, type Grouped } from "../core/grouping.ts";
import { applyFilter, EMPTY_FILTER, isFiltering, parseFilterFromUrl, type GitHubFilter } from "../core/filters.ts";
import { relativeTime } from "../core/relativeTime.ts";
import { DEFAULT_PREFS, type AuthStatus, type Prefs, type ReposList, type ViewMode } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";
import { buildToolbar, describeError, renderError, renderFilterChips, renderGroups, renderLoading, renderUnconfigured, setSegmentedMode, type ViewActions } from "./ui/view.ts";
import { openMoveDialog } from "./ui/moveDialog.ts";
import { openAddRepositoriesDialog, openNewProjectDialog } from "./ui/pickerDialog.ts";
import { openDeleteDialog, openProjectMenu, openRenameDialog } from "./ui/projectDialogs.ts";
import { openFixDialog } from "./ui/fixDialog.ts";
import { runBulk } from "./bulk.ts";
import { displayNameFromTopic, projectTopics } from "../core/topic.ts";
import type { BulkItem, SetProjectResult } from "../core/messages.ts";

const ROOT_ID = "gtf-root";

type Phase =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "error"; error: ApiErrorInfo }
  | { kind: "ready"; data: ReposList; grouped: Grouped };

class GroupedView {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private readonly seg: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly chips: HTMLElement;
  /** GitHub's own Find/Type/Language/Sort controls stay above our view; their state lives in the URL. */
  private readonly urlFilter: GitHubFilter = EMPTY_FILTER;
  private flashTimer: number | undefined;
  private busy = false;
  private loadSeq = 0;
  private prefs: Prefs = DEFAULT_PREFS;
  private phase: Phase = { kind: "loading" };
  private query = "";
  private disposed = false;
  private readonly ctx: PageContext;
  private readonly adapter: PageAdapter;
  /** Re-read on every render: React pages replace this element (see pages/orgRepos.ts). */
  private anchor: HTMLElement;
  private readonly actions: ViewActions;
  readonly url = location.href;

  constructor(ctx: PageContext, adapter: PageAdapter, anchor: HTMLElement) {
    this.ctx = ctx;
    this.adapter = adapter;
    this.anchor = anchor;
    const actions: ViewActions = {
      toggleGroup: (key) => this.toggleGroup(key),
      setMode: (mode) => this.setMode(mode),
      setQuery: (q) => {
        this.query = q;
        this.renderBody();
      },
      refresh: () => void this.load(true),
      retry: () => void this.load(true),
      openSettings: () => void send({ type: "options.open" }),
      moveRepo: (name) => this.openMove(name),
      newProject: () => this.openNewProject([]),
      projectMenu: (topic) => this.openProjectMenu(topic),
      fixConflict: (name) => this.openFix(name),
    };
    const { toolbar, status, seg, search } = buildToolbar(actions);
    this.status = status;
    this.seg = seg;
    this.urlFilter = parseFilterFromUrl(location.href);
    this.query = this.urlFilter.q;
    search.value = this.urlFilter.q; // GitHub's search box submitted this; keep ours in sync
    this.chips = h("div", { className: "gtf-chips", hidden: true });
    this.body = h("div", { className: "gtf-body" });
    this.flash = h("div", { className: "gtf-flash", hidden: true });
    this.root = h("div", { id: ROOT_ID, className: "gtf-root", dataset: { gtfUrl: location.href } }, toolbar, this.chips, this.flash, this.body);
    renderFilterChips(this.chips, this.urlFilter, location.href);
    this.actions = actions;
  }

  async init(): Promise<void> {
    const prefs = await send<Prefs>({ type: "prefs.get" });
    if (this.disposed) return;
    if (prefs.ok) this.prefs = prefs.data;
    this.applyMode();
    await this.load(false);
  }

  /** Put our root in front of GitHub's list and apply the current mode. Safe to call on every render. */
  attach(anchor: HTMLElement): void {
    this.anchor = anchor;
    if (anchor.previousElementSibling !== this.root) anchor.before(this.root);
    this.applyMode();
  }

  /** Restore GitHub's own list and drop anything this view still owns. Called on navigation away / remount. */
  dispose(): void {
    this.disposed = true;
    this.loadSeq++;
    this.adapter.restore();
    closeAllDialogs();
    this.root.remove();
  }

  private async load(force: boolean): Promise<void> {
    const seq = ++this.loadSeq; // a newer load (Refresh, remount) makes this one's result obsolete
    this.phase = { kind: "loading" };
    this.render();
    const auth = await send<AuthStatus>({ type: "auth.status" });
    if (this.disposed || seq !== this.loadSeq) return;
    if (!auth.ok) {
      this.phase = { kind: "error", error: auth.error };
      return this.render();
    }
    if (!auth.data.configured) {
      this.phase = { kind: "unconfigured" };
      return this.render();
    }
    const list = await send<ReposList>({ type: "repos.list", owner: this.ctx.owner, force });
    if (this.disposed || seq !== this.loadSeq) return;
    this.phase = list.ok ? { kind: "ready", data: list.data, grouped: groupRepos(list.data.repos, this.prefs.prefix) } : { kind: "error", error: list.error };
    this.render();
  }

  // ---- writes (M6): Move to… / New project ----
  private openMove(repoName: string): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const repo = this.phase.data.repos.find((r) => r.name === repoName);
    if (!repo) return;
    const folderTopics = projectTopics(repo.topics, this.prefs.prefix);
    const current = folderTopics[0] ?? null;
    openMoveDialog({
      repoName,
      currentTopic: current,
      projects: this.phase.grouped.projects.map((p) => ({ topic: p.topic, name: p.name, count: p.repos.length })),
      onSelect: (project) => {
        const target = project === null ? "Ungrouped" : (this.phase.kind === "ready" && this.phase.grouped.projects.find((p) => p.topic === project)?.name) || project;
        void this.applyWrites([{ owner: this.ctx.owner, repo: repoName, project, expect: folderTopics }], `Moved ${repoName} to ${target}.`);
      },
      onNewProject: () => this.openNewProject([repoName]),
    });
  }

  private openNewProject(preselected: string[]): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const existing = new Set(this.phase.grouped.projects.map((p) => p.topic));
    const repos = this.phase.data.repos;
    openNewProjectDialog({
      repos,
      preselected,
      prefix: this.prefs.prefix,
      existingTopics: existing,
      conflicted: new Set(this.phase.grouped.conflicts.map((c) => c.repo.name)),
      showPrivacyNotice: !this.prefs.privacyNoticeDismissed,
      onCreate: async (topic, displayName, repoNames, dismiss) => {
        if (dismiss) {
          this.prefs = { ...this.prefs, privacyNoticeDismissed: true };
          void send({ type: "prefs.set", patch: { privacyNoticeDismissed: true } });
        }
        const expectOf = (name: string) => projectTopics(repos.find((r) => r.name === name)?.topics ?? [], this.prefs.prefix);
        const items = repoNames.map((repo) => ({ owner: this.ctx.owner, repo, project: topic, expect: expectOf(repo) }));
        await this.applyWrites(items, `${existing.has(topic) ? "Moved" : "Created"} ${displayName}: ${repoNames.length} repositor${repoNames.length === 1 ? "y" : "ies"}.`, true);
      },
    });
  }

  // ---- M8: conflict fix (several folder topics on one repository) ----
  private openFix(repoName: string): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const conflict = this.phase.grouped.conflicts.find((c) => c.repo.name === repoName);
    if (!conflict) return;
    openFixDialog({
      repoName,
      topics: conflict.topics,
      prefix: this.prefs.prefix,
      onFix: (keep) => this.applyWrites([{ owner: this.ctx.owner, repo: repoName, project: keep, expect: [...conflict.topics] }], `Fixed ${repoName}: kept ${displayNameFromTopic(keep, this.prefs.prefix)}.`, true),
    });
  }

  // ---- M7: rename / delete a project = bulk topic replacement over its repositories ----
  private openProjectMenu(topic: string): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const project = this.phase.grouped.projects.find((p) => p.topic === topic);
    if (!project) return;
    const repos = project.repos.map((r) => r.name);
    const existing = new Set(this.phase.grouped.projects.map((p) => p.topic));
    openProjectMenu({
      name: project.name,
      onAdd: () =>
        openAddRepositoriesDialog({
          projectName: project.name,
          repos: this.phase.kind === "ready" ? this.phase.data.repos : [],
          preselected: [],
          conflicted: new Set(this.phase.kind === "ready" ? this.phase.grouped.conflicts.map((c) => c.repo.name) : []),
          memberNames: new Set(repos),
          onAdd: (names) => {
            const all = this.phase.kind === "ready" ? this.phase.data.repos : [];
            const expectOf = (name: string) => projectTopics(all.find((r) => r.name === name)?.topics ?? [], this.prefs.prefix);
            return this.applyWrites(
              names.map((repo) => ({ owner: this.ctx.owner, repo, project: topic, expect: expectOf(repo) })),
              `Moved ${names.length} repositor${names.length === 1 ? "y" : "ies"} into ${project.name}.`,
              true,
            );
          },
        }),
      onRename: () =>
        openRenameDialog({
          name: project.name,
          topic,
          count: repos.length,
          prefix: this.prefs.prefix,
          existingTopics: existing,
          onRename: (newTopic, newName) =>
            this.applyWrites(
              repos.map((repo) => ({ owner: this.ctx.owner, repo, project: newTopic, expect: [topic] })),
              `Renamed ${project.name} to ${newName} (${repos.length} repositor${repos.length === 1 ? "y" : "ies"}).`,
              true,
            ),
        }),
      onDelete: () =>
        openDeleteDialog({
          name: project.name,
          count: repos.length,
          onDelete: () =>
            this.applyWrites(
              repos.map((repo) => ({ owner: this.ctx.owner, repo, project: null, expect: [topic] })),
              `Deleted project ${project.name}: ${repos.length} repositor${repos.length === 1 ? "y" : "ies"} moved to Ungrouped.`,
              true,
            ),
        }),
    });
  }

  /** Runs writes through the service worker, then reloads from the (patched) cache. UI changes only after GitHub confirmed. */
  private async applyWrites(items: BulkItem[], successMessage: string, rethrow = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status.textContent = items.length === 1 ? `Updating ${items[0]!.repo}…` : `Updating 0/${items.length}…`;
    try {
      let failed: Array<{ repo: string; error: ApiErrorInfo }> = [];
      let changedCount = 0;
      if (items.length === 1) {
        const item = items[0]!;
        const res = await send<SetProjectResult>({ type: "repos.setProject", owner: item.owner, repo: item.repo, project: item.project, expect: item.expect });
        if (res.ok) changedCount = res.data.changed ? 1 : 0;
        else failed = [{ repo: item.repo, error: res.error }];
        if (res.ok && res.data.dryRun) successMessage += " (dry run — nothing written)";
      } else {
        const result = await runBulk(items, (done, total) => {
          this.status.textContent = `Updating ${done}/${total}…`;
        });
        failed = result.failed;
        changedCount = result.succeeded.filter((s) => s.result.changed).length;
        if (result.succeeded.some((s) => s.result.dryRun)) successMessage += " (dry run — nothing written)";
      }
      await this.load(false);
      if (failed.length === 0) {
        this.showFlash("ok", changedCount === 0 ? "Nothing to change." : successMessage);
      } else {
        const first = failed[0]!;
        const detail = failed.map((f) => `${f.repo}: ${describeError(f.error)}`).join(" · ");
        const failedNames = new Set(failed.map((f) => f.repo));
        const retryItems = items.filter((i) => failedNames.has(i.repo));
        this.showFlash("error", `${failed.length} of ${items.length} failed. ${detail}`, first.error.installUrl, () => void this.applyWrites(retryItems, successMessage));
        if (rethrow) throw new Error(`${failed.length} of ${items.length} repositories could not be updated. ${describeError(first.error)}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private showFlash(kind: "ok" | "error", message: string, installUrl?: string, retry?: () => void): void {
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    while (this.flash.firstChild) this.flash.removeChild(this.flash.firstChild);
    this.flash.className = `gtf-flash gtf-flash-${kind}`;
    this.flash.append(h("span", {}, message));
    if (retry) this.flash.append(" ", h("button", { className: "gtf-btn", type: "button", onClick: () => { this.flash.hidden = true; retry(); } }, "Retry failed"));
    if (installUrl) this.flash.append(" ", h("a", { className: "gtf-btn", href: installUrl }, "Install the app on more repositories"));
    this.flash.append(h("button", { className: "gtf-btn gtf-flash-close", type: "button", ariaLabel: "Dismiss", onClick: () => (this.flash.hidden = true) }, "×"));
    this.flash.hidden = false;
    if (kind === "ok") this.flashTimer = window.setTimeout(() => (this.flash.hidden = true), 6000);
  }

  private toggleGroup(key: string): void {
    const collapsed = { ...this.prefs.collapsed, [key]: this.prefs.collapsed[key] !== true };
    this.prefs = { ...this.prefs, collapsed };
    void send({ type: "prefs.set", patch: { collapsed } });
    this.renderBody();
  }

  private setMode(mode: ViewMode): void {
    this.prefs = { ...this.prefs, viewMode: mode };
    void send({ type: "prefs.set", patch: { viewMode: mode } });
    this.applyMode();
  }

  /** Grouped mode hides GitHub's list ONLY while we have data to show; on error/unconfigured/loading it stays visible (Plan.md §24). */
  private applyMode(): void {
    const grouped = this.prefs.viewMode === "grouped";
    setSegmentedMode(this.seg, this.prefs.viewMode);
    this.body.hidden = !grouped;
    const hide = grouped && this.phase.kind === "ready";
    this.anchor.hidden = hide;
    if (!hide) this.adapter.restore();
  }

  private render(): void {
    this.renderStatus();
    this.renderBody();
    this.applyMode();
  }

  private renderStatus(): void {
    const p = this.phase;
    this.status.textContent =
      p.kind === "loading"
        ? "Loading repositories…"
        : p.kind === "ready"
          ? `${p.data.repos.length} repositories · ${p.grouped.projects.length} projects · updated ${relativeTime(new Date(p.data.fetchedAt).toISOString())}`
          : "";
  }

  private renderBody(): void {
    const p = this.phase;
    if (p.kind === "loading") return renderLoading(this.body);
    if (p.kind === "unconfigured") return renderUnconfigured(this.body, this.actions);
    if (p.kind === "error") return renderError(this.body, p.error, this.actions);
    const filter: GitHubFilter = { ...this.urlFilter, q: this.query };
    const searching = isFiltering(filter);
    renderGroups(this.body, applyFilter(p.grouped, filter), this.prefs.collapsed, searching, this.prefs.prefix, this.actions);
  }
}

// Exactly one live view per page. Tracked here (not via DOM lookup) so a view whose root the page already removed
// is still disposed: its pending loads/writes are ignored and its dialogs closed.
let activeView: GroupedView | null = null;

function mount(): void {
  const picked = pickAdapter(location.href);
  const anchor = picked?.adapter.anchor() ?? null;

  if (!picked || !anchor) {
    // Not a repository list page, or GitHub's DOM changed: leave the original UI untouched.
    activeView?.dispose();
    activeView = null;
    return;
  }
  ensureObserver(picked.adapter);

  // Same page, view already built: just make sure it is still in front of the (possibly re-created) list.
  if (activeView !== null && activeView.url === location.href && activeView.root.isConnected) {
    activeView.attach(anchor);
    return;
  }

  activeView?.dispose();
  for (const stray of document.querySelectorAll(`#${ROOT_ID}`)) stray.remove();
  const view = new GroupedView(picked.ctx, picked.adapter, anchor);
  activeView = view;
  view.attach(anchor);
  void view.init();
}

let scheduled: number | undefined;
function scheduleMount(): void {
  if (scheduled !== undefined) clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = undefined;
    mount();
  }, 100);
}

// Full page loads are not guaranteed: the profile tab uses Turbo, the organization pages use GitHub's React
// soft navigation. Re-run on every plausible signal; mount() is idempotent so over-triggering is harmless.
for (const eventName of ["turbo:load", "turbo:frame-load", "turbo:render", "soft-nav:end"]) {
  document.addEventListener(eventName, scheduleMount);
}
window.addEventListener("popstate", scheduleMount);

// Watch only the container the current page re-renders (Turbo frame or <main>); elsewhere watch the body's direct
// children only, so unrelated GitHub pages don't pay for a subtree observer.
const observer = new MutationObserver(scheduleMount);
let observed: Element | null = null;
function ensureObserver(adapter?: PageAdapter): void {
  const scoped = adapter?.observeTarget() ?? null;
  const target = scoped ?? document.body;
  if (target === observed) return;
  observer.disconnect();
  observer.observe(target, { childList: true, subtree: scoped !== null });
  observed = target;
}
ensureObserver(pickAdapter(location.href)?.adapter);

mount();
