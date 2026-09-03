import type { ApiErrorInfo, RepoSummary } from "./types.ts";
import { DEFAULT_PREFIX } from "./topic.ts";

export type ViewMode = "grouped" | "original";
/** UI preferences. Never classification data (that lives only in GitHub topics, Plan.md §3.1 / §23). */
export type Prefs = {
  viewMode: ViewMode;
  /** Folder-topic prefix, e.g. "topic-folders-". Per browser; the topics themselves stay on GitHub. */
  prefix: string;
  /** group key (project topic, or "__ungrouped") -> collapsed */
  collapsed: Record<string, boolean>;
  privacyNoticeDismissed: boolean;
};
export const DEFAULT_PREFS: Prefs = { viewMode: "grouped", prefix: DEFAULT_PREFIX, collapsed: {}, privacyNoticeDismissed: false };
export const UNGROUPED_KEY = "__ungrouped";

/** Content script / options page -> service worker. The token never travels in these messages except `auth.setToken` from the options page. */
export type Request =
  | { type: "ping" }
  | { type: "auth.status" }
  | { type: "auth.setToken"; token: string }
  | { type: "auth.clear" }
  | { type: "options.open" }
  | { type: "repos.list"; owner: string; force?: boolean }
  | { type: "prefs.get" }
  | { type: "prefs.set"; patch: Partial<Prefs> }
  | { type: "auth.deviceStart" }
  | { type: "auth.devicePoll"; flowId: string }
  | { type: "auth.installations" };

export type AuthKind = "pat" | "github-app";
export type AuthStatus = { configured: boolean; login: string | null; kind: AuthKind | null };

export type DeviceStart = { flowId: string; userCode: string; verificationUri: string; expiresIn: number; interval: number };
export type DevicePoll = { done: false; interval: number } | { done: true; login: string };
export type InstallationsStatus = { installed: boolean; count: number; repositorySelection: string | null; installUrl: string };

export type ReposList = {
  owner: string;
  login: string;
  repos: RepoSummary[];
  fetchedAt: number;
  fromCache: boolean;
};

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; error: ApiErrorInfo };
export type Response<T> = Ok<T> | Fail;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}
export function fail(error: ApiErrorInfo): Fail {
  return { ok: false, error };
}
