// Set the folder-topic prefix via the options page; then report the groups shown on the repositories page.
const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2]; const PREFIX = process.argv[3];
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.waitForFunction(() => (document.getElementById('prefix')?.value || '') !== '', null, { timeout: 10000 });
  const before = await opt.inputValue('#prefix');
  await opt.fill('#prefix', PREFIX); await opt.click('#savePrefix');
  await opt.waitForSelector('#prefixResult:not([hidden])', { timeout: 10000 });
  console.log('OPTIONS', JSON.stringify({ before, result: await opt.textContent('#prefixResult'), cls: await opt.getAttribute('#prefixResult', 'class'), value: await opt.inputValue('#prefix') }));
  await opt.close();
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-error-panel'), null, { timeout: 60000 });
  await page.waitForTimeout(300);
  console.log('GROUPS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => ({ key: g.dataset.key, name: g.querySelector('.gtf-group-name')?.textContent, count: g.querySelector('.gtf-count')?.textContent })))));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
