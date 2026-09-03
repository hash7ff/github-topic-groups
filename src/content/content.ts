// Content script: detect the "Repositories" tab of a user profile and mount the grouped view.
// Rules: read as little as possible from GitHub's DOM (owner from URL + one anchor element),
// never use innerHTML with GitHub-derived strings, never touch chrome.storage or the token (service worker only).
import { h } from "./ui/h.ts";
import { send } from "./messaging.ts";
import { groupRepos, type Grouped } from "../core/grouping.ts";
import { filterGrouped } from "../core/search.ts";
import { relativeTime } from "../core/relativeTime.ts";
import { DEFAULT_PREFS, type AuthStatus, type Prefs, type ReposList, type ViewMode } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";
import { buildToolbar, describeError, renderError, renderGroups, renderLoading, renderUnconfigured, setSegmentedMode, type ViewActions } from "./ui/view.ts";
import { openMoveDialog } from "./ui/moveDialog.ts";
import { openNewProjectDialog } from "./ui/newProjectDialog.ts";
import { runBulk } from "./bulk.ts";
import { projectTopics } from "../core/topic.ts";
import type { BulkItem, SetProjectResult } from "../core/messages.ts";

const ROOT_ID = "gtf-root";
const ANCHOR_ID = "user-repositories-list";

type PageContext = { owner: string };

/** `https://github.com/<owner>?tab=repositories` and nothing else. */
export function detectRepositoriesPage(href: string): PageContext | null {
  const url = new URL(href);
  if (url.hostname !== "github.com") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return null;
  if (url.searchParams.get("tab") !== "repositories") return null;
  const owner = segments[0];
  if (!owner || owner.startsWith("@")) return null;
  return { owner };
}

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
  private flashTimer: number | undefined;
  private busy = false;
  private prefs: Prefs = DEFAULT_PREFS;
  private phase: Phase = { kind: "loading" };
  private query = "";
  private disposed = false;
  private readonly ctx: PageContext;
  private readonly anchor: HTMLElement;
  private readonly actions: ViewActions;

  constructor(ctx: PageContext, anchor: HTMLElement) {
    this.ctx = ctx;
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
    };
    const { toolbar, status, seg } = buildToolbar(actions);
    this.status = status;
    this.seg = seg;
    this.body = h("div", { className: "gtf-body" });
    this.flash = h("div", { className: "gtf-flash", hidden: true });
    this.root = h("div", { id: ROOT_ID, className: "gtf-root", dataset: { gtfUrl: location.href } }, toolbar, this.flash, this.body);
    this.actions = actions;
  }

  async init(): Promise<void> {
    const prefs = await send<Prefs>({ type: "prefs.get" });
    if (this.disposed) return;
    if (prefs.ok) this.prefs = prefs.data;
    this.applyMode();
    await this.load(false);
  }

  /** Restore GitHub's own list. Called when the root is removed (navigation away). */
  dispose(): void {
    this.disposed = true;
    this.anchor.hidden = false;
  }

  private async load(force: boolean): Promise<void> {
    this.phase = { kind: "loading" };
    this.render();
    const auth = await send<AuthStatus>({ type: "auth.status" });
    if (this.disposed) return;
    if (!auth.ok) {
      this.phase = { kind: "error", error: auth.error };
      return this.render();
    }
    if (!auth.data.configured) {
      this.phase = { kind: "unconfigured" };
      return this.render();
    }
    const list = await send<ReposList>({ type: "repos.list", owner: this.ctx.owner, force });
    if (this.disposed) return;
    this.phase = list.ok ? { kind: "ready", data: list.data, grouped: groupRepos(list.data.repos, this.prefs.prefix) } : { kind: "error", error: list.error };
    this.render();
  }

  // ---- writes (M6): Move to… / New project ----
  private openMove(repoName: string): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const repo = this.phase.data.repos.find((r) => r.name === repoName);
    if (!repo) return;
    const current = projectTopics(repo.topics, this.prefs.prefix)[0] ?? null;
    openMoveDialog({
      repoName,
      currentTopic: current,
      projects: this.phase.grouped.projects.map((p) => ({ topic: p.topic, name: p.name, count: p.repos.length })),
      onSelect: (project) => {
        const target = project === null ? "Ungrouped" : (this.phase.kind === "ready" && this.phase.grouped.projects.find((p) => p.topic === project)?.name) || project;
        void this.applyWrites([{ owner: this.ctx.owner, repo: repoName, project }], `Moved ${repoName} to ${target}.`);
      },
      onNewProject: () => this.openNewProject([repoName]),
    });
  }

  private openNewProject(preselected: string[]): void {
    if (this.phase.kind !== "ready" || this.busy) return;
    const existing = new Set(this.phase.grouped.projects.map((p) => p.topic));
    openNewProjectDialog({
      repos: this.phase.data.repos,
      preselected,
      prefix: this.prefs.prefix,
      existingTopics: existing,
      showPrivacyNotice: !this.prefs.privacyNoticeDismissed,
      onCreate: async (topic, displayName, repoNames, dismiss) => {
        if (dismiss) {
          this.prefs = { ...this.prefs, privacyNoticeDismissed: true };
          void send({ type: "prefs.set", patch: { privacyNoticeDismissed: true } });
        }
        const items = repoNames.map((repo) => ({ owner: this.ctx.owner, repo, project: topic }));
        await this.applyWrites(items, `${existing.has(topic) ? "Moved" : "Created"} ${displayName}: ${repoNames.length} repositor${repoNames.length === 1 ? "y" : "ies"}.`, true);
      },
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
        const res = await send<SetProjectResult>({ type: "repos.setProject", owner: item.owner, repo: item.repo, project: item.project });
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
        this.showFlash("error", `${failed.length} of ${items.length} failed. ${detail}`, first.error.installUrl);
        if (rethrow) throw new Error(`${failed.length} of ${items.length} repositories could not be updated. ${describeError(first.error)}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private showFlash(kind: "ok" | "error", message: string, installUrl?: string): void {
    if (this.flashTimer !== undefined) clearTimeout(this.flashTimer);
    while (this.flash.firstChild) this.flash.removeChild(this.flash.firstChild);
    this.flash.className = `gtf-flash gtf-flash-${kind}`;
    this.flash.append(h("span", {}, message));
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
    this.anchor.hidden = grouped && this.phase.kind === "ready";
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
    const searching = this.query.trim() !== "";
    renderGroups(this.body, searching ? filterGrouped(p.grouped, this.query) : p.grouped, this.prefs.collapsed, searching, this.prefs.prefix, this.actions);
  }
}

const views = new WeakMap<Element, GroupedView>();

function mount(): void {
  const ctx = detectRepositoriesPage(location.href);
  const existing = document.getElementById(ROOT_ID);
  const anchor = document.getElementById(ANCHOR_ID);

  const teardown = () => {
    if (!existing) return;
    views.get(existing)?.dispose();
    existing.remove();
  };

  if (!ctx || !anchor) {
    // Not a repositories page, or GitHub's DOM changed: leave the original UI untouched.
    teardown();
    return;
  }
  const alreadyMounted =
    existing !== null && existing.isConnected && existing.dataset["gtfUrl"] === location.href && anchor.previousElementSibling === existing;
  if (alreadyMounted) return;

  teardown();
  const view = new GroupedView(ctx, anchor);
  views.set(view.root, view);
  anchor.before(view.root);
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

// GitHub navigates with Turbo (full reloads are not guaranteed). Re-run on every plausible signal;
// mount() is idempotent so over-triggering is harmless.
for (const eventName of ["turbo:load", "turbo:frame-load", "turbo:render"]) {
  document.addEventListener(eventName, scheduleMount);
}
window.addEventListener("popstate", scheduleMount);
new MutationObserver(scheduleMount).observe(document.body, { childList: true, subtree: true });

mount();
