import test from "node:test";
import assert from "node:assert/strict";
import { createTokenManager } from "./token-manager.ts";
import type { AuthRecord } from "../core/auth.ts";

function harness(initial: AuthRecord | null, now: number) {
  let record = initial;
  let refreshCalls = 0;
  const tm = createTokenManager({
    getAuth: async () => record,
    setAuth: async (r) => void (record = r),
    clearAuth: async () => void (record = null),
    refresh: async () => {
      refreshCalls++;
      return { access_token: `new${refreshCalls}`, expires_in: 28800, refresh_token: "r2", refresh_token_expires_in: 15897600 };
    },
    now: () => now,
  });
  return { tm, get record() { return record; }, get refreshCalls() { return refreshCalls; } };
}

test("PAT is returned as-is; missing auth yields null", async () => {
  assert.equal(await harness({ kind: "pat", accessToken: "p" }, 0).tm.getAccessToken(), "p");
  assert.equal(await harness(null, 0).tm.getAccessToken(), null);
});

test("expiring GitHub App token is refreshed once even under concurrent calls", async () => {
  const now = 10_000_000;
  const h = harness({ kind: "github-app", accessToken: "old", refreshToken: "r1", expiresAt: now + 10_000, refreshExpiresAt: now + 1e9 }, now);
  const [a, b] = await Promise.all([h.tm.getAccessToken(), h.tm.getAccessToken()]);
  assert.equal(a, "new1");
  assert.equal(b, "new1");
  assert.equal(h.refreshCalls, 1);
  assert.equal(h.record?.kind === "github-app" && h.record.refreshToken, "r2");
});

test("expired refresh token clears auth and asks to sign in again", async () => {
  const now = 10_000_000;
  const h = harness({ kind: "github-app", accessToken: "old", refreshToken: "r1", expiresAt: now - 1, refreshExpiresAt: now - 1 }, now);
  await assert.rejects(h.tm.getAccessToken(), /Sign in again/);
  assert.equal(h.record, null);
});
