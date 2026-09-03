// Service worker: the only place that holds the GitHub token or talks to api.github.com.
// Holds no in-memory state (MV3 workers are stopped at any time); everything lives in chrome.storage.
import { createGitHubApi, GitHubApiError } from "./github-api.ts";
import * as storage from "./storage.ts";
import { fail, ok, type AuthStatus, type ReposList, type Request, type Response as MsgResponse } from "../core/messages.ts";
import type { ApiErrorInfo } from "../core/types.ts";
import { isValidPrefix, PREFIX_MAX_LENGTH } from "../core/topic.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
const api = createGitHubApi({ getToken: storage.getToken });

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
  const token = await storage.getToken();
  if (!token) return ok({ configured: false, login: null });
  return ok({ configured: true, login: await resolveLogin() });
}

async function setToken(rawToken: string): Promise<MsgResponse<AuthStatus>> {
  const token = rawToken.trim();
  if (!token) return fail({ kind: "validation", status: 0, message: "Token is empty." });
  // Validate BEFORE saving so a bad token never replaces a working one.
  const probe = createGitHubApi({ getToken: async () => token });
  const { login } = await probe.whoami();
  await storage.setToken(token);
  await storage.clearSession();
  await storage.setLogin(login);
  return ok({ configured: true, login });
}

async function listRepos(owner: string, force: boolean): Promise<MsgResponse<ReposList>> {
  const login = await resolveLogin();
  if (owner.toLowerCase() !== login.toLowerCase()) {
    return fail({
      kind: "unsupported",
      status: 0,
      message: `This version only groups your own repositories (the token belongs to ${login}, this page shows ${owner}).`,
    });
  }
  const cache = await storage.getRepoCache(owner);
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return ok({ owner, login, repos: cache.repos, fetchedAt: cache.fetchedAt, fromCache: true });
  }
  const repos = await api.listOwnRepos();
  const fetchedAt = Date.now();
  await storage.setRepoCache(owner, { repos, fetchedAt });
  return ok({ owner, login, repos, fetchedAt, fromCache: false });
}

async function handle(req: Request): Promise<MsgResponse<unknown>> {
  switch (req.type) {
    case "ping":
      return ok({ at: Date.now() });
    case "auth.status":
      return authStatus();
    case "auth.setToken":
      return setToken(req.token);
    case "auth.clear":
      await storage.clearToken();
      return ok({ configured: false, login: null } satisfies AuthStatus);
    case "options.open":
      await chrome.runtime.openOptionsPage();
      return ok(null);
    case "repos.list":
      return listRepos(req.owner, req.force === true);
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
