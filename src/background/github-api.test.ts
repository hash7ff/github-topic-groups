import test from "node:test";
import assert from "node:assert/strict";
import { createGitHubApi, GitHubApiError, parseLinkNext, toRepoSummary, type FetchLike } from "./github-api.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

function mockFetch(handler: (call: Call) => Response): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return handler(call);
  };
  return { fetchImpl, calls };
}
const json = (data: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const api = (fetchImpl: FetchLike, token: string | null = "tok_test") => createGitHubApi({ getToken: async () => token, fetchImpl });

test("parseLinkNext extracts rel=next only", () => {
  assert.equal(parseLinkNext('<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=2>; rel="last"'), "https://api.github.com/user/repos?page=2");
  assert.equal(parseLinkNext('<https://api.github.com/user/repos?page=1>; rel="prev"'), null);
  assert.equal(parseLinkNext(null), null);
});

test("requests carry Bearer token, Accept and API version headers; token never appears in URL", async () => {
  const { fetchImpl, calls } = mockFetch(() => json({ login: "mutsuyuki" }));
  const who = await api(fetchImpl).whoami();
  assert.deepEqual(who, { login: "mutsuyuki" });
  assert.equal(calls[0]?.url, "https://api.github.com/user");
  assert.equal(calls[0]?.headers["Authorization"], "Bearer tok_test");
  assert.equal(calls[0]?.headers["Accept"], "application/vnd.github+json");
  assert.equal(calls[0]?.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.ok(!calls[0]?.url.includes("tok_test"));
});

test("without a token nothing is sent", async () => {
  const { fetchImpl, calls } = mockFetch(() => json({}));
  await assert.rejects(api(fetchImpl, null).whoami(), (e: unknown) => e instanceof GitHubApiError && e.info.kind === "unauthorized");
  assert.equal(calls.length, 0);
});

test("listOwnRepos follows Link pagination and maps fields (topics included)", async () => {
  const page = (names: string[], next: string | null) =>
    json(
      names.map((n) => ({ name: n, full_name: `mutsuyuki/${n}`, owner: { login: "mutsuyuki" }, private: true, description: null, language: "Dart", pushed_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", html_url: `https://github.com/mutsuyuki/${n}`, topics: ["group-x", "python"], archived: false, fork: false })),
      200,
      next ? { link: `<${next}>; rel="next"` } : {},
    );
  const { fetchImpl, calls } = mockFetch((c) => (c.url.includes("page=2") ? page(["b"], null) : page(["a"], "https://api.github.com/user/repos?affiliation=owner&per_page=100&page=2")));
  const repos = await api(fetchImpl).listOwnRepos();
  assert.deepEqual(repos.map((r) => r.name), ["a", "b"]);
  assert.deepEqual(repos[0]?.topics, ["group-x", "python"]);
  assert.equal(repos[0]?.language, "Dart");
  assert.equal(calls.length, 2);
  assert.ok(calls[0]?.url.includes("affiliation=owner") && calls[0]?.url.includes("per_page=100"));
});

test("putTopics sends the complete list as {names} with PUT to the topics endpoint", async () => {
  const { fetchImpl, calls } = mockFetch(() => json({ names: ["python", "backend", "group-client-b"] }));
  const out = await api(fetchImpl).putTopics("mutsuyuki", "api", ["python", "backend", "group-client-b"]);
  assert.deepEqual(out, ["python", "backend", "group-client-b"]);
  assert.equal(calls[0]?.method, "PUT");
  assert.equal(calls[0]?.url, "https://api.github.com/repos/mutsuyuki/api/topics");
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), { names: ["python", "backend", "group-client-b"] });
  assert.equal(calls[0]?.headers["Content-Type"], "application/json");
});

test("the wrapper only ever issues GET and PUT", async () => {
  const { fetchImpl, calls } = mockFetch((c) => (c.url.endsWith("/user") ? json({ login: "u" }) : c.url.includes("/topics") ? json({ names: [] }) : c.url.includes("/installations") ? json({ total_count: 0, installations: [] }) : json([])));
  const a = api(fetchImpl);
  await a.whoami();
  await a.listOwnRepos();
  await a.getTopics("o", "r");
  await a.putTopics("o", "r", []);
  await a.listInstallations();
  assert.deepEqual([...new Set(calls.map((c) => c.method))].sort(), ["GET", "PUT"]);
  assert.ok(calls.every((c) => c.url.startsWith("https://api.github.com/")));
});

test("error mapping: 401, 403 with accepted permissions, 403 rate limit, 404, 422, network", async () => {
  const cases: Array<[Response | Error, string, (e: GitHubApiError) => boolean]> = [
    [json({ message: "Bad credentials" }, 401), "unauthorized", (e) => e.info.message.includes("Bad credentials")],
    [json({ message: "Resource not accessible by personal access token" }, 403, { "x-accepted-github-permissions": "administration=write" }), "forbidden", (e) => e.info.acceptedPermissions === "administration=write"],
    [json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "retry-after": "30" }), "rate_limited", (e) => e.info.retryAfterSeconds === 30],
    [json({ message: "Not Found" }, 404), "not_found", () => true],
    [json({ message: "Validation Failed" }, 422), "validation", () => true],
    [new TypeError("Failed to fetch"), "network", (e) => e.info.status === 0],
  ];
  for (const [resp, kind, extra] of cases) {
    const { fetchImpl } = mockFetch(() => {
      if (resp instanceof Error) throw resp;
      return resp;
    });
    await assert.rejects(api(fetchImpl).getTopics("o", "r"), (e: unknown) => e instanceof GitHubApiError && e.info.kind === kind && extra(e), `kind=${kind}`);
  }
});

test("toRepoSummary tolerates missing optional fields and rejects garbage", () => {
  assert.equal(toRepoSummary(null), null);
  assert.equal(toRepoSummary({ name: "x" }), null);
  const r = toRepoSummary({ name: "x", full_name: "u/x", owner: { login: "u" }, html_url: "https://github.com/u/x" });
  assert.deepEqual(r?.topics, []);
  assert.equal(r?.private, false);
  assert.equal(r?.description, null);
  assert.equal(r?.stargazers, 0);
  assert.equal(r?.mirror, false);
});

test("listInstallations exposes the numeric app id (stable across renames) alongside the slug", async () => {
  const { fetchImpl } = mockFetch(() =>
    json({ total_count: 1, installations: [{ id: 1, app_id: 4816822, app_slug: "topic-folders", account: { login: "hash7ff" }, repository_selection: "selected" }] }),
  );
  const [inst] = await api(fetchImpl).listInstallations();
  assert.equal(inst?.appId, 4816822);
  assert.equal(inst?.appSlug, "topic-folders");
  assert.equal(inst?.account, "hash7ff");
});
