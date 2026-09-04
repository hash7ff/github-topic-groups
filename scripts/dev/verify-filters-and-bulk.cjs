// Verify: GitHub's own filter controls now drive the grouped view; language dots; Add repositories… dialog.
const { chromium } = require('playwright-core');
const READ = process.env.GTF_READ_TOKEN; const P = 'topic-folders-';
const gh = async (p) => (await fetch('https://api.github.com' + p, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } })).json();
const topics = async () => ({ api: (await gh('/repos/mutsuyuki/gtf-test-api/topics')).names, frontend: (await gh('/repos/mutsuyuki/gtf-test-frontend/topics')).names, firmware: (await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names });
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const snap = () => page.evaluate(() => ({
    groups: [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => `${g.querySelector('.gtf-group-name')?.textContent}(${g.querySelector('.gtf-count')?.textContent})`),
    total: document.querySelectorAll('#gtf-root .gtf-repo').length,
    chips: [...document.querySelectorAll('#gtf-root .gtf-chip')].map(a => a.textContent.replace('×','').trim()),
    ourSearch: document.querySelector('#gtf-root .gtf-search')?.value,
    firstLangDot: (() => { const d = document.querySelector('#gtf-root .gtf-lang-dot'); return d ? getComputedStyle(d).backgroundColor : null; })(),
    langs: [...document.querySelectorAll('#gtf-root .gtf-repo-lang')].slice(0, 3).map(e => e.textContent.trim()),
  }));
  const go = async (qs) => { await page.goto('https://github.com/mutsuyuki?tab=repositories' + qs, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-empty'), null, { timeout: 60000 }); await page.waitForTimeout(400); return snap(); };

  console.log('1 no filter          ', JSON.stringify(await go('')));
  console.log('2 type=private       ', JSON.stringify(await go('&type=private')));
  console.log('3 type=public        ', JSON.stringify(await go('&type=public')));
  console.log('4 language=Dart      ', JSON.stringify(await go('&language=Dart')));
  console.log('5 q=gtf              ', JSON.stringify(await go('&q=gtf')));
  console.log('6 sort=updated       ', JSON.stringify(await go('&sort=updated')));
  const chipHref = await page.evaluate(() => document.querySelector('#gtf-root .gtf-chip')?.getAttribute('href'));
  console.log('7 chip removes param ', JSON.stringify({ href: chipHref }));
  // native search box drives our view
  await go('');
  await page.fill('#your-repos-filter', 'gtf-test'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.search.includes('q=gtf-test'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-empty'), null, { timeout: 60000 }); await page.waitForTimeout(500);
  console.log('8 native search box  ', JSON.stringify(await snap()));

  // Add repositories… : move firmware into Client A through the project menu
  await go('');
  await page.click(`#gtf-root .gtf-group[data-key="${P}client-a"] .gtf-group-menu`);
  const dlg = page.locator('dialog.gtf-dialog[open]'); await dlg.waitFor();
  const menu = await dlg.locator('.gtf-menu-item').allTextContents();
  await dlg.locator('.gtf-menu-item').filter({ hasText: /Add repositories/ }).click(); await dlg.waitFor();
  const title = await dlg.locator('.gtf-dialog-title').textContent();
  await dlg.locator('input[type=search].gtf-input').fill('gtf-test');
  const listed = await dlg.locator('.gtf-picker-item').allTextContents();
  await dlg.locator('.gtf-picker-item').filter({ hasText: 'gtf-test-firmware' }).locator('input').check();
  await dlg.locator('.gtf-btn-primary').click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(400);
  console.log('9 ADD REPOS          ', JSON.stringify({ menu: menu.map(t => t.trim()), title, listed: listed.map(t => t.trim().split(/\s+/)[0]), flash: (await page.textContent('#gtf-root .gtf-flash')).replace('×','').trim(), groups: (await snap()).groups, github: (await topics()).firmware }));
  // restore
  await page.evaluate(() => { const f = document.querySelector('#gtf-root .gtf-flash'); if (f) f.hidden = true; });
  await page.click('#gtf-root li.gtf-repo[data-repo="gtf-test-firmware"] .gtf-repo-actions button');
  await dlg.locator('.gtf-menu-item').filter({ hasText: /^Ungrouped/ }).click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(400);
  console.log('10 RESTORED          ', JSON.stringify({ groups: (await snap()).groups, github: await topics() }));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
