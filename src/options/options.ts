import type { AuthStatus, Prefs, Request, Response } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLParagraphElement>("result");
const tokenInput = $<HTMLInputElement>("token");
const saveBtn = $<HTMLButtonElement>("save");
const clearBtn = $<HTMLButtonElement>("clear");
const prefixInput = $<HTMLInputElement>("prefix");
const savePrefixBtn = $<HTMLButtonElement>("savePrefix");
const prefixResult = $<HTMLParagraphElement>("prefixResult");

async function send<T>(req: Request): Promise<Response<T>> {
  try {
    return (await chrome.runtime.sendMessage(req)) as Response<T>;
  } catch (e) {
    return { ok: false, error: { kind: "other", status: 0, message: e instanceof Error ? e.message : String(e) } };
  }
}

function describe(error: ApiErrorInfo): string {
  let text = error.message;
  if (error.kind === "forbidden" && error.acceptedPermissions) text += ` Required permission: ${error.acceptedPermissions}.`;
  if (error.kind === "network") text += " Check your connection.";
  return text;
}

function showResult(kind: "ok" | "error", text: string): void {
  resultEl.hidden = false;
  resultEl.className = `result ${kind}`;
  resultEl.textContent = text;
}

function showStatus(status: AuthStatus): void {
  statusEl.textContent = status.configured ? `Token saved. Connected to GitHub as ${status.login ?? "?"}.` : "No token saved yet.";
}

async function refresh(): Promise<void> {
  const res = await send<AuthStatus>({ type: "auth.status" });
  if (res.ok) showStatus(res.data);
  else statusEl.textContent = `Token saved, but GitHub rejected it: ${describe(res.error)}`;
}

saveBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    showResult("error", "Paste a token first.");
    return;
  }
  saveBtn.disabled = true;
  try {
    const res = await send<AuthStatus>({ type: "auth.setToken", token });
    if (res.ok) {
      tokenInput.value = "";
      showResult("ok", `Token verified and saved. Signed in as ${res.data.login ?? "?"}.`);
      showStatus(res.data);
    } else {
      showResult("error", `Token was NOT saved: ${describe(res.error)}`);
    }
  } finally {
    saveBtn.disabled = false;
  }
});

clearBtn.addEventListener("click", async () => {
  const res = await send<AuthStatus>({ type: "auth.clear" });
  if (res.ok) {
    showResult("ok", "Token removed from this browser.");
    showStatus(res.data);
  } else {
    showResult("error", describe(res.error));
  }
});

async function loadPrefs(): Promise<void> {
  const res = await send<Prefs>({ type: "prefs.get" });
  if (res.ok) prefixInput.value = res.data.prefix;
}

savePrefixBtn.addEventListener("click", async () => {
  const prefix = prefixInput.value.trim();
  const res = await send<Prefs>({ type: "prefs.set", patch: { prefix } });
  prefixResult.hidden = false;
  if (res.ok) {
    prefixInput.value = res.data.prefix;
    prefixResult.className = "result ok";
    prefixResult.textContent = `Prefix saved: ${res.data.prefix}  Reload the GitHub repositories page to apply.`;
  } else {
    prefixResult.className = "result error";
    prefixResult.textContent = describe(res.error);
  }
});

void refresh();
void loadPrefs();
