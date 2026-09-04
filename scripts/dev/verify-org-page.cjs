// Organization page: does the grouped view mount, survive React re-renders/soft navigation, and write topics?
const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2]; const P = 'topic-groups-';
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.evaluate(() => chrome.storage.session.clear());
  const orgTopics = () => opt.evaluate(async () => {
    const { ['gtf.auth']: a } = await chrome.storage.local.get('gtf.auth');
    const h = { Authorization: `Bearer ${a.accessToken}`, Accept: 'application/vnd.github+json' };
    const out = {};
    for (const n of ['a', 'b', 'c', 'd', 'e']) {
      const r = await fetch(`https://api.github.com/repos/hash7ff/gtf-org-test-${n}/topics`, { headers: h });
      out[n] = (await r.json()).names;
    }
    return out;
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const snap = () => page.evaluate(() => ({
    roots: document.querySelectorAll('#gtf-root').length,
    groups: [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => `${g.querySelector('.gtf-group-name')?.textContent}(${g.querySelector('.gtf-count')?.textContent})`),
    repos: [...document.querySelectorAll('#gtf-root .gtf-repo-name')].map(a => a.textContent),
    status: document.querySelector('#gtf-root .gtf-toolbar-status')?.textContent,
    error: document.querySelector('#gtf-root .gtf-error-panel')?.textContent?.trim().slice(0, 140) || null,
    nativeHidden: (document.querySelector('[data-listview-repos-list]') || document.querySelector('[id$="-list-view-container"]'))?.hidden,
    rootBeforeList: (() => { const r = document.getElementById('gtf-root'); const c = document.querySelector('[data-listview-repos-list]') || document.querySelector('[id$="-list-view-container"]'); return !!r && !!c && c.previousElementSibling === r; })(),
    // Regression guard: our view must sit OUTSIDE GitHub's bordered list box, otherwise that border wraps our UI.
    rootInsideBorderedBox: (() => { const r = document.getElementById('gtf-root'); const b = document.querySelector('[data-listview-repos-list]'); return !!(b && r && b.contains(r)); })(),
    chips: [...document.querySelectorAll('#gtf-root .gtf-chip')].map(a => a.textContent.replace('×', '').trim()),
  }));
  const waitReady = () => page.waitForFunction(() => document.querySelector('#gtf-root .gtf-group') || document.querySelector('#gtf-root .gtf-error-panel') || document.querySelector('#gtf-root .gtf-empty'), null, { timeout: 60000 });

  await page.goto('https://github.com/orgs/hash7ff/repositories', { waitUntil: 'domcontentloaded' });
  await waitReady(); await page.waitForTimeout(600);
  console.log('1 MOUNT ON ORG PAGE ', JSON.stringify(await snap()));
  console.log('  github topics     ', JSON.stringify(await orgTopics()));

  // create a group from the org page
  await page.click('#gtf-root .gtf-toolbar button:has-text("New group")');
  const dlg = page.locator('dialog.gtf-dialog[open]'); await dlg.waitFor();
  await dlg.locator('input[type=text].gtf-input').fill('Infra');
  for (const n of ['gtf-org-test-a', 'gtf-org-test-b']) await dlg.locator('.gtf-picker-item').filter({ hasText: n }).locator('input').check();
  await dlg.locator('.gtf-btn-primary').click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(500);
  console.log('2 CREATE FOLDER     ', JSON.stringify({ flash: (await page.textContent('#gtf-root .gtf-flash')).replace('×','').trim(), ...(await snap()) }));
  console.log('  github topics     ', JSON.stringify(await orgTopics()));
  await page.evaluate(() => { const f = document.querySelector('#gtf-root .gtf-flash'); if (f) f.hidden = true; });

  // React re-render: use GitHub's own filter box (soft navigation)
  await page.fill('#repos-list-filter-input', 'gtf-org'); await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  console.log('3 AFTER SOFT NAV    ', JSON.stringify(await snap()));
  await page.goBack(); await page.waitForTimeout(3000);
  console.log('4 AFTER BACK        ', JSON.stringify(await snap()));

  // move one repo, then clean up: delete the group
  await page.click(`#gtf-root li.gtf-repo[data-repo="gtf-org-test-c"] .gtf-repo-actions button`);
  await dlg.waitFor(); await dlg.locator('.gtf-menu-item').filter({ hasText: /^Infra/ }).click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(500);
  console.log('5 MOVE              ', JSON.stringify({ flash: (await page.textContent('#gtf-root .gtf-flash')).replace('×','').trim(), groups: (await snap()).groups }));
  await page.evaluate(() => { const f = document.querySelector('#gtf-root .gtf-flash'); if (f) f.hidden = true; });

  await page.click(`#gtf-root .gtf-group[data-key="${P}infra"] .gtf-group-menu`);
  await dlg.waitFor(); await dlg.locator('.gtf-menu-item').filter({ hasText: /Delete/ }).click(); await dlg.waitFor();
  await dlg.locator('.gtf-btn-danger').click();
  await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(500);
  console.log('6 DELETE (cleanup)  ', JSON.stringify({ flash: (await page.textContent('#gtf-root .gtf-flash')).replace('×','').trim(), groups: (await snap()).groups }));
  console.log('  github topics     ', JSON.stringify(await orgTopics()));

  // the personal page must still work
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await waitReady(); await page.waitForTimeout(500);
  console.log('7 USER PAGE STILL OK', JSON.stringify(await snap()));
  console.log('ERRORS', JSON.stringify(errors));
  await opt.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
