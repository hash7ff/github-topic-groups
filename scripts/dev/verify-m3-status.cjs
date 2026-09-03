// Paste the read-only token (from env, never printed) into the options page of the 9224 profile, then read the M3 status line.
const { chromium } = require('playwright-core');
const SP = __dirname; const EXT_ID = process.argv[2]; const TOKEN = process.env.GTF_TEST_TOKEN;
if (!TOKEN) { console.error('no token in env'); process.exit(1); }
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.waitForFunction(() => document.getElementById('status')?.textContent !== 'Checking…', null, { timeout: 10000 });
  await opt.fill('#token', TOKEN);
  await opt.click('#save');
  await opt.waitForSelector('#result:not([hidden])', { timeout: 30000 });
  const r = { result: await opt.textContent('#result'), status: await opt.textContent('#status') };
  console.log('OPTIONS', JSON.stringify(r).replace(TOKEN, '<token>'));
  await opt.close();
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const t0 = Date.now();
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-status', { timeout: 15000 });
  await page.waitForFunction(() => /Loaded|error|rejected|only/i.test(document.querySelector('#gtf-root .gtf-status')?.textContent || ''), null, { timeout: 60000 });
  console.log('CONTENT(first load)', JSON.stringify({ text: await page.textContent('#gtf-root .gtf-status'), ms: Date.now() - t0 }));
  const t1 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Loaded|error|rejected|only/i.test(document.querySelector('#gtf-root .gtf-status')?.textContent || ''), null, { timeout: 60000 });
  console.log('CONTENT(second load, cache expected)', JSON.stringify({ text: await page.textContent('#gtf-root .gtf-status'), ms: Date.now() - t1 }));
  await page.screenshot({ path: SP + '/m3_content.png', clip: { x: 400, y: 100, width: 920, height: 160 } });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', String(e.message).replace(TOKEN, '<token>')); process.exit(1); });
