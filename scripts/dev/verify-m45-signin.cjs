const { chromium } = require('playwright-core');
const SP = __dirname; const EXT_ID = process.argv[2];
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  let opt = ctx.pages().find(p => p.url().includes('/options.html'));
  if (!opt) { opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`); }
  const auth = await opt.evaluate(async () => { const r = await chrome.storage.local.get('gtf.auth'); const a = r['gtf.auth']; return a ? { kind: a.kind, hasRefresh: !!a.refreshToken, expiresInMin: a.expiresAt ? Math.round((a.expiresAt - Date.now()) / 60000) : null, refreshExpiresInDays: a.refreshExpiresAt ? Math.round((a.refreshExpiresAt - Date.now()) / 86400000) : null, tokenPrefix: String(a.accessToken).slice(0, 4) } : null; });
  console.log('AUTH_RECORD', JSON.stringify(auth));
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-error-panel') || document.querySelector('#gtf-root .gtf-notice'), null, { timeout: 60000 });
  await page.waitForTimeout(400);
  console.log('REPOS_PAGE', JSON.stringify(await page.evaluate(() => ({
    status: document.querySelector('#gtf-root .gtf-toolbar-status')?.textContent,
    groups: [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => ({ name: g.querySelector('.gtf-group-name')?.textContent, count: g.querySelector('.gtf-count')?.textContent, repos: [...g.querySelectorAll('.gtf-repo-name')].map(a => a.textContent) })),
    error: document.querySelector('#gtf-root .gtf-error-panel')?.textContent?.trim().slice(0, 200) || null,
    originalHidden: document.getElementById('user-repositories-list')?.hidden,
  }))));
  await page.screenshot({ path: SP + '/m45_repos.png', clip: { x: 400, y: 90, width: 920, height: 520 }, timeout: 15000 }).catch(e => console.log('screenshot skipped:', e.message.slice(0, 60)));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
