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
