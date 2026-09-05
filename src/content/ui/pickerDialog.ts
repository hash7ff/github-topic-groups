import { h, clear } from "./h.ts";
import { openDialog } from "./dialog.ts";
import { normalizeGroupName } from "../../core/topic.ts";
import { byName } from "../../core/grouping.ts";
import type { RepoSummary } from "../../core/types.ts";

type PickerBase = {
  repos: readonly RepoSummary[];
  preselected: readonly string[];
  /** Repositories with several group topics: excluded here, they must be resolved with Fix first. */
  conflicted: ReadonlySet<string>;
};

function repoPicker(opts: { repos: readonly RepoSummary[]; selected: Set<string>; onChange(): void }): { filter: HTMLInputElement; list: HTMLElement; render(): void } {
  const filter = h("input", { className: "gtf-input", type: "search", placeholder: "Filter repositories…", ariaLabel: "Filter repositories" });
  const list = h("div", { className: "gtf-picker" });
  const sorted = [...opts.repos].sort(byName);
  const render = () => {
    clear(list);
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const r of sorted) {
      if (q && !r.name.toLowerCase().includes(q)) continue;
      shown++;
      const cb = h("input", { type: "checkbox", disabled: r.archived }) as HTMLInputElement;
      cb.checked = opts.selected.has(r.name);
      cb.addEventListener("change", () => {
        if (cb.checked) opts.selected.add(r.name);
        else opts.selected.delete(r.name);
        opts.onChange();
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
    if (shown === 0) list.append(h("p", { className: "gtf-empty" }, "No repositories match."));
  };
  filter.addEventListener("input", render);
  return { filter, list, render };
}

function selectAllRow(selected: Set<string>, repos: readonly RepoSummary[], rerender: () => void): HTMLElement {
  const selectable = repos.filter((r) => !r.archived).map((r) => r.name);
  return h(
    "div",
    { className: "gtf-picker-tools" },
    h("button", { className: "gtf-link-btn", type: "button", onClick: () => { for (const n of selectable) selected.add(n); rerender(); } }, "Select all"),
    h("button", { className: "gtf-link-btn", type: "button", onClick: () => { selected.clear(); rerender(); } }, "Clear"),
  );
}

/** Create a group (or, if the name matches an existing one, move the chosen repositories into it). */
export function openNewGroupDialog(
  opts: PickerBase & {
    prefix: string;
    existingTopics: ReadonlySet<string>;
    showPrivacyNotice: boolean;
    onCreate(topic: string, displayName: string, repoNames: string[], dismissNotice: boolean): Promise<void>;
  },
): void {
  const dlg = openDialog("New group", { className: "gtf-dialog-wide" });
  const selected = new Set(opts.preselected);
  const available = opts.repos.filter((r) => !opts.conflicted.has(r.name));

  const nameInput = h("input", { className: "gtf-input", type: "text", placeholder: "e.g. Platform", ariaLabel: "Group name" });
  const preview = h("p", { className: "gtf-preview" });
  const notice = opts.showPrivacyNotice
    ? h(
        "div",
        { className: "gtf-notice gtf-notice-attention" },
        h("strong", {}, "Important: "),
        "GitHub registers topic names globally, even when you only use them on private repositories, so avoid company, client or engagement names. Your private repositories stay private: their names never appear on GitHub's public topic pages. ",
        h("label", { className: "gtf-check" }, h("input", { type: "checkbox", id: "gtf-dismiss-notice" }), " Don't show this again"),
      )
    : null;
  const count = h("span", { className: "gtf-muted" });
  const confirm = h("button", { className: "gtf-btn gtf-btn-primary", type: "button" }, "Create group");
  const error = h("p", { className: "gtf-error", hidden: true });

  const picker = repoPicker({ repos: available, selected, onChange: () => update() });
  const update = () => {
    const res = normalizeGroupName(nameInput.value, opts.prefix);
    const existing = res.ok && opts.existingTopics.has(res.topic);
    if (nameInput.value.trim() === "") {
      preview.textContent = `Topic: ${opts.prefix}…`;
      preview.className = "gtf-preview";
    } else if (res.ok) {
      preview.textContent = `Topic: ${res.topic}${existing ? "  (existing group — the repositories below move into it)" : ""}`;
      preview.className = "gtf-preview";
    } else {
      preview.textContent = res.error;
      preview.className = "gtf-preview gtf-error";
    }
    confirm.textContent = existing ? `Move to ${nameInput.value.trim()}` : "Create group";
    count.textContent = `${selected.size} repositor${selected.size === 1 ? "y" : "ies"} selected`;
    confirm.disabled = !(res.ok && selected.size > 0);
  };
  const rerender = () => {
    picker.render();
    update();
  };

  nameInput.addEventListener("input", update);
  confirm.addEventListener("click", async () => {
    const res = normalizeGroupName(nameInput.value, opts.prefix);
    if (!res.ok || selected.size === 0) return;
    confirm.disabled = true;
    const label = confirm.textContent;
    confirm.textContent = "Working…";
    error.hidden = true;
    const dismiss = (notice?.querySelector<HTMLInputElement>("#gtf-dismiss-notice")?.checked ?? false) === true;
    try {
      await opts.onCreate(res.topic, nameInput.value.trim(), [...selected], dismiss);
      dlg.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      confirm.disabled = false;
      confirm.textContent = label;
    }
  });

  dlg.body.append(
    h("label", { className: "gtf-field" }, h("span", { className: "gtf-field-label" }, "Group name"), nameInput),
    preview,
    ...(notice ? [notice] : []),
    h("div", { className: "gtf-field-label" }, "Repositories"),
    picker.filter,
    selectAllRow(selected, available, rerender),
    picker.list,
    h("div", { className: "gtf-dialog-foot" }, count, h("span", { className: "gtf-spacer" }), h("button", { className: "gtf-btn", type: "button", onClick: () => dlg.close() }, "Cancel"), confirm),
    error,
  );
  picker.render();
  update();
  nameInput.focus();
}

/** Move several repositories into an existing group in one go. */
export function openAddRepositoriesDialog(
  opts: PickerBase & {
    groupName: string;
    memberNames: ReadonlySet<string>;
    onAdd(repoNames: string[]): Promise<void>;
  },
): void {
  const dlg = openDialog(`Add repositories to ${opts.groupName}`, { className: "gtf-dialog-wide" });
  const selected = new Set<string>();
  // Members are already in the group; removing one is "Move to… → Ungrouped" on its row.
  const available = opts.repos.filter((r) => !opts.conflicted.has(r.name) && !opts.memberNames.has(r.name));

  const count = h("span", { className: "gtf-muted" });
  const confirm = h("button", { className: "gtf-btn gtf-btn-primary", type: "button" }, "Add");
  const error = h("p", { className: "gtf-error", hidden: true });
  const picker = repoPicker({ repos: available, selected, onChange: () => update() });
  const update = () => {
    count.textContent = `${selected.size} repositor${selected.size === 1 ? "y" : "ies"} selected`;
    confirm.disabled = selected.size === 0;
  };
  const rerender = () => {
    picker.render();
    update();
  };

  confirm.addEventListener("click", async () => {
    if (selected.size === 0) return;
    confirm.disabled = true;
    confirm.textContent = "Moving…";
    error.hidden = true;
    try {
      await opts.onAdd([...selected]);
      dlg.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      confirm.disabled = false;
      confirm.textContent = "Add";
    }
  });

  dlg.body.append(
    available.length === 0
      ? h("p", { className: "gtf-empty" }, "Every eligible repository is already in this group.")
      : h("p", { className: "gtf-muted" }, "Repositories already in this group are not listed. To take one out, use “Move to…” on its row."),
    picker.filter,
    selectAllRow(selected, available, rerender),
    picker.list,
    h("div", { className: "gtf-dialog-foot" }, count, h("span", { className: "gtf-spacer" }), h("button", { className: "gtf-btn", type: "button", onClick: () => dlg.close() }, "Cancel"), confirm),
    error,
  );
  picker.render();
  update();
}
