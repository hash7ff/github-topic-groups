import { h } from "./h.ts";
import { openDialog } from "./dialog.ts";
import { displayNameFromTopic } from "../../core/topic.ts";

/** Plan.md §25: a repository with several group topics is never auto-resolved; the user picks the one to keep. */
export function openFixDialog(opts: { repoName: string; topics: readonly string[]; prefix: string; onFix(keep: string): Promise<void> }): void {
  const dlg = openDialog(`Fix ${opts.repoName}`);
  const error = h("p", { className: "gtf-error", hidden: true });
  const list = h("div", { className: "gtf-menu" });
  for (const t of opts.topics) {
    const btn = h("button", { className: "gtf-menu-item", type: "button" }, h("span", { className: "gtf-menu-item-label" }, displayNameFromTopic(t, opts.prefix)), h("span", { className: "gtf-menu-item-meta" }, t));
    btn.addEventListener("click", async () => {
      for (const b of list.querySelectorAll("button")) b.disabled = true;
      try {
        await opts.onFix(t);
        dlg.close();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
        error.hidden = false;
        for (const b of list.querySelectorAll("button")) b.disabled = false;
      }
    });
    list.append(btn);
  }
  dlg.body.append(
    h("p", {}, `This repository has ${opts.topics.length} group topics. Choose the group to keep; the other group topics are removed. All other topics stay.`),
    list,
    error,
  );
}
