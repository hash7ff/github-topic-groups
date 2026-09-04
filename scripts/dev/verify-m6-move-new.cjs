// M6 acceptance via the real UI: Move to…, New project (privacy notice), bulk create, restore Case 1. Test repos only.
const { chromium } = require('playwright-core');
const SP = __dirname; const READ = process.env.GTF_READ_TOKEN; const P = 'topic-folders-';
const gh = async (path) => (await fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } })).json();
const topics = async () => ({ api: (await gh('/repos/mutsuyuki/gtf-test-api/topics')).names, frontend: (await gh('/repos/mutsuyuki/gtf-test-frontend/topics')).names, firmware: (await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names });
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const groups = () => page.evaluate(() => [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => `${g.querySelector('.gtf-group-name')?.textContent}(${g.querySelector('.gtf-count')?.textContent})${g.dataset.key === '__ungrouped' ? '' : ':' + [...g.querySelectorAll('.gtf-repo-name')].map(a => a.textContent).join(',')}`));
  const waitFlash = async () => { await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 60000 }); await page.waitForTimeout(400); return (await page.textContent('#gtf-root .gtf-flash')).replace('×', '').trim(); };
  const dismissFlash = () => page.evaluate(() => { const f = document.querySelector('#gtf-root .gtf-flash'); if (f) f.hidden = true; });
  const moveBtn = (repo) => page.locator(`#gtf-root li.gtf-repo[data-repo="${repo}"] .gtf-repo-actions button`);
  const dlg = () => page.locator('dialog.gtf-dialog[open]');

  const opt0 = await ctx.newPage(); await opt0.goto(`chrome-extension://${process.argv[2]}/options.html`);
  await opt0.evaluate(async () => { const r = await chrome.storage.local.get('gtf.prefs'); await chrome.storage.local.set({ 'gtf.prefs': { ...(r['gtf.prefs'] || {}), privacyNoticeDismissed: false } }); await chrome.storage.session.clear(); }); await opt0.close();
  // GitHub's list endpoint can lag behind topic writes: wait until it agrees with the topics endpoint for the test repos.
  for (let i = 0; i < 30; i++) {
    const list = await gh('/user/repos?affiliation=owner&per_page=100&sort=full_name');
    const byName = Object.fromEntries(list.map(r => [r.name, (r.topics || []).slice().sort().join(',')]));
    const t = await topics();
    const same = ['api', 'frontend', 'firmware'].every(k => byName['gtf-test-' + k] === t[k].slice().sort().join(','));
    if (same) { console.log('list endpoint consistent after', i, 'polls'); break; }
    await new Promise(r => setTimeout(r, 2000));
  }
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-group', { timeout: 60000 });
  await page.click('#gtf-root .gtf-toolbar button[title="Reload repositories from GitHub"]'); await page.waitForTimeout(500);
  await page.waitForFunction(() => !/Loading/.test(document.querySelector('#gtf-root .gtf-toolbar-status')?.textContent || ''), null, { timeout: 60000 }); await page.waitForTimeout(300);
  console.log('0 START groups', JSON.stringify(await groups()), 'github', JSON.stringify(await topics()));

  // 1) Move firmware -> Client A via dialog
  await moveBtn('gtf-test-firmware').click();
  await dlg().waitFor({ timeout: 5000 });
  const items1 = await dlg().locator('.gtf-menu-item').allTextContents();
  await dlg().locator('.gtf-menu-item').filter({ hasText: /^Client A/ }).click();
  console.log('1 MOVE firmware->Client A', JSON.stringify({ menu: items1.map(t => t.replace(/\s+/g, ' ').trim()), flash: await waitFlash(), groups: await groups(), github: (await topics()).firmware }));
  await dismissFlash();

  // 2) Move api -> New project… "Client B" (privacy notice expected on first use)
  await moveBtn('gtf-test-api').click();
  await dlg().locator('.gtf-menu-item').filter({ hasText: /New project/ }).click();
  await dlg().waitFor({ timeout: 5000 });
  const noticeVisible = await dlg().locator('.gtf-notice-attention').count();
  const preselected = await dlg().locator('.gtf-picker-item input:checked').count();
  await dlg().locator('input[type=text].gtf-input').fill('Client B');
  const preview = await dlg().locator('.gtf-preview').textContent();
  if (noticeVisible === 1) await dlg().locator('#gtf-dismiss-notice').check();
  await dlg().locator('.gtf-btn-primary').click();
  console.log('2 NEW PROJECT Client B (api)', JSON.stringify({ noticeVisible: noticeVisible === 1, preselected, preview, flash: await waitFlash(), groups: await groups(), github: (await topics()).api }));
  await dismissFlash();

  // 3) Toolbar New project -> OSS with frontend + firmware (bulk); notice must be gone
  await page.locator('#gtf-root .gtf-toolbar button', { hasText: 'New project' }).click();
  await dlg().waitFor({ timeout: 5000 });
  const noticeAgain = await dlg().locator('.gtf-notice-attention').count();
  await dlg().locator('input[type=search].gtf-input').fill('gtf-test');
  const shown = await dlg().locator('.gtf-picker-item').allTextContents();
  for (const r of ['gtf-test-frontend', 'gtf-test-firmware']) await dlg().locator('.gtf-picker-item').filter({ hasText: r }).locator('input').check();
  await dlg().locator('input[type=text].gtf-input').fill('OSS');
  await dlg().locator('.gtf-btn-primary').click();
  console.log('3 BULK NEW PROJECT OSS', JSON.stringify({ noticeAgain: noticeAgain === 1, filtered: shown.map(t => t.trim().split(/\s+/)[0]), flash: await waitFlash(), groups: await groups(), github: await topics() }));
  await dismissFlash();

  // 4) Restore Case 1: api -> New project "Client A"; frontend -> Client A; firmware -> Ungrouped
  await moveBtn('gtf-test-api').click(); await dlg().locator('.gtf-menu-item').filter({ hasText: /New project/ }).click(); await dlg().waitFor();
  await dlg().locator('input[type=text].gtf-input').fill('Client A'); await dlg().locator('.gtf-btn-primary').click(); await waitFlash(); await dismissFlash();
  await moveBtn('gtf-test-frontend').click(); await dlg().locator('.gtf-menu-item').filter({ hasText: /^Client A/ }).click(); await waitFlash(); await dismissFlash();
  await moveBtn('gtf-test-firmware').click(); await dlg().locator('.gtf-menu-item').filter({ hasText: /^Ungrouped/ }).click(); const f4 = await waitFlash(); await dismissFlash();
  console.log('4 RESTORED', JSON.stringify({ lastFlash: f4, groups: await groups(), github: await topics() }));

  // 5) "current" target is disabled; unchanged move is a no-op
  await moveBtn('gtf-test-api').click();
  const currentDisabled = await dlg().locator('.gtf-menu-item-current').allTextContents();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('5 CURRENT DISABLED', JSON.stringify({ currentDisabled: currentDisabled.map(t => t.replace(/\s+/g, ' ').trim()), dialogClosed: (await dlg().count()) === 0 }));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
