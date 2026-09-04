// Thin adapter over chrome.storage. The token lives ONLY here (local) and is read ONLY by the service worker.
import type { RepoSummary } from "../core/types.ts";
import type { AuthRecord } from "../core/auth.ts";

const AUTH_KEY = "gtf.auth";
const LEGACY_TOKEN_KEY = "gtf.token"; // pre-M4.5 installs stored a bare PAT here
const LOGIN_KEY = "gtf.login";
const FLOW_KEY = "gtf.deviceflow";
const ACCOUNTS_KEY = "gtf.installedAccounts";
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

export async function getInstalledAccounts(): Promise<string[] | null> {
  const r = await chrome.storage.session.get(ACCOUNTS_KEY);
  const v = r[ACCOUNTS_KEY];
  return Array.isArray(v) ? (v as string[]) : null;
}
export async function setInstalledAccounts(accounts: string[]): Promise<void> {
  await chrome.storage.session.set({ [ACCOUNTS_KEY]: accounts });
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
    dryRun: v.dryRun === true,
    collapsed: typeof v.collapsed === "object" && v.collapsed !== null ? v.collapsed : {},
    privacyNoticeDismissed: v.privacyNoticeDismissed === true,
  };
}
export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next: Prefs = { ...DEFAULT_PREFS, ...(await getPrefs()), ...patch };
  await chrome.storage.local.set({ [PREFS_KEY]: next });
  return next;
}

// ---- write journal: what we were about to write, kept for manual recovery (Plan.md §3.4) ----
import type { JournalEntry } from "../core/messages.ts";
const JOURNAL_KEY = "gtf.journal";
const JOURNAL_MAX = 200;

export async function appendJournal(entry: JournalEntry): Promise<void> {
  const r = await chrome.storage.local.get(JOURNAL_KEY);
  const list = Array.isArray(r[JOURNAL_KEY]) ? (r[JOURNAL_KEY] as JournalEntry[]) : [];
  list.push(entry);
  await chrome.storage.local.set({ [JOURNAL_KEY]: list.slice(-JOURNAL_MAX) });
}
export async function listJournal(): Promise<JournalEntry[]> {
  const r = await chrome.storage.local.get(JOURNAL_KEY);
  return Array.isArray(r[JOURNAL_KEY]) ? (r[JOURNAL_KEY] as JournalEntry[]) : [];
}

/** Patch one repository's topics inside every cached list (after a successful PUT). */
export async function patchCachedTopics(owner: string, repo: string, topics: string[]): Promise<void> {
  const key = repoCacheKey(owner);
  const r = await chrome.storage.session.get(key);
  const cache = r[key] as RepoCache | undefined;
  if (!cache) return;
  const repos = cache.repos.map((x) => (x.name.toLowerCase() === repo.toLowerCase() ? { ...x, topics } : x));
  await chrome.storage.session.set({ [key]: { ...cache, repos } });
}
