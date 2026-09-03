// M7 acceptance via the real UI: rename (Case 4), delete (Case 5), restore Case 1. Test repos only.
const { chromium } = require('playwright-core');
const READ = process.env.GTF_READ_TOKEN;
const gh = async (path) => (await fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } })).json();
const topics = async () => ({ api: (await gh('/repos/mutsuyuki/gtf-test-api/topics')).names, frontend: (await gh('/repos/mutsuyuki/gtf-test-frontend/topics')).names, firmware: (await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names });
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const groups = () => page.evaluate(() => [...document.querySelectorAll('#gtf-root .gtf-group')].map(g => `${g.querySelector('.gtf-group-name')?.textContent}(${g.querySelector('.gtf-count')?.textContent})${g.dataset.key === '__ungrouped' ? '' : ':' + [...g.querySelectorAll('.gtf-repo-name')].map(a => a.textContent).join(',')}`));
  const waitFlash = async () => { await page.waitForSelector('#gtf-root .gtf-flash:not([hidden])', { timeout: 90000 }); await page.waitForTimeout(400); return (await page.textContent('#gtf-root .gtf-flash')).replace('×', '').trim(); };
  const dismissFlash = () => page.evaluate(() => { const f = document.querySelector('#gtf-root .gtf-flash'); if (f) f.hidden = true; });
  const dlg = () => page.locator('dialog.gtf-dialog[open]');
  const menuOf = (key) => page.locator(`#gtf-root .gtf-group[data-key="${key}"] .gtf-group-menu`);
  const P = 'topic-folders-';

  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-group', { timeout: 60000 });
  console.log('0 START', JSON.stringify({ groups: await groups(), ungroupedHasMenu: await menuOf('__ungrouped').count(), clientAHasMenu: await menuOf(P + 'client-a').count() }));

  // Case 4: rename Client A -> Customer A
  await menuOf(P + 'client-a').click(); await dlg().waitFor();
  const menuItems = await dlg().locator('.gtf-menu-item').allTextContents();
  await dlg().locator('.gtf-menu-item').filter({ hasText: /Rename/ }).click(); await dlg().waitFor();
  const initial = await dlg().locator('input.gtf-input').inputValue();
  const disabledUnchanged = await dlg().locator('.gtf-btn-primary').isDisabled();
  await dlg().locator('input.gtf-input').fill('Customer A');
  const summary = (await dlg().locator('.gtf-dialog-body > p').allTextContents()).map(t => t.trim());
  await dlg().locator('.gtf-btn-primary').click();
  const f1 = await waitFlash(); await dismissFlash();
  console.log('1 CASE4 RENAME', JSON.stringify({ menuItems: menuItems.map(t => t.trim()), initial, disabledUnchanged, summary, flash: f1, groups: await groups(), github: await topics() }));

  // rename back
  await menuOf(P + 'customer-a').click(); await dlg().waitFor(); await dlg().locator('.gtf-menu-item').filter({ hasText: /Rename/ }).click(); await dlg().waitFor();
  await dlg().locator('input.gtf-input').fill('Client A'); await dlg().locator('.gtf-btn-primary').click(); const f2 = await waitFlash(); await dismissFlash();
  console.log('2 RENAME BACK', JSON.stringify({ flash: f2, groups: await groups() }));

  // Case 5: temp project with firmware, then delete it
  await page.locator(`#gtf-root li.gtf-repo[data-repo="gtf-test-firmware"] .gtf-repo-actions button`).click();
  await dlg().locator('.gtf-menu-item').filter({ hasText: /New project/ }).click(); await dlg().waitFor();
  await dlg().locator('input[type=text].gtf-input').fill('Temp'); await dlg().locator('.gtf-btn-primary').click(); await waitFlash(); await dismissFlash();
  const mid = await groups();
  await menuOf(P + 'temp').click(); await dlg().waitFor(); await dlg().locator('.gtf-menu-item').filter({ hasText: /Delete/ }).click(); await dlg().waitFor();
  const deleteText = (await dlg().locator('.gtf-dialog-body p').allTextContents()).map(t => t.trim().replace(/\s+/g, ' '));
  const title = await dlg().locator('.gtf-dialog-title').textContent();
  await dlg().locator('.gtf-btn-danger').click(); const f3 = await waitFlash(); await dismissFlash();
  const repoStillExists = (await gh('/repos/mutsuyuki/gtf-test-firmware')).full_name;
  console.log('3 CASE5 DELETE', JSON.stringify({ afterCreate: mid, title, deleteText, flash: f3, groups: await groups(), github: await topics(), repoStillExists }));
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
