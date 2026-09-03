// Hands the API layer a valid access token, refreshing GitHub App tokens transparently. Single in-flight refresh.
import { canRefresh, needsRefresh, toAuthRecord, type AuthRecord, type TokenResponse } from "../core/auth.ts";
import { GitHubApiError } from "./github-api.ts";

export type TokenManagerDeps = {
  getAuth: () => Promise<AuthRecord | null>;
  setAuth: (record: AuthRecord) => Promise<void>;
  clearAuth: () => Promise<void>;
  refresh: (refreshToken: string) => Promise<TokenResponse>;
  now?: () => number;
};

export function createTokenManager(deps: TokenManagerDeps): { getAccessToken(): Promise<string | null> } {
  const now = deps.now ?? (() => Date.now());
  let inFlight: Promise<string> | null = null;

  async function refreshNow(record: AuthRecord & { kind: "github-app" }): Promise<string> {
    if (!canRefresh(record, now())) {
      await deps.clearAuth();
      throw new GitHubApiError({ kind: "unauthorized", status: 0, message: "Your GitHub session expired. Sign in again." });
    }
    try {
      const token = await deps.refresh(record.refreshToken as string);
      const next = toAuthRecord(token, now());
      await deps.setAuth(next);
      return next.accessToken;
    } catch (e) {
      await deps.clearAuth();
      throw e;
    }
  }

  return {
    async getAccessToken() {
      const record = await deps.getAuth();
      if (!record) return null;
      if (!needsRefresh(record, now())) return record.accessToken;
      if (record.kind !== "github-app") return record.accessToken;
      inFlight ??= refreshNow(record).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
