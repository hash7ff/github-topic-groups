// Service worker: the only place that holds GitHub credentials or talks to GitHub.
// Holds no in-memory state (MV3 workers are stopped at any time); everything lives in chrome.storage.
import { createGitHubApi, GitHubApiError } from "./github-api.ts";
import { pollDeviceToken, refreshAccessToken, requestDeviceCode } from "./device-flow.ts";
import { createTokenManager } from "./token-manager.ts";
import * as storage from "./storage.ts";
import { toAuthRecord } from "../core/auth.ts";
import { GITHUB_APP_CLIENT_ID, GITHUB_APP_INSTALL_URL, GITHUB_APP_SLUG } from "../core/config.ts";
import { isValidPrefix, PREFIX_MAX_LENGTH } from "../core/topic.ts";
import { BULK_PORT, fail, ok, type AuthStatus, type BulkEvent, type BulkRequest, type DevicePoll, type DeviceStart, type InstallationsStatus, type ReposList, type Request, type Response as MsgResponse, type SetProjectResult } from "../core/messages.ts";
import { expectationMatches, planTopicWrite } from "../core/writePlan.ts";
import { projectTopics } from "../core/topic.ts";
import type { Prefs } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;

// Credentials live in storage.local; by default Chrome exposes that area to content scripts. Restrict it to
// trusted contexts (service worker + extension pages) so the content script on github.com cannot read tokens.
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {
  /* older Chrome: fall back to the build-time isolation check */
});

// ---- sender trust ----
type SenderKind = "options" | "content" | "unknown";
function classifySender(sender: chrome.runtime.MessageSender): SenderKind {
  if (sender.id !== chrome.runtime.id) return "unknown";
  const url = sender.url ?? "";
  if (url.startsWith(chrome.runtime.getURL("options.html"))) return "options";
  if (sender.tab && /^https:\/\/github\.com\//.test(url)) return "content";
  return "unknown";
}
/** Credential and journal operations are only accepted from the extension's own options page. */
const OPTIONS_ONLY = new Set<Request["type"]>(["auth.setToken", "auth.clear", "auth.deviceStart", "auth.devicePoll", "auth.installations", "journal.list"]);
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const isName = (v: unknown): v is string => typeof v === "string" && NAME_PATTERN.test(v);
const isTopicList = (v: unknown): v is string[] | null => v === null || (Array.isArray(v) && v.every((t) => typeof t === "string" && t.length <= 50));
const deviceFlowDeps = { clientId: GITHUB_APP_CLIENT_ID };
const tokens = createTokenManager({
  getAuth: storage.getAuth,
  setAuth: storage.setAuth,
  clearAuth: storage.clearAuth,
  refresh: (rt) => refreshAccessToken(deviceFlowDeps, rt),
});
const api = createGitHubApi({ getToken: tokens.getAccessToken });

function toErrorInfo(e: unknown): ApiErrorInfo {
  if (e instanceof GitHubApiError) return e.info;
  return { kind: "other", status: 0, message: e instanceof Error ? e.message : String(e) };
}

/** 403/404 on a write under a GitHub App token usually means the app is not installed on that repository. */
async function writeErrorInfo(e: unknown): Promise<ApiErrorInfo> {
  const info = toErrorInfo(e);
  if (info.kind !== "forbidden" && info.kind !== "not_found") return info;
  const auth = await storage.getAuth();
  if (auth?.kind !== "github-app") return info;
  return { ...info, installUrl: GITHUB_APP_INSTALL_URL, message: `${info.message} — the Topic Folders app may not be installed on this repository.` };
}

async function resolveLogin(): Promise<string> {
  const cached = await storage.getLogin();
  if (cached) return cached;
  const { login } = await api.whoami();
  await storage.setLogin(login);
  return login;
}

async function authStatus(): Promise<MsgResponse<AuthStatus>> {
  const auth = await storage.getAuth();
  if (!auth) return ok({ configured: false, login: null, kind: null });
  return ok({ configured: true, login: await resolveLogin(), kind: auth.kind });
}

/** Advanced fallback: a personal access token. Validated BEFORE saving so a bad token never replaces a working session. */
async function setPat(rawToken: string): Promise<MsgResponse<AuthStatus>> {
  const token = rawToken.trim();
  if (!token) return fail({ kind: "validation", status: 0, message: "Token is empty." });
  const probe = createGitHubApi({ getToken: async () => token });
  const { login } = await probe.whoami();
  await storage.setAuth({ kind: "pat", accessToken: token });
  await storage.clearSession();
  await storage.setLogin(login);
  return ok({ configured: true, login, kind: "pat" });
}

async function deviceStart(): Promise<MsgResponse<DeviceStart>> {
  const code = await requestDeviceCode(deviceFlowDeps);
  const flowId = crypto.randomUUID();
  await storage.setDeviceFlow({ flowId, deviceCode: code.deviceCode, interval: code.interval, expiresAt: Date.now() + code.expiresIn * 1000 });
  // The device code stays in the worker; the page only gets what the user must see.
  return ok({ flowId, userCode: code.userCode, verificationUri: code.verificationUri, expiresIn: code.expiresIn, interval: code.interval });
}

async function devicePoll(flowId: string): Promise<MsgResponse<DevicePoll>> {
  const flow = await storage.getDeviceFlow();
  if (!flow || flow.flowId !== flowId) return fail({ kind: "other", status: 0, message: "This sign-in attempt is no longer active. Start again." });
  if (Date.now() > flow.expiresAt) {
    await storage.setDeviceFlow(null);
    return fail({ kind: "other", status: 0, message: "The code expired before it was entered. Start again." });
  }
  const result = await pollDeviceToken(deviceFlowDeps, flow.deviceCode, flow.interval);
  if (result.kind === "pending") {
    if (result.interval !== flow.interval) await storage.setDeviceFlow({ ...flow, interval: result.interval });
    return ok({ done: false, interval: result.interval });
  }
  await storage.setDeviceFlow(null);
  if (result.kind === "error") return fail({ kind: result.code === "access_denied" ? "unauthorized" : "other", status: 0, message: result.message });
  await storage.setAuth(toAuthRecord(result.token, Date.now()));
  await storage.clearSession();
  const { login } = await api.whoami();
  await storage.setLogin(login);
  return ok({ done: true, login });
}

async function installations(): Promise<MsgResponse<InstallationsStatus>> {
  const auth = await storage.getAuth();
  if (!auth) return fail({ kind: "unauthorized", status: 0, message: "Not signed in." });
  if (auth.kind === "pat") return ok({ installed: true, count: 0, repositorySelection: null, installUrl: GITHUB_APP_INSTALL_URL });
  const mine = (await api.listInstallations()).filter((i) => i.appSlug === null || i.appSlug === GITHUB_APP_SLUG);
  return ok({ installed: mine.length > 0, count: mine.length, repositorySelection: mine[0]?.repositorySelection ?? null, installUrl: GITHUB_APP_INSTALL_URL });
}

async function listRepos(owner: string, force: boolean): Promise<MsgResponse<ReposList>> {
  const login = await resolveLogin();
  if (owner.toLowerCase() !== login.toLowerCase()) {
    return fail({
      kind: "unsupported",
      status: 0,
      message: `This version only groups your own repositories (signed in as ${login}, this page shows ${owner}).`,
    });
  }
  const cache = await storage.getRepoCache(owner);
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return ok({ owner, login, repos: cache.repos, fetchedAt: cache.fetchedAt, fromCache: true });
  }
  const repos = await api.listOwnRepos();
  if (repos.length === 0) {
    // A GitHub App token only sees repositories the app is installed on: an empty list usually means "not installed yet".
    const auth = await storage.getAuth();
    if (auth?.kind === "github-app") {
      const inst = await installations();
      if (inst.ok && !inst.data.installed) {
        return fail({ kind: "not_installed", status: 0, message: "Topic Folders is not installed on your repositories yet.", installUrl: GITHUB_APP_INSTALL_URL });
      }
    }
  }
  const fetchedAt = Date.now();
  await storage.setRepoCache(owner, { repos, fetchedAt });
  return ok({ owner, login, repos, fetchedAt, fromCache: false });
}

// ---- global write scheduler: every topic write in this worker runs one at a time, >= 1s apart (GitHub guidance) ----
const WRITE_SPACING_MS = 1000;
let writeChain: Promise<unknown> = Promise.resolve();
let lastWriteAt = 0;
function serializedWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const wait = lastWriteAt + WRITE_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastWriteAt = Date.now();
    }
  });
  writeChain = run.catch(() => undefined);
  return run;
}

/**
 * The one write path (Plan.md §3.4): fresh GET -> expectation check -> plan (keeps every non-folder topic) -> journal -> PUT -> patch cache.
 * `expect` is what the UI showed the user; if GitHub changed meanwhile the repository is skipped instead of overwritten.
 * `prefs` is a snapshot taken once per user action so a settings change mid-operation cannot alter later items.
 */
async function setProject(owner: string, repo: string, project: string | null, expect: string[] | null, prefs: Prefs): Promise<MsgResponse<SetProjectResult>> {
  const login = await resolveLogin();
  if (owner.toLowerCase() !== login.toLowerCase()) {
    return fail({ kind: "unsupported", status: 0, message: `This version only changes your own repositories (signed in as ${login}).` });
  }
  const cached = (await storage.getRepoCache(owner))?.repos.find((r) => r.name.toLowerCase() === repo.toLowerCase());
  if (cached?.archived) return fail({ kind: "validation", status: 0, message: `${repo} is archived (read-only on GitHub). Unarchive it first.` });

  return serializedWrite(async () => {
    const current = await api.getTopics(owner, repo);
    await storage.patchCachedTopics(owner, repo, current); // the list now reflects GitHub even if we stop here
    const currentFolder = projectTopics(current, prefs.prefix);
    if (!expectationMatches(currentFolder, expect)) {
      const now = currentFolder.length === 0 ? "Ungrouped" : currentFolder.join(", ");
      return fail({ kind: "stale", status: 0, message: `${repo} changed on GitHub since the list was loaded (now: ${now}). Nothing was written; refresh and try again.` });
    }
    const plan = planTopicWrite(current, project, prefs.prefix);
    if (plan.kind === "error") return fail({ kind: "validation", status: 0, message: plan.message });
    if (plan.kind === "unchanged") return ok({ changed: false, before: plan.topics, after: plan.topics, dryRun: prefs.dryRun });

    await storage.appendJournal({ ts: Date.now(), owner, repo, before: plan.before, after: plan.after, dryRun: prefs.dryRun });
    if (prefs.dryRun) return ok({ changed: true, before: plan.before, after: plan.after, dryRun: true });

    const written = await api.putTopics(owner, repo, plan.after);
    await storage.patchCachedTopics(owner, repo, written);
    return ok({ changed: true, before: plan.before, after: written, dryRun: false });
  });
}

const BULK_MAX_ITEMS = 500;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== BULK_PORT || !port.sender || classifySender(port.sender) === "unknown") return;
  port.onMessage.addListener(async (message: unknown) => {
    const req = message as Partial<BulkRequest>;
    if (req.type !== "bulk.setProject" || !Array.isArray(req.items)) return;
    const post = (e: BulkEvent) => {
      try {
        port.postMessage(e);
      } catch {
        /* page went away */
      }
    };
    const items = req.items.filter((it) => it && isName(it.owner) && isName(it.repo) && (it.project === null || typeof it.project === "string") && isTopicList(it.expect));
    if (items.length !== req.items.length || items.length === 0 || items.length > BULK_MAX_ITEMS) {
      post({ type: "result", succeeded: [], failed: [{ repo: "*", error: { kind: "validation", status: 0, message: "Invalid bulk request." } }] });
      return;
    }
    const prefs = await storage.getPrefs(); // one snapshot for the whole operation
    const succeeded: Array<{ repo: string; result: SetProjectResult }> = [];
    const failed: Array<{ repo: string; error: ApiErrorInfo }> = [];
    const total = items.length;
    let abort: ApiErrorInfo | null = null;
    for (let i = 0; i < total; i++) {
      const item = items[i]!;
      if (abort) {
        failed.push({ repo: item.repo, error: { ...abort, message: `Skipped: ${abort.message}` } });
        continue;
      }
      post({ type: "progress", done: i, total, current: item.repo });
      let error: ApiErrorInfo | null = null;
      try {
        const res = await setProject(item.owner, item.repo, item.project, item.expect, prefs);
        if (res.ok) succeeded.push({ repo: item.repo, result: res.data });
        else error = res.error;
      } catch (e) {
        error = await writeErrorInfo(e);
      }
      if (error) {
        failed.push({ repo: item.repo, error });
        // A rate limit or a dead session will fail every remaining item too: stop instead of hammering GitHub.
        if (error.kind === "rate_limited" || error.kind === "unauthorized") abort = error;
      }
    }
    post({ type: "progress", done: total, total, current: "" });
    post({ type: "result", succeeded, failed });
  });
});

async function handle(req: Request, from: SenderKind): Promise<MsgResponse<unknown>> {
  if (typeof req !== "object" || req === null || typeof (req as { type?: unknown }).type !== "string") {
    return fail({ kind: "validation", status: 0, message: "Malformed message." });
  }
  if (from === "unknown") return fail({ kind: "validation", status: 0, message: "Untrusted sender." });
  if (OPTIONS_ONLY.has(req.type) && from !== "options") return fail({ kind: "validation", status: 0, message: `${req.type} is only available from the settings page.` });
  switch (req.type) {
    case "ping":
      return ok({ at: Date.now() });
    case "auth.status":
      return authStatus();
    case "auth.setToken":
      return setPat(req.token);
    case "auth.clear":
      await storage.clearAuth();
      return ok({ configured: false, login: null, kind: null } satisfies AuthStatus);
    case "auth.deviceStart":
      return deviceStart();
    case "auth.devicePoll":
      return devicePoll(req.flowId);
    case "auth.installations":
      return installations();
    case "options.open":
      await chrome.runtime.openOptionsPage();
      return ok(null);
    case "repos.list":
      if (!isName(req.owner)) return fail({ kind: "validation", status: 0, message: "Invalid owner." });
      return listRepos(req.owner, req.force === true);
    case "repos.setProject":
      if (!isName(req.owner) || !isName(req.repo) || !(req.project === null || typeof req.project === "string") || !isTopicList(req.expect ?? null)) {
        return fail({ kind: "validation", status: 0, message: "Invalid write request." });
      }
      try {
        return await setProject(req.owner, req.repo, req.project, req.expect ?? null, await storage.getPrefs());
      } catch (e) {
        return fail(await writeErrorInfo(e));
      }
    case "journal.list":
      return ok(await storage.listJournal());
    case "prefs.get":
      return ok(await storage.getPrefs());
    case "prefs.set":
      if (typeof req.patch !== "object" || req.patch === null) return fail({ kind: "validation", status: 0, message: "Invalid preferences." });
      if (from !== "options" && (req.patch.prefix !== undefined || req.patch.dryRun !== undefined)) {
        return fail({ kind: "validation", status: 0, message: "The prefix and dry-run settings can only be changed from the settings page." });
      }
      if (req.patch.prefix !== undefined && !isValidPrefix(req.patch.prefix)) {
        return fail({ kind: "validation", status: 0, message: `Prefix must be lowercase letters, numbers and hyphens, end with a hyphen, and be at most ${PREFIX_MAX_LENGTH} characters (e.g. "topic-folders-").` });
      }
      return ok(await storage.setPrefs(req.patch));
    default:
      return fail({ kind: "other", status: 0, message: `Unknown message type: ${String((req as { type?: unknown }).type)}` });
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const from = classifySender(sender);
  if (from === "unknown") return false; // not our extension, or an unexpected context
  handle(message as Request, from).then(sendResponse, (e: unknown) => sendResponse(fail(toErrorInfo(e))));
  return true; // async response
});
