// M4 acceptance via CDP: grouped view, collapse persistence, search, Grouped/Original toggle, error path (Case 6), restore.
const { chromium } = require('playwright-core');
const SP = __dirname; const EXT_ID = process.argv[2]; const TOKEN = process.env.GTF_TEST_TOKEN;
const URL = 'https://github.com/mutsuyuki?tab=repositories';
const redact = (s) => TOKEN ? String(s).split(TOKEN).join('<token>') : String(s);
const snapshot = () => ({
  groups: [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => ({ key: g.dataset.key, name: g.querySelector('.gtf-group-name')?.textContent, count: g.querySelector('.gtf-count')?.textContent, expanded: g.querySelector('.gtf-group-header')?.getAttribute('aria-expanded'), rows: g.querySelectorAll('.gtf-repo').length })),
  originalHidden: document.getElementById('user-repositories-list')?.hidden,
  bodyHidden: document.querySelector('#gtf-root .gtf-body')?.hidden,
  status: document.querySelector('#gtf-root .gtf-toolbar-status')?.textContent,
  error: document.querySelector('#gtf-root .gtf-error-panel')?.textContent?.trim().slice(0, 160) || null,
  mode: document.querySelector('#gtf-root .gtf-seg-btn[aria-pressed="true"]')?.textContent,
  firstRows: [...document.querySelectorAll('#gtf-root .gtf-group[data-key="topic-folders-client-a"] .gtf-repo')].map(r => ({ name: r.querySelector('.gtf-repo-name')?.textContent, href: r.querySelector('.gtf-repo-name')?.getAttribute('href'), labels: [...r.querySelectorAll('.gtf-label')].map(l => l.textContent), meta: r.querySelector('.gtf-repo-meta')?.textContent })),
});
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const waitReady = () => page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-error-panel'), null, { timeout: 60000 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await waitReady(); await page.waitForTimeout(300);
  console.log('1 READY', JSON.stringify(await page.evaluate(snapshot)));
  await page.screenshot({ path: SP + '/m4_grouped.png', clip: { x: 400, y: 90, width: 920, height: 760 } });

  // collapse Client A, reload, expect still collapsed; expand again
  await page.click('#gtf-root .gtf-group[data-key="topic-folders-client-a"] .gtf-group-header'); await page.waitForTimeout(300);
  const c1 = await page.evaluate(snapshot);
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitReady(); await page.waitForTimeout(300);
  const c2 = await page.evaluate(snapshot);
  await page.click('#gtf-root .gtf-group[data-key="topic-folders-client-a"] .gtf-group-header'); await page.waitForTimeout(300);
  const c3 = await page.evaluate(snapshot);
  console.log('2 COLLAPSE', JSON.stringify({ afterClick: c1.groups[0], afterReload: c2.groups[0], afterExpand: c3.groups[0] }));

  // search
  await page.fill('#gtf-root .gtf-search', 'gtf-test'); await page.waitForTimeout(300);
  console.log('3 SEARCH gtf-test', JSON.stringify((await page.evaluate(snapshot)).groups));
  await page.fill('#gtf-root .gtf-search', 'zzz-nothing'); await page.waitForTimeout(300);
  console.log('3b SEARCH none', JSON.stringify({ groups: (await page.evaluate(snapshot)).groups.length, empty: await page.evaluate(() => document.querySelector('#gtf-root .gtf-empty')?.textContent) }));
  await page.fill('#gtf-root .gtf-search', ''); await page.waitForTimeout(300);

  // Original / Grouped toggle with persistence
  await page.click('#gtf-root .gtf-seg-btn[data-mode="original"]'); await page.waitForTimeout(300);
  const o1 = await page.evaluate(snapshot);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#gtf-root .gtf-toolbar', { timeout: 30000 }); await page.waitForTimeout(1500);
  const o2 = await page.evaluate(snapshot);
  await page.screenshot({ path: SP + '/m4_original.png', clip: { x: 400, y: 90, width: 920, height: 400 } });
  await page.click('#gtf-root .gtf-seg-btn[data-mode="grouped"]'); await waitReady(); await page.waitForTimeout(300);
  const o3 = await page.evaluate(snapshot);
  console.log('4 TOGGLE', JSON.stringify({ original: { mode: o1.mode, originalHidden: o1.originalHidden, bodyHidden: o1.bodyHidden }, afterReload: { mode: o2.mode, originalHidden: o2.originalHidden, bodyHidden: o2.bodyHidden }, grouped: { mode: o3.mode, originalHidden: o3.originalHidden, bodyHidden: o3.bodyHidden, groups: o3.groups.length } }));

  // Case 6: API failure -> error panel, original view restorable (corrupt the stored credential, restore it afterwards)
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  const saved = await opt.evaluate(async () => { const r = await chrome.storage.local.get('gtf.auth'); await chrome.storage.session.clear(); await chrome.storage.local.set({ 'gtf.auth': { kind: 'pat', accessToken: 'ghp_invalid_for_case6' } }); return r['gtf.auth']; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitReady(); await page.waitForTimeout(300);
  const e1 = await page.evaluate(snapshot);
  const hasRetry = await page.$('#gtf-root .gtf-error-panel button:has-text("Retry")');
  await page.click('#gtf-root .gtf-error-panel button:has-text("Show original")'); await page.waitForTimeout(300);
  const e2 = await page.evaluate(snapshot);
  console.log('5 CASE6', JSON.stringify({ error: e1.error, originalHiddenDuringError: e1.originalHidden, hasRetry: !!hasRetry, afterShowOriginal: { mode: e2.mode, originalHidden: e2.originalHidden, bodyHidden: e2.bodyHidden } }));
  await opt.evaluate(async (saved) => { await chrome.storage.local.set({ 'gtf.auth': saved }); await chrome.storage.session.clear(); }, saved);
  console.log('6 RESTORE', JSON.stringify({ restoredKind: saved?.kind }));
  await opt.close();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#gtf-root .gtf-toolbar', { timeout: 30000 }); await page.waitForTimeout(500);
  await page.click('#gtf-root .gtf-seg-btn[data-mode="grouped"]'); await waitReady(); await page.waitForTimeout(300);
  const f = await page.evaluate(snapshot);
  console.log('7 FINAL', JSON.stringify({ mode: f.mode, groups: f.groups.length, originalHidden: f.originalHidden, roots: await page.evaluate(() => document.querySelectorAll('#gtf-root').length) }));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', redact(e.message)); process.exit(1); });
