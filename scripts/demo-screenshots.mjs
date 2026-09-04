// Chrome Web Store screenshots from a DEMO dataset.
//
// Nothing is written to GitHub: the repository list the extension renders comes from its own session cache, which
// we fill with invented repositories and clear again afterwards. Real repository names therefore never appear.
// Usage: node scripts/demo-screenshots.mjs [--keep]   (--keep leaves the demo data in place for a look around)
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/usr/lib/node_modules/");
const { chromium } = require("playwright-core");

const OWNER = "mutsuyuki";
const PREFIX = "topic-groups-";
const KEEP = process.argv.includes("--keep");
const outDir = new URL("../assets/screenshots/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const days = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const repo = (name, group, language, description, extra = {}) => ({
  name,
  fullName: `${OWNER}/${name}`,
  owner: OWNER,
  private: extra.private ?? true,
  description,
  language,
  pushedAt: extra.pushedAt ?? days(extra.age ?? 2),
  updatedAt: extra.pushedAt ?? days(extra.age ?? 2),
  htmlUrl: `https://github.com/${OWNER}/${name}`,
  topics: group ? [PREFIX + group, ...(extra.topics ?? [])] : (extra.topics ?? []),
  archived: extra.archived ?? false,
  fork: extra.fork ?? false,
  mirror: false,
  template: false,
  stargazers: extra.stars ?? 0,
});

const DEMO = [
  repo("api", "client-a", "Go", "Order and billing API for the Client A platform.", { age: 1, topics: ["backend"] }),
  repo("web", "client-a", "TypeScript", "Customer-facing web application.", { age: 2 }),
  repo("infra", "client-a", "HCL", "Terraform modules and environments.", { age: 6 }),
  repo("ios-app", "mobile", "Swift", "iOS client, shares the design system with android-app.", { age: 3 }),
  repo("android-app", "mobile", "Kotlin", "Android client.", { age: 9 }),
  repo("design-tokens", "mobile", "JSON", "Colours, spacing and type scale shared by both apps.", { age: 21 }),
  repo("color-utils", "oss", "Rust", "Small colour-space conversion crate.", { private: false, age: 40, stars: 128 }),
  repo("ts-config", "oss", "TypeScript", "Shared tsconfig presets.", { private: false, age: 120, stars: 31 }),
  repo("spike-webgpu", null, "JavaScript", "Weekend experiment, not going anywhere yet.", { age: 14 }),
  repo("meeting-notes", null, "Markdown", null, { age: 60 }),
];

const browser = await chromium.connectOverCDP("http://localhost:9224");
const ctx = browser.contexts()[0];

const idPage = await ctx.newPage();
await idPage.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
await idPage.waitForTimeout(400);
const extId = await idPage.evaluate(
  () =>
    new Promise((resolve) => {
      chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, (list) => {
        const mine = list.filter((i) => i.name === "Topic Groups for GitHub" && i.location === "UNPACKED");
        resolve(mine.length === 1 ? mine[0].id : null);
      });
    }),
);
await idPage.close();
if (!extId) throw new Error("could not resolve the unpacked extension id");

const opt = await ctx.newPage();
await opt.goto(`chrome-extension://${extId}/options.html`);
const seed = async (repos) =>
  opt.evaluate(
    async ({ owner, repos }) => {
      const prefs = (await chrome.storage.local.get("gtf.prefs"))["gtf.prefs"] ?? {};
      await chrome.storage.local.set({ "gtf.prefs": { ...prefs, viewMode: "grouped", collapsed: {} } });
      await chrome.storage.session.set({ [`gtf.cache.repos.${owner}`]: { repos, fetchedAt: Date.now() } });
    },
    { owner: OWNER, repos },
  );
await seed(DEMO);

const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
const cdp = await ctx.newCDPSession(page);
// Playwright's screenshot waits for fonts and hangs while a modal <dialog> is open; CDP captures directly.
const shoot = async (name) => {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(new URL(name, outDir), Buffer.from(data, "base64"));
  console.log("wrote", name);
};

await page.goto(`https://github.com/${OWNER}?tab=repositories`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#gtf-root .gtf-group"), null, { timeout: 60000 });
await page.waitForTimeout(900);
console.log(
  "rendered:",
  await page.evaluate(() => [...document.querySelectorAll("#gtf-root .gtf-group")].map((g) => `${g.querySelector(".gtf-group-name")?.textContent}(${g.querySelector(".gtf-count")?.textContent})`).join(" ")),
);
await shoot("01-grouped.png");

// keep the page at the top so the toolbar stays visible behind the modal
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);
await page.click('#gtf-root li.gtf-repo[data-repo="web"] .gtf-repo-actions button');
await page.waitForSelector("dialog.gtf-dialog[open]", { timeout: 10000 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await shoot("02-move-to.png");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await page.click('#gtf-root .gtf-toolbar button:has-text("New group")');
await page.waitForSelector("dialog.gtf-dialog[open]", { timeout: 10000 });
await page.fill("dialog.gtf-dialog[open] input[type=text].gtf-input", "Platform");
await page.waitForTimeout(300);
for (const name of ["api", "infra"]) {
  await page.locator("dialog.gtf-dialog[open] .gtf-picker-item").filter({ hasText: name }).first().locator("input").check();
}
await page.waitForTimeout(400);
await shoot("03-new-group.png");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await page.evaluate(() => document.querySelector('#gtf-root .gtf-seg-btn[data-mode="original"]')?.click());
await page.waitForTimeout(700);
await shoot("04-original.png");
await page.evaluate(() => document.querySelector('#gtf-root .gtf-seg-btn[data-mode="grouped"]')?.click());
await page.waitForTimeout(500);

await opt.setViewportSize({ width: 1280, height: 800 });
await opt.bringToFront();
const optCdp = await ctx.newCDPSession(opt);
await opt.reload({ waitUntil: "domcontentloaded" });
await opt.waitForTimeout(1200);
const { data } = await optCdp.send("Page.captureScreenshot", { format: "png" });
writeFileSync(new URL("05-settings.png", outDir), Buffer.from(data, "base64"));
console.log("wrote 05-settings.png");

if (!KEEP) {
  await opt.evaluate(() => chrome.storage.session.clear());
  console.log("demo data cleared; the next page load fetches the real list again");
} else {
  console.log("demo data kept (session storage); clear it with: chrome.storage.session.clear()");
}
await page.close();
await opt.close();
await browser.close();
