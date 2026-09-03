// Content script: detect the "Repositories" tab of a user profile and mount the extension root.
// M1 scope: idempotent mount of a placeholder badge that survives GitHub's Turbo navigation.
// Rules: read as little as possible from GitHub's DOM (owner from URL + one anchor element),
// never use innerHTML with GitHub-derived strings, never touch the token.

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

function buildRoot(ctx: PageContext): HTMLElement {
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "gtf-root";
  root.dataset["gtfUrl"] = location.href;

  const badge = document.createElement("div");
  badge.className = "gtf-badge";
  badge.textContent = `GitHub Topic Folders is active on this page (owner: ${ctx.owner}).`;
  root.append(badge);
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
  anchor.before(buildRoot(ctx));
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
