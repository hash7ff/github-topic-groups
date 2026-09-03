import { h, clear } from "./h.ts";
import { openDialog } from "./dialog.ts";
import { normalizeProjectName } from "../../core/topic.ts";
import { byName } from "../../core/grouping.ts";
import type { RepoSummary } from "../../core/types.ts";

export function openNewProjectDialog(opts: {
  repos: readonly RepoSummary[];
  preselected: readonly string[];
  prefix: string;
  existingTopics: ReadonlySet<string>;
  showPrivacyNotice: boolean;
  onCreate(topic: string, displayName: string, repoNames: string[], dismissNotice: boolean): Promise<void>;
}): void {
  const dlg = openDialog("New project", { className: "gtf-dialog-wide" });
  const selected = new Set(opts.preselected);

  const nameInput = h("input", { className: "gtf-input", type: "text", placeholder: "e.g. Client A", ariaLabel: "Project name" });
  const preview = h("p", { className: "gtf-preview" });
  const notice = opts.showPrivacyNotice
    ? h(
        "div",
        { className: "gtf-notice gtf-notice-attention" },
        h("strong", {}, "Important: "),
        "GitHub topic names are public even when used with private repositories. Do not use confidential client or project names as project topics. ",
        h("label", { className: "gtf-check" }, h("input", { type: "checkbox", id: "gtf-dismiss-notice" }), " Don't show this again"),
      )
    : null;

  const filter = h("input", { className: "gtf-input", type: "search", placeholder: "Filter repositories…", ariaLabel: "Filter repositories" });
  const list = h("div", { className: "gtf-picker" });
  const count = h("span", { className: "gtf-muted" });
  const createBtn = h("button", { className: "gtf-btn gtf-btn-primary", type: "button" }, "Create project");
  const error = h("p", { className: "gtf-error", hidden: true });

  const sorted = [...opts.repos].sort(byName);
  const renderList = () => {
    clear(list);
    const q = filter.value.trim().toLowerCase();
    for (const r of sorted) {
      if (q && !r.name.toLowerCase().includes(q)) continue;
      const cb = h("input", { type: "checkbox", disabled: r.archived }) as HTMLInputElement;
      cb.checked = selected.has(r.name);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(r.name);
        else selected.delete(r.name);
        update();
      });
      list.append(
        h(
          "label",
          { className: `gtf-picker-item ${r.archived ? "gtf-picker-item-disabled" : ""}`.trim(), title: r.archived ? "Archived repositories are read-only" : "" },
          cb,
          h("span", { className: "gtf-picker-name" }, r.name),
          r.private ? h("span", { className: "gtf-label" }, "Private") : null,
          r.archived ? h("span", { className: "gtf-label gtf-label-attention" }, "Archived") : null,
        ),
      );
    }
  };

  const update = () => {
    const res = normalizeProjectName(nameInput.value, opts.prefix);
    if (nameInput.value.trim() === "") {
      preview.textContent = `Topic: ${opts.prefix}…`;
      preview.className = "gtf-preview";
    } else if (res.ok) {
      preview.textContent = `Topic: ${res.topic}${opts.existingTopics.has(res.topic) ? "  (existing project — repositories will be moved there)" : ""}`;
      preview.className = "gtf-preview";
    } else {
      preview.textContent = res.error;
      preview.className = "gtf-preview gtf-error";
    }
    count.textContent = `${selected.size} repositor${selected.size === 1 ? "y" : "ies"} selected`;
    createBtn.disabled = !(res.ok && selected.size > 0);
  };

  nameInput.addEventListener("input", update);
  filter.addEventListener("input", renderList);
  createBtn.addEventListener("click", async () => {
    const res = normalizeProjectName(nameInput.value, opts.prefix);
    if (!res.ok || selected.size === 0) return;
    createBtn.disabled = true;
    createBtn.textContent = "Creating…";
    error.hidden = true;
    const dismiss = (notice?.querySelector<HTMLInputElement>("#gtf-dismiss-notice")?.checked ?? false) === true;
    try {
      await opts.onCreate(res.topic, nameInput.value.trim(), [...selected], dismiss);
      dlg.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      createBtn.disabled = false;
      createBtn.textContent = "Create project";
    }
  });

  dlg.body.append(
    h("label", { className: "gtf-field" }, h("span", { className: "gtf-field-label" }, "Project name"), nameInput),
    preview,
    ...(notice ? [notice] : []),
    h("div", { className: "gtf-field-label" }, "Repositories"),
    filter,
    list,
    h("div", { className: "gtf-dialog-foot" }, count, h("span", { className: "gtf-spacer" }), h("button", { className: "gtf-btn", type: "button", onClick: () => dlg.close() }, "Cancel"), createBtn),
    error,
  );
  renderList();
  update();
  nameInput.focus();
}
