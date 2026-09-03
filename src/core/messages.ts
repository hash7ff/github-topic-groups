import type { ApiErrorInfo, RepoSummary } from "./types.ts";

/** Content script / options page -> service worker. The token never travels in these messages except `auth.setToken` from the options page. */
export type Request =
  | { type: "ping" }
  | { type: "auth.status" }
  | { type: "auth.setToken"; token: string }
  | { type: "auth.clear" }
  | { type: "options.open" }
  | { type: "repos.list"; owner: string; force?: boolean };

export type AuthStatus = { configured: boolean; login: string | null };

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
