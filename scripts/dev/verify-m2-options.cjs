const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2]; const SP = __dirname;
const REPOS_URL = 'https://github.com/mutsuyuki?tab=repositories';
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki'));
  if (!page) page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type()==='error' && /gtf|extension/i.test(m.text())) errors.push(m.text()); });
  await page.goto(REPOS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-status', { timeout: 15000 });
  await page.waitForFunction(() => !(document.querySelector('#gtf-root .gtf-status')?.textContent || '').includes('…'), null, { timeout: 15000 }).catch(() => {});
  const status1 = await page.evaluate(() => ({ text: document.querySelector('#gtf-root .gtf-status')?.textContent, hasButton: !!document.querySelector('#gtf-root .gtf-btn'), roots: document.querySelectorAll('#gtf-root').length }));
  console.log('CONTENT(no token)', JSON.stringify(status1));

  // "Open settings" button should open the options page in a new tab
  const before = ctx.pages().length;
  await page.click('#gtf-root .gtf-btn').catch(e => console.log('click failed', e.message));
  await page.waitForTimeout(1200);
  const optPages = ctx.pages().filter(p => p.url().includes('/options.html'));
  console.log('OPEN_SETTINGS', JSON.stringify({ pagesBefore: before, pagesAfter: ctx.pages().length, optionsTabs: optPages.length }));

  const opt = optPages[0] || await ctx.newPage();
  if (!optPages[0]) await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.waitForFunction(() => document.getElementById('status')?.textContent !== 'Checking…', null, { timeout: 10000 });
  console.log('OPTIONS(initial)', JSON.stringify({ status: await opt.textContent('#status') }));
  await opt.fill('#token', 'github_pat_DUMMY_INVALID_TOKEN_FOR_TESTING');
  await opt.click('#save');
  await opt.waitForSelector('#result:not([hidden])', { timeout: 20000 });
  console.log('OPTIONS(bad token)', JSON.stringify({ result: await opt.textContent('#result'), cls: await opt.getAttribute('#result', 'class'), status: await opt.textContent('#status'), inputStillHasValue: (await opt.inputValue('#token')).length > 0 }));
  await opt.screenshot({ path: SP + '/m2_options.png' });
  await opt.click('#clear'); await opt.waitForTimeout(500);
  console.log('OPTIONS(after clear)', JSON.stringify({ result: await opt.textContent('#result'), status: await opt.textContent('#status') }));
  for (const p of ctx.pages().filter(p => p.url().includes('/options.html'))) await p.close();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-status', { timeout: 15000 });
  await page.waitForFunction(() => !(document.querySelector('#gtf-root .gtf-status')?.textContent || '').includes('…'), null, { timeout: 15000 }).catch(() => {});
  console.log('CONTENT(after)', JSON.stringify({ text: await page.textContent('#gtf-root .gtf-status'), roots: await page.evaluate(() => document.querySelectorAll('#gtf-root').length) }));
  await page.screenshot({ path: SP + '/m2_content.png', clip: { x: 400, y: 100, width: 920, height: 160 } });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
