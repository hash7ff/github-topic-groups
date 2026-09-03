// Thin adapter over chrome.storage. The token lives ONLY here (local) and is read ONLY by the service worker.
import type { RepoSummary } from "../core/types.ts";

const TOKEN_KEY = "gtf.token";
const LOGIN_KEY = "gtf.login";
const repoCacheKey = (owner: string): string => `gtf.cache.repos.${owner.toLowerCase()}`;

export type RepoCache = { repos: RepoSummary[]; fetchedAt: number };

export async function getToken(): Promise<string | null> {
  const r = await chrome.storage.local.get(TOKEN_KEY);
  const v = r[TOKEN_KEY];
  return typeof v === "string" && v.length > 0 ? v : null;
}
export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}
export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
  await clearSession();
}

export async function getLogin(): Promise<string | null> {
  const r = await chrome.storage.session.get(LOGIN_KEY);
  const v = r[LOGIN_KEY];
  return typeof v === "string" && v.length > 0 ? v : null;
}
export async function setLogin(login: string): Promise<void> {
  await chrome.storage.session.set({ [LOGIN_KEY]: login });
}

export async function getRepoCache(owner: string): Promise<RepoCache | null> {
  const key = repoCacheKey(owner);
  const r = await chrome.storage.session.get(key);
  const v = r[key] as RepoCache | undefined;
  return v && Array.isArray(v.repos) && typeof v.fetchedAt === "number" ? v : null;
}
export async function setRepoCache(owner: string, cache: RepoCache): Promise<void> {
  await chrome.storage.session.set({ [repoCacheKey(owner)]: cache });
}
export async function clearSession(): Promise<void> {
  await chrome.storage.session.clear();
}

// ---- UI preferences (not secrets, not classification data) ----
import { DEFAULT_PREFS, type Prefs } from "../core/messages.ts";
import { DEFAULT_PREFIX, isValidPrefix } from "../core/topic.ts";
const PREFS_KEY = "gtf.prefs";

export async function getPrefs(): Promise<Prefs> {
  const r = await chrome.storage.local.get(PREFS_KEY);
  const v = (r[PREFS_KEY] ?? {}) as Partial<Prefs>;
  return {
    viewMode: v.viewMode === "original" ? "original" : "grouped",
    prefix: typeof v.prefix === "string" && isValidPrefix(v.prefix) ? v.prefix : DEFAULT_PREFIX,
    collapsed: typeof v.collapsed === "object" && v.collapsed !== null ? v.collapsed : {},
    privacyNoticeDismissed: v.privacyNoticeDismissed === true,
  };
}
export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next: Prefs = { ...DEFAULT_PREFS, ...(await getPrefs()), ...patch };
  await chrome.storage.local.set({ [PREFS_KEY]: next });
  return next;
}
