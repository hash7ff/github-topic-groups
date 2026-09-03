// Thin adapter over chrome.storage. The token lives ONLY here (local) and is read ONLY by the service worker.
import type { RepoSummary } from "../core/types.ts";
import type { AuthRecord } from "../core/auth.ts";

const AUTH_KEY = "gtf.auth";
const LEGACY_TOKEN_KEY = "gtf.token"; // pre-M4.5 installs stored a bare PAT here
const LOGIN_KEY = "gtf.login";
const FLOW_KEY = "gtf.deviceflow";
const repoCacheKey = (owner: string): string => `gtf.cache.repos.${owner.toLowerCase()}`;

export type RepoCache = { repos: RepoSummary[]; fetchedAt: number };
export type DeviceFlowState = { flowId: string; deviceCode: string; interval: number; expiresAt: number };

export async function getAuth(): Promise<AuthRecord | null> {
  const r = await chrome.storage.local.get([AUTH_KEY, LEGACY_TOKEN_KEY]);
  const a = r[AUTH_KEY] as AuthRecord | undefined;
  if (a && typeof a.accessToken === "string" && a.accessToken.length > 0 && (a.kind === "pat" || a.kind === "github-app")) return a;
  const legacy = r[LEGACY_TOKEN_KEY];
  if (typeof legacy === "string" && legacy.length > 0) {
    const migrated: AuthRecord = { kind: "pat", accessToken: legacy };
    await chrome.storage.local.set({ [AUTH_KEY]: migrated });
    await chrome.storage.local.remove(LEGACY_TOKEN_KEY);
    return migrated;
  }
  return null;
}
export async function setAuth(record: AuthRecord): Promise<void> {
  await chrome.storage.local.set({ [AUTH_KEY]: record });
  await chrome.storage.local.remove(LEGACY_TOKEN_KEY);
}
export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([AUTH_KEY, LEGACY_TOKEN_KEY]);
  await clearSession();
}

export async function getDeviceFlow(): Promise<DeviceFlowState | null> {
  const r = await chrome.storage.session.get(FLOW_KEY);
  const v = r[FLOW_KEY] as DeviceFlowState | undefined;
  return v && typeof v.deviceCode === "string" ? v : null;
}
export async function setDeviceFlow(state: DeviceFlowState | null): Promise<void> {
  if (state) await chrome.storage.session.set({ [FLOW_KEY]: state });
  else await chrome.storage.session.remove(FLOW_KEY);
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
