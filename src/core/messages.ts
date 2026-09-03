import type { ApiErrorInfo, RepoSummary } from "./types.ts";
import { DEFAULT_PREFIX } from "./topic.ts";

export type ViewMode = "grouped" | "original";
/** UI preferences. Never classification data (that lives only in GitHub topics, Plan.md §3.1 / §23). */
export type Prefs = {
  viewMode: ViewMode;
  /** Folder-topic prefix, e.g. "topic-folders-". Per browser; the topics themselves stay on GitHub. */
  prefix: string;
  /** Developer safety switch: plan and journal writes but never PUT. */
  dryRun: boolean;
  /** group key (project topic, or "__ungrouped") -> collapsed */
  collapsed: Record<string, boolean>;
  privacyNoticeDismissed: boolean;
};
export const DEFAULT_PREFS: Prefs = { viewMode: "grouped", prefix: DEFAULT_PREFIX, dryRun: false, collapsed: {}, privacyNoticeDismissed: false };
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
  | { type: "auth.installations" }
  | { type: "repos.setProject"; owner: string; repo: string; project: string | null; expect?: string[] | null }
  | { type: "journal.list" };

/** One topic write (or dry run) as recorded before the PUT. */
export type JournalEntry = { ts: number; owner: string; repo: string; before: string[]; after: string[]; dryRun: boolean };
export type SetProjectResult = { changed: boolean; before: string[]; after: string[]; dryRun: boolean };

/** Long-running bulk writes go over a Port named BULK_PORT: page sends BulkRequest, worker streams BulkEvent. */
export const BULK_PORT = "gtf-bulk";
/** `expect`: the folder topics the UI believed the repository had; the worker aborts that repository if GitHub differs. null = no check. */
export type BulkItem = { owner: string; repo: string; project: string | null; expect: string[] | null };
export type BulkRequest = { type: "bulk.setProject"; items: BulkItem[] };
export type BulkEvent =
  | { type: "progress"; done: number; total: number; current: string }
  | { type: "result"; succeeded: Array<{ repo: string; result: SetProjectResult }>; failed: Array<{ repo: string; error: ApiErrorInfo }> };

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
