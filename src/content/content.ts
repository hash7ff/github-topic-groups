// Content script: detect the "Repositories" tab of a user profile and mount the extension root.
// Rules: read as little as possible from GitHub's DOM (owner from URL + one anchor element),
// never use innerHTML with GitHub-derived strings, never touch the token.
import { h, clear } from "./ui/h.ts";
import { send } from "./messaging.ts";
import { groupRepos } from "../core/grouping.ts";
import type { AuthStatus, ReposList } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";

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

function openSettingsButton(): HTMLElement {
  return h("button", { className: "gtf-btn", type: "button", onClick: () => void send({ type: "options.open" }) }, "Open settings");
}

function describeError(error: ApiErrorInfo): string {
  let text = error.message;
  if (error.kind === "forbidden" && error.acceptedPermissions) text += ` (required permission: ${error.acceptedPermissions})`;
  if (error.kind === "rate_limited" && error.retryAfterSeconds) text += ` Retry after ${error.retryAfterSeconds}s.`;
  return text;
}

async function renderStatus(root: HTMLElement, ctx: PageContext): Promise<void> {
  const status = root.querySelector<HTMLElement>(".gtf-status");
  if (!status) return;
  const set = (...children: Parameters<typeof h>[2][]) => {
    clear(status);
    status.append(h("span", {}, ...children));
  };

  const auth = await send<AuthStatus>({ type: "auth.status" });
  if (!root.isConnected) return;
  if (!auth.ok) {
    set(h("span", { className: "gtf-error" }, describeError(auth.error)), " ", openSettingsButton());
    return;
  }
  if (!auth.data.configured) {
    set("Set up a GitHub token to enable the grouped view. ", openSettingsButton());
    return;
  }
  set(`Connected as ${auth.data.login ?? "?"}. Loading repositories…`);

  const list = await send<ReposList>({ type: "repos.list", owner: ctx.owner });
  if (!root.isConnected) return;
  if (!list.ok) {
    set(h("span", { className: "gtf-error" }, describeError(list.error)));
    return;
  }
  const grouped = groupRepos(list.data.repos);
  set(
    `Connected as ${list.data.login}. Loaded ${list.data.repos.length} repositories: ` +
      `${grouped.projects.length} projects, ${grouped.ungrouped.length} ungrouped, ${grouped.conflicts.length} conflicts` +
      (list.data.fromCache ? " (cached)." : "."),
  );
}

function buildRoot(ctx: PageContext): HTMLElement {
  const root = h("div", { id: ROOT_ID, className: "gtf-root", dataset: { gtfUrl: location.href } });
  root.append(h("div", { className: "gtf-badge" }, h("strong", {}, "GitHub Topic Folders"), " ", h("span", { className: "gtf-status" }, "…")));
  return root;
}

function mount(): void {
  const ctx = detectRepositoriesPage(location.href);
  const existing = document.getElementById(ROOT_ID);

  if (!ctx) {
    existing?.remove();
    return;
  }
  const anchor = document.getElementById(ANCHOR_ID);
  if (!anchor) {
    // GitHub DOM changed or the list is not rendered yet: do nothing, the original UI stays untouched.
    existing?.remove();
    return;
  }
  const alreadyMounted =
    existing !== null &&
    existing.isConnected &&
    existing.dataset["gtfUrl"] === location.href &&
    anchor.previousElementSibling === existing;
  if (alreadyMounted) return;

  existing?.remove();
  const root = buildRoot(ctx);
  anchor.before(root);
  void renderStatus(root, ctx);
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
