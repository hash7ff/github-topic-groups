// Captures Chrome Web Store screenshots (1280x800) from the developer Chrome on CDP 9224.
// Usage: node scripts/capture-screenshots.mjs [urlQuery]
// The default query limits the view to private repositories, which on the development account are only the
// throwaway gtf-test-* ones. Re-run with your own grouped repositories before submitting to the store.
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/usr/lib/node_modules/");
const { chromium } = require("playwright-core");

const query = process.argv[2] ?? "&type=private";
const outDir = new URL("../assets/screenshots/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9224");
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

const shoot = async (name) => {
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 }, timeout: 20000 });
  writeFileSync(new URL(name, outDir), buf);
  console.log("wrote", name, buf.length, "bytes");
};

await page.goto("https://github.com/mutsuyuki?tab=repositories" + query, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#gtf-root .gtf-group", { timeout: 60000 });
await page.waitForTimeout(800);
await shoot("01-grouped.png");

await page.evaluate(() => document.querySelector('#gtf-root .gtf-seg-btn[data-mode="original"]')?.click());
await page.waitForTimeout(600);
await shoot("02-original.png");
await page.evaluate(() => document.querySelector('#gtf-root .gtf-seg-btn[data-mode="grouped"]')?.click());
await page.waitForTimeout(600);

// chrome.runtime is not exposed to the page's main world; resolve our unpacked extension the same way
// scripts/dev/ext-reload.cjs does (by name + UNPACKED, never by guessing from a target list).
const idPage = await ctx.newPage();
await idPage.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
await idPage.waitForTimeout(400);
const id = await idPage.evaluate(
  () =>
    new Promise((resolve) => {
      chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, (list) => {
        const mine = list.filter((i) => i.name === "GitHub Topic Folders" && i.location === "UNPACKED");
        resolve(mine.length === 1 ? mine[0].id : null);
      });
    }),
);
await idPage.close();
if (!id) throw new Error("could not resolve the unpacked extension id");
const ext = ctx.pages().find((p) => p.url().includes("/options.html")) ?? (await ctx.newPage());
await ext.setViewportSize({ width: 1280, height: 800 });
await ext.goto(`chrome-extension://${id}/options.html`, { waitUntil: "domcontentloaded" });
await ext.waitForTimeout(800);
const buf = await ext.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 }, timeout: 20000 });
writeFileSync(new URL("03-settings.png", outDir), buf);
console.log("wrote 03-settings.png", buf.length, "bytes");
await ext.close();
await page.close();
await browser.close();
