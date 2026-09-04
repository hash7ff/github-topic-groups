import { h } from "./h.ts";
import { openDialog } from "./dialog.ts";

export type MoveTarget = { topic: string; name: string; count: number };

export function openMoveDialog(opts: {
  repoName: string;
  currentTopic: string | null;
  groups: MoveTarget[];
  onSelect(group: string | null): void;
  onNewGroup(): void;
}): void {
  const dlg = openDialog(`Move ${opts.repoName} to…`);
  const item = (label: string, meta: string | null, current: boolean, onClick: () => void) =>
    h(
      "button",
      { className: `gtf-menu-item ${current ? "gtf-menu-item-current" : ""}`.trim(), type: "button", disabled: current, onClick },
      h("span", { className: "gtf-menu-item-label" }, label),
      current ? h("span", { className: "gtf-menu-item-meta" }, "current") : meta ? h("span", { className: "gtf-menu-item-meta" }, meta) : null,
    );
  const list = h("div", { className: "gtf-menu" });
  for (const p of opts.groups) {
    list.append(
      item(p.name, `${p.count}`, p.topic === opts.currentTopic, () => {
        dlg.close();
        opts.onSelect(p.topic);
      }),
    );
  }
  list.append(
    item("Ungrouped", "remove group topic", opts.currentTopic === null, () => {
      dlg.close();
      opts.onSelect(null);
    }),
  );
  list.append(h("hr", { className: "gtf-menu-sep" }));
  list.append(
    item("New group…", null, false, () => {
      dlg.close();
      opts.onNewGroup();
    }),
  );
  dlg.body.append(list);
}
