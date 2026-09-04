import { h } from "./h.ts";
import { openDialog } from "./dialog.ts";
import { normalizeProjectName } from "../../core/topic.ts";

const plural = (n: number) => `${n} repositor${n === 1 ? "y" : "ies"}`;

export function openProjectMenu(opts: { name: string; onAdd(): void; onRename(): void; onDelete(): void }): void {
  const dlg = openDialog(opts.name);
  const item = (label: string, danger: boolean, onClick: () => void) =>
    h("button", { className: `gtf-menu-item ${danger ? "gtf-menu-item-danger" : ""}`.trim(), type: "button", onClick: () => { dlg.close(); onClick(); } }, h("span", { className: "gtf-menu-item-label" }, label));
  dlg.body.append(
    h("div", { className: "gtf-menu" }, item("Add repositories…", false, opts.onAdd), item("Rename project…", false, opts.onRename), item("Delete project…", true, opts.onDelete)),
  );
}

export function openRenameDialog(opts: {
  name: string;
  topic: string;
  count: number;
  prefix: string;
  existingTopics: ReadonlySet<string>;
  onRename(newTopic: string, newName: string): Promise<void>;
}): void {
  const dlg = openDialog(`Rename ${opts.name}`);
  const input = h("input", { className: "gtf-input", type: "text", ariaLabel: "New project name" }) as HTMLInputElement;
  input.value = opts.name;
  const preview = h("p", { className: "gtf-preview" });
  const summary = h("p", {});
  const error = h("p", { className: "gtf-error", hidden: true });
  const btn = h("button", { className: "gtf-btn gtf-btn-primary", type: "button" }, "Rename");

  const update = () => {
    const res = normalizeProjectName(input.value, opts.prefix);
    if (!res.ok) {
      preview.textContent = res.error;
      preview.className = "gtf-preview gtf-error";
      btn.disabled = true;
      summary.textContent = "";
      return;
    }
    preview.className = "gtf-preview";
    if (res.topic === opts.topic) {
      preview.textContent = `Topic: ${res.topic} (unchanged)`;
      summary.textContent = "";
      btn.disabled = true;
      return;
    }
    const merge = opts.existingTopics.has(res.topic);
    preview.textContent = `Topic: ${opts.topic} → ${res.topic}`;
    summary.textContent = merge
      ? `This will move ${plural(opts.count)} into the existing project "${input.value.trim()}".`
      : `Rename "${opts.name}" to "${input.value.trim()}"? This will update ${plural(opts.count)}.`;
    btn.disabled = false;
  };
  input.addEventListener("input", update);
  btn.addEventListener("click", async () => {
    const res = normalizeProjectName(input.value, opts.prefix);
    if (!res.ok) return;
    btn.disabled = true;
    btn.textContent = "Renaming…";
    try {
      await opts.onRename(res.topic, input.value.trim());
      dlg.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      btn.disabled = false;
      btn.textContent = "Rename";
    }
  });
  dlg.body.append(
    h("label", { className: "gtf-field" }, h("span", { className: "gtf-field-label" }, "New project name"), input),
    preview,
    summary,
    h("p", { className: "gtf-muted" }, "Topics have no rename operation on GitHub: each repository's folder topic is replaced one by one."),
    h("div", { className: "gtf-dialog-foot" }, h("span", { className: "gtf-spacer" }), h("button", { className: "gtf-btn", type: "button", onClick: () => dlg.close() }, "Cancel"), btn),
    error,
  );
  update();
  input.focus();
  input.select();
}

export function openDeleteDialog(opts: { name: string; count: number; onDelete(): Promise<void> }): void {
  const dlg = openDialog(`Delete project "${opts.name}"?`);
  const error = h("p", { className: "gtf-error", hidden: true });
  const btn = h("button", { className: "gtf-btn gtf-btn-danger", type: "button" }, "Delete project");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      await opts.onDelete();
      dlg.close();
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
      error.hidden = false;
      btn.disabled = false;
      btn.textContent = "Delete project";
    }
  });
  dlg.body.append(
    h("p", {}, `${plural(opts.count)} will become Ungrouped.`),
    h("p", {}, h("strong", {}, "Repositories themselves will NOT be deleted."), " Only the folder topic is removed from each repository; every other topic stays."),
    h("div", { className: "gtf-dialog-foot" }, h("span", { className: "gtf-spacer" }), h("button", { className: "gtf-btn", type: "button", onClick: () => dlg.close() }, "Cancel"), btn),
    error,
  );
}
