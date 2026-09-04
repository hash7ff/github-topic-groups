import type { AuthStatus, DevicePoll, DeviceStart, InstallationsStatus, Prefs, Request, Response } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const statusEl = $<HTMLParagraphElement>("status");
const resultEl = $<HTMLParagraphElement>("result");
const signedOut = $<HTMLDivElement>("signedOut");
const signedIn = $<HTMLDivElement>("signedIn");
const flowEl = $<HTMLDivElement>("flow");
const userCodeEl = $<HTMLElement>("userCode");
const openGitHub = $<HTMLAnchorElement>("openGitHub");
const flowStatus = $<HTMLParagraphElement>("flowStatus");
const installStatus = $<HTMLParagraphElement>("installStatus");
const installHint = $<HTMLDivElement>("installHint");
const installLink = $<HTMLAnchorElement>("installLink");
const tokenInput = $<HTMLInputElement>("token");
const tokenResult = $<HTMLParagraphElement>("tokenResult");
const prefixInput = $<HTMLInputElement>("prefix");
const prefixResult = $<HTMLParagraphElement>("prefixResult");
const dryRunInput = $<HTMLInputElement>("dryRun");
const dryRunResult = $<HTMLParagraphElement>("dryRunResult");

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

function show(el: HTMLElement, kind: "ok" | "error", text: string): void {
  el.hidden = false;
  el.className = `result ${kind}`;
  el.textContent = text;
}

// ---- account state ----
let activeFlow: { flowId: string; timer: number | undefined; cancelled: boolean } | null = null;

function render(status: AuthStatus | null, error?: ApiErrorInfo): void {
  const inFlow = activeFlow !== null;
  signedOut.hidden = inFlow || (status?.configured ?? false);
  signedIn.hidden = inFlow || !(status?.configured ?? false);
  flowEl.hidden = !inFlow;
  if (error) statusEl.textContent = `Signed in, but GitHub rejected the credential: ${describe(error)}`;
  else if (!status || !status.configured) statusEl.textContent = "Not signed in.";
  else statusEl.textContent = `Signed in as ${status.login ?? "?"} ${status.kind === "github-app" ? "via the Topic Groups GitHub App." : "with a personal access token."}`;
}

async function refreshInstallations(): Promise<void> {
  const res = await send<InstallationsStatus>({ type: "auth.installations" });
  if (!res.ok) {
    installStatus.textContent = "";
    installHint.hidden = true;
    return;
  }
  installLink.href = res.data.installUrl;
  if (res.data.installed) {
    installHint.hidden = true;
    installStatus.textContent =
      res.data.count === 0
        ? "" // PAT: installations do not apply
        : `App installed (${res.data.count} account${res.data.count === 1 ? "" : "s"}, repositories: ${res.data.repositorySelection ?? "?"}).`;
  } else {
    installStatus.textContent = "";
    installHint.hidden = false;
  }
}

async function refresh(): Promise<void> {
  const res = await send<AuthStatus>({ type: "auth.status" });
  if (res.ok) {
    render(res.data);
    if (res.data.configured) await refreshInstallations();
  } else {
    render({ configured: true, login: null, kind: null }, res.error);
  }
}

// ---- device flow (the page owns the timing; the worker does one poll per message) ----
function stopFlow(): void {
  if (activeFlow?.timer !== undefined) clearTimeout(activeFlow.timer);
  if (activeFlow) activeFlow.cancelled = true;
  activeFlow = null;
}

async function pollLoop(flowId: string, interval: number): Promise<void> {
  const flow = activeFlow;
  if (!flow || flow.flowId !== flowId || flow.cancelled) return;
  const res = await send<DevicePoll>({ type: "auth.devicePoll", flowId });
  if (!activeFlow || activeFlow.flowId !== flowId || activeFlow.cancelled) return;
  if (!res.ok) {
    stopFlow();
    show(resultEl, "error", `Sign-in failed: ${describe(res.error)}`);
    await refresh();
    return;
  }
  if (res.data.done) {
    stopFlow();
    show(resultEl, "ok", `Signed in as ${res.data.login}.`);
    await refresh();
    return;
  }
  activeFlow.timer = window.setTimeout(() => void pollLoop(flowId, res.data.done ? interval : res.data.interval), (res.data.done ? interval : res.data.interval) * 1000);
}

$<HTMLButtonElement>("signIn").addEventListener("click", async () => {
  resultEl.hidden = true;
  const res = await send<DeviceStart>({ type: "auth.deviceStart" });
  if (!res.ok) {
    show(resultEl, "error", `Could not start sign-in: ${describe(res.error)}`);
    return;
  }
  activeFlow = { flowId: res.data.flowId, timer: undefined, cancelled: false };
  userCodeEl.textContent = res.data.userCode;
  openGitHub.href = res.data.verificationUri;
  flowStatus.textContent = `Waiting for you to approve on GitHub… (code valid for ${Math.round(res.data.expiresIn / 60)} minutes)`;
  render(null);
  activeFlow.timer = window.setTimeout(() => void pollLoop(res.data.flowId, res.data.interval), res.data.interval * 1000);
});

$<HTMLButtonElement>("copyCode").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(userCodeEl.textContent ?? "");
    flowStatus.textContent = "Code copied. Paste it on GitHub and approve.";
  } catch {
    flowStatus.textContent = "Select the code and copy it manually.";
  }
});

$<HTMLButtonElement>("cancelFlow").addEventListener("click", async () => {
  stopFlow();
  await refresh();
});

$<HTMLButtonElement>("signOut").addEventListener("click", async () => {
  const res = await send<AuthStatus>({ type: "auth.clear" });
  if (res.ok) show(resultEl, "ok", "Signed out. The credential was removed from this browser.");
  else show(resultEl, "error", describe(res.error));
  await refresh();
});

$<HTMLButtonElement>("recheck").addEventListener("click", () => void refreshInstallations());

// ---- advanced: PAT fallback ----
$<HTMLButtonElement>("save").addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) return show(tokenResult, "error", "Paste a token first.");
  const res = await send<AuthStatus>({ type: "auth.setToken", token });
  if (res.ok) {
    tokenInput.value = "";
    show(tokenResult, "ok", `Token verified and saved. Signed in as ${res.data.login ?? "?"}.`);
  } else {
    show(tokenResult, "error", `Token was NOT saved: ${describe(res.error)}`);
  }
  await refresh();
});

// ---- advanced: prefix ----
async function loadPrefs(): Promise<void> {
  const res = await send<Prefs>({ type: "prefs.get" });
  if (res.ok) {
    prefixInput.value = res.data.prefix;
    dryRunInput.checked = res.data.dryRun;
  }
}
dryRunInput.addEventListener("change", async () => {
  const res = await send<Prefs>({ type: "prefs.set", patch: { dryRun: dryRunInput.checked } });
  if (res.ok) show(dryRunResult, "ok", res.data.dryRun ? "Dry run ON: nothing will be written to GitHub." : "Dry run OFF: changes are written to GitHub.");
  else show(dryRunResult, "error", describe(res.error));
});
$<HTMLButtonElement>("savePrefix").addEventListener("click", async () => {
  const res = await send<Prefs>({ type: "prefs.set", patch: { prefix: prefixInput.value.trim() } });
  if (res.ok) {
    prefixInput.value = res.data.prefix;
    show(prefixResult, "ok", `Prefix saved: ${res.data.prefix}  Reload the GitHub repositories page to apply.`);
  } else {
    show(prefixResult, "error", describe(res.error));
  }
});

void refresh();
void loadPrefs();
