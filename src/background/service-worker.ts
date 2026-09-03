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
import { planTopicWrite } from "../core/writePlan.ts";
import type { ApiErrorInfo } from "../core/types.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
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

/**
 * The one write path (Plan.md §3.4): fresh GET -> plan (keeps every non-folder topic) -> journal -> PUT -> patch cache.
 * Archived repositories are refused up front (GitHub would answer 403 anyway).
 */
async function setProject(owner: string, repo: string, project: string | null): Promise<MsgResponse<SetProjectResult>> {
  const prefs = await storage.getPrefs();
  const cached = (await storage.getRepoCache(owner))?.repos.find((r) => r.name.toLowerCase() === repo.toLowerCase());
  if (cached?.archived) return fail({ kind: "validation", status: 0, message: `${repo} is archived (read-only on GitHub). Unarchive it first.` });

  const current = await api.getTopics(owner, repo);
  const plan = planTopicWrite(current, project, prefs.prefix);
  if (plan.kind === "error") return fail({ kind: "validation", status: 0, message: plan.message });
  if (plan.kind === "unchanged") return ok({ changed: false, before: plan.topics, after: plan.topics, dryRun: prefs.dryRun });

  await storage.appendJournal({ ts: Date.now(), owner, repo, before: plan.before, after: plan.after, dryRun: prefs.dryRun });
  if (prefs.dryRun) return ok({ changed: true, before: plan.before, after: plan.after, dryRun: true });

  const written = await api.putTopics(owner, repo, plan.after);
  await storage.patchCachedTopics(owner, repo, written);
  return ok({ changed: true, before: plan.before, after: written, dryRun: false });
}

const WRITE_SPACING_MS = 1000; // GitHub: wait at least one second between mutative requests, never in parallel

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== BULK_PORT || port.sender?.id !== chrome.runtime.id) return;
  port.onMessage.addListener(async (message: BulkRequest) => {
    if (message.type !== "bulk.setProject") return;
    const post = (e: BulkEvent) => {
      try {
        port.postMessage(e);
      } catch {
        /* page went away */
      }
    };
    const succeeded: Array<{ repo: string; result: SetProjectResult }> = [];
    const failed: Array<{ repo: string; error: ApiErrorInfo }> = [];
    const total = message.items.length;
    for (let i = 0; i < total; i++) {
      const item = message.items[i]!;
      post({ type: "progress", done: i, total, current: item.repo });
      try {
        const res = await setProject(item.owner, item.repo, item.project);
        if (res.ok) succeeded.push({ repo: item.repo, result: res.data });
        else failed.push({ repo: item.repo, error: res.error });
      } catch (e) {
        failed.push({ repo: item.repo, error: toErrorInfo(e) });
      }
      if (i < total - 1) await new Promise((r) => setTimeout(r, WRITE_SPACING_MS));
    }
    post({ type: "progress", done: total, total, current: "" });
    post({ type: "result", succeeded, failed });
  });
});

async function handle(req: Request): Promise<MsgResponse<unknown>> {
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
      return listRepos(req.owner, req.force === true);
    case "repos.setProject":
      return setProject(req.owner, req.repo, req.project);
    case "journal.list":
      return ok(await storage.listJournal());
    case "prefs.get":
      return ok(await storage.getPrefs());
    case "prefs.set":
      if (req.patch.prefix !== undefined && !isValidPrefix(req.patch.prefix)) {
        return fail({ kind: "validation", status: 0, message: `Prefix must be lowercase letters, numbers and hyphens, end with a hyphen, and be at most ${PREFIX_MAX_LENGTH} characters (e.g. "topic-folders-").` });
      }
      return ok(await storage.setPrefs(req.patch));
    default:
      return fail({ kind: "other", status: 0, message: `Unknown message type: ${String((req as { type?: unknown }).type)}` });
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false; // only our own content scripts / pages
  handle(message as Request).then(sendResponse, (e: unknown) => sendResponse(fail(toErrorInfo(e))));
  return true; // async response
});
