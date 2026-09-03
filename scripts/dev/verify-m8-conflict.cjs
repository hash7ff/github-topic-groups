// M8: conflict detection + Fix. Creates a deliberate conflict on gtf-test-firmware (test repo only), fixes it via the UI, restores.
const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2]; const READ = process.env.GTF_READ_TOKEN; const P = 'topic-folders-';
const gh = async (path) => (await fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } })).json();
const firmware = async () => (await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names;
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  // create the conflict directly with the app token (the extension itself never writes two folder topics)
  const put = (names) => opt.evaluate(async (names) => { const { ['gtf.auth']: a } = await chrome.storage.local.get('gtf.auth'); const r = await fetch('https://api.github.com/repos/mutsuyuki/gtf-test-firmware/topics', { method: 'PUT', headers: { Authorization: `Bearer ${a.accessToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ names }) }); await chrome.storage.session.clear(); return r.status; }, names);
  console.log('0 SEED conflict PUT status', await put([P + 'client-a', P + 'client-b', 'keep-me']), 'github firmware:', JSON.stringify(await firmware()));
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-group', { timeout: 60000 });
  const conflict = await page.evaluate(() => { const c = document.querySelector('#gtf-root .gtf-conflicts'); return c ? { count: c.querySelector('.gtf-count')?.textContent, repo: c.querySelector('.gtf-repo-name')?.textContent, note: c.querySelector('.gtf-conflict-note')?.textContent, hasFix: !!c.querySelector('button') } : null; });
  const groups = () => page.evaluate(() => [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => `${g.querySelector('.gtf-group-name')?.textContent}(${g.querySelector('.gtf-count')?.textContent})`));
  console.log('1 CONFLICT SHOWN', JSON.stringify({ conflict, groups: await groups() }));
  await page.locator('#gtf-root .gtf-conflicts button', { hasText: 'Fix' }).click();
  const dlg = page.locator('dialog.gtf-dialog[open]'); await dlg.waitFor();
  const choices = await dlg.locator('.gtf-menu-item').allTextContents();
  await dlg.locator('.gtf-menu-item').filter({ hasText: /^Client A/ }).click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(400);
  console.log('2 FIXED', JSON.stringify({ choices: choices.map(t => t.trim().replace(/\s+/g, ' ')), flash: (await page.textContent('#gtf-root .gtf-flash')).replace('×', '').trim(), groups: await groups(), github: await firmware() }));
  // restore: back to []
  console.log('3 RESTORE PUT status', await put([]), 'github firmware:', JSON.stringify(await firmware()));
  await opt.close();
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
