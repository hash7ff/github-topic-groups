// Force the stored access token to look expired, then load the repositories page: the token manager must refresh transparently.
const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2];
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  let opt = ctx.pages().find(p => p.url().includes('/options.html'));
  if (!opt) { opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`); }
  const before = await opt.evaluate(async () => {
    const r = await chrome.storage.local.get('gtf.auth'); const a = r['gtf.auth'];
    const fp = String(a.accessToken).slice(-6);
    await chrome.storage.local.set({ 'gtf.auth': { ...a, expiresAt: Date.now() - 1000 } });
    await chrome.storage.session.clear();
    return { tokenTail: fp, refreshTail: String(a.refreshToken).slice(-6), expiresAtForcedPast: true };
  });
  console.log('BEFORE', JSON.stringify(before));
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-error-panel'), null, { timeout: 60000 });
  const view = await page.evaluate(() => ({ status: document.querySelector('#gtf-root .gtf-toolbar-status')?.textContent, error: document.querySelector('#gtf-root .gtf-error-panel')?.textContent?.trim().slice(0, 160) || null }));
  const after = await opt.evaluate(async () => { const r = await chrome.storage.local.get('gtf.auth'); const a = r['gtf.auth']; return { kind: a?.kind, tokenTail: String(a?.accessToken).slice(-6), refreshTail: String(a?.refreshToken).slice(-6), expiresInMin: a?.expiresAt ? Math.round((a.expiresAt - Date.now()) / 60000) : null }; });
  console.log('AFTER', JSON.stringify({ view, auth: after, tokenRotated: after.tokenTail !== before.tokenTail, refreshRotated: after.refreshTail !== before.refreshTail }));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
