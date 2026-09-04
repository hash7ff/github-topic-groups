// An organization where the app is NOT installed must fail safe: clear message, install link, GitHub's own list visible.
// Reports state only, never repository names.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const orgs = await page.evaluate(async () => null).catch(() => null);
  // pick an organization the user belongs to, other than hash7ff, from their profile page
  await page.goto('https://github.com/mutsuyuki', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const other = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href^="/"][data-hovercard-type="organization"], a[href^="/"] img.avatar-user, a[data-hovercard-type="organization"]')]
      .map(a => (a.closest('a') || a).getAttribute('href')).filter(Boolean).map(h => h.replace(/^\//, ''))
      .filter(n => n && !n.includes('/') && n !== 'hash7ff' && n !== 'mutsuyuki');
    return [...new Set(links)][0] || null;
  });
  if (!other) { console.log('no other organization found on the profile; skipping'); await browser.close(); return; }
  await page.goto(`https://github.com/orgs/${other}/repositories`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-error-panel') || document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-empty'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(800);
  console.log('NOT-INSTALLED ORG', JSON.stringify(await page.evaluate(() => ({
    mounted: document.querySelectorAll('#gtf-root').length,
    error: document.querySelector('#gtf-root .gtf-error-panel')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 200) || null,
    hasInstallLink: !!document.querySelector('#gtf-root .gtf-error-panel a[href*="installations/new"]'),
    groups: document.querySelectorAll('#gtf-root .gtf-group').length,
    nativeListVisible: document.querySelector('[id$="-list-view-container"]')?.hidden === false,
  }))));
  console.log('ERRORS', JSON.stringify(errors));
  await page.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
