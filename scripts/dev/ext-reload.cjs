// Reload OUR unpacked extension (resolved by name + UNPACKED location, never by a guessed ID). Prints the resolved ID.
const { chromium } = require('playwright-core');
const NAME = 'GitHub Topic Folders';
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const page = await browser.contexts()[0].newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(400);
  const result = await page.evaluate((name) => new Promise((resolve) => {
    chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true }, (list) => {
      const all = list.map(i => ({ id: i.id, name: i.name, location: i.location, state: i.state }));
      const mine = list.filter(i => i.name === name && i.location === 'UNPACKED');
      if (mine.length !== 1) { resolve({ ok: false, why: `expected exactly one unpacked "${name}", found ${mine.length}`, all }); return; }
      const ext = mine[0];
      chrome.developerPrivate.reload(ext.id, { failQuietly: true, populateErrorForUnpacked: true }, (loadError) => {
        resolve({ ok: !loadError, id: ext.id, path: ext.path, version: ext.version, loadError: loadError || null, runtimeErrors: ext.runtimeErrors?.map(e => e.message) });
      });
    });
  }), NAME);
  console.log(JSON.stringify(result));
  await page.waitForTimeout(800);
  await page.close(); await browser.close();
  if (!result.ok) process.exit(2);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
