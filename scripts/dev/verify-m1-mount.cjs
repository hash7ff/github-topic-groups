const { chromium } = require('playwright-core');
const SP = __dirname;
const probe = () => ({
  login: document.querySelector('meta[name="user-login"]')?.getAttribute('content') || null,
  roots: document.querySelectorAll('#gtf-root').length,
  badge: document.querySelector('#gtf-root .gtf-badge')?.textContent || null,
  anchor: (() => { const a = document.getElementById('user-repositories-list'); return a ? { tag: a.tagName, attrs: [...a.attributes].map(x => x.name + '=' + x.value.slice(0, 40)), prevIsRoot: a.previousElementSibling?.id === 'gtf-root' } : null; })(),
  frame: document.querySelector('turbo-frame#user-profile-frame') ? 'yes' : 'no',
  filterInput: document.querySelector('#your-repos-filter') ? 'yes' : 'no',
  repoLinks: document.querySelectorAll('[itemprop="name codeRepository"]').length,
  listItems: document.querySelectorAll('#user-repositories-list li').length,
  pagination: document.querySelector('.paginate-container') ? 'yes' : 'no',
  reactApp: document.querySelectorAll('react-app, [data-target*="react-app"]').length,
  htmlAttrs: ['data-color-mode','data-light-theme','data-dark-theme'].map(a => a + '=' + document.documentElement.getAttribute(a)).join(' '),
  tabs: [...document.querySelectorAll('a[data-tab-item]')].map(a => a.getAttribute('data-tab-item')),
  url: location.href,
});
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (/gtf|topic groups/i.test(m.text())) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#user-repositories-list', { timeout: 15000 });
  await page.waitForTimeout(600);
  console.log('INITIAL', JSON.stringify(await page.evaluate(probe), null, 1));
  await page.screenshot({ path: SP + '/m1_initial.png', fullPage: false });
  // Tab round trips (Turbo navigation)
  const results = [];
  for (let i = 0; i < 3; i++) {
    await page.click('a[data-tab-item="overview"]');
    await page.waitForFunction(() => !location.search.includes('tab=repositories'), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const onOverview = await page.evaluate(() => ({ roots: document.querySelectorAll('#gtf-root').length, url: location.href }));
    await page.click('a[data-tab-item="repositories"]');
    await page.waitForSelector('#user-repositories-list', { timeout: 15000 });
    await page.waitForTimeout(600);
    const onRepos = await page.evaluate(() => ({ roots: document.querySelectorAll('#gtf-root').length, prevIsRoot: document.getElementById('user-repositories-list')?.previousElementSibling?.id === 'gtf-root', url: location.href }));
    results.push({ i, onOverview, onRepos });
  }
  console.log('ROUNDTRIPS', JSON.stringify(results));
  // history back/forward
  await page.goBack(); await page.waitForTimeout(800);
  const afterBack = await page.evaluate(() => ({ roots: document.querySelectorAll('#gtf-root').length, url: location.href }));
  await page.goForward(); await page.waitForSelector('#user-repositories-list', { timeout: 15000 }); await page.waitForTimeout(800);
  const afterFwd = await page.evaluate(() => ({ roots: document.querySelectorAll('#gtf-root').length, url: location.href }));
  console.log('HISTORY', JSON.stringify({ afterBack, afterFwd }));
  // pagination page 2 (URL param) still a repositories page?
  await page.goto('https://github.com/mutsuyuki?page=2&tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user-repositories-list', { timeout: 15000 }); await page.waitForTimeout(600);
  console.log('PAGE2', JSON.stringify(await page.evaluate(() => ({ roots: document.querySelectorAll('#gtf-root').length, url: location.href }))));
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user-repositories-list', { timeout: 15000 });
  console.log('CONSOLE', JSON.stringify(logs));
  await browser.close(); // leaves the tab open in the host Chrome
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
