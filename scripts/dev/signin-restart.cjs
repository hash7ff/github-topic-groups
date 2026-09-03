const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2];
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  let opt = ctx.pages().find(p => p.url().includes('/options.html'));
  if (!opt) { opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`); }
  await opt.waitForFunction(() => document.getElementById('status')?.textContent !== 'Checking…', null, { timeout: 15000 });
  console.log('BEFORE', JSON.stringify({ status: await opt.textContent('#status'), result: (await opt.textContent('#result') || '').trim(), flowVisible: (await opt.getAttribute('#flow', 'hidden')) === null }));
  if ((await opt.getAttribute('#flow', 'hidden')) === null) { await opt.click('#cancelFlow'); await opt.waitForTimeout(500); }
  await opt.click('#signIn');
  await opt.waitForSelector('#flow:not([hidden])', { timeout: 20000 });
  const code = (await opt.textContent('#userCode')).trim();
  console.log('NEW_CODE', code, await opt.textContent('#flowStatus'));
  let dev = ctx.pages().find(p => p.url().includes('github.com/login/device'));
  if (!dev) dev = await ctx.newPage();
  await dev.goto('https://github.com/login/device', { waitUntil: 'domcontentloaded' });
  await dev.waitForTimeout(1000);
  console.log('DEVICE_PAGE', dev.url(), '|', await dev.title());
  const inputs = await dev.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.type === 'text' && (i.offsetWidth || i.offsetHeight)).map(i => ({ name: i.name, id: i.id, maxlength: i.maxLength })));
  console.log('INPUTS', JSON.stringify(inputs));
  if (inputs.length === 1) { await dev.fill(`#${inputs[0].id}`, code); console.log('PREFILLED'); }
  else if (inputs.length >= 8) { const chars = code.replace('-', '').split(''); for (let i = 0; i < inputs.length && i < chars.length; i++) await dev.fill(`#${inputs[i].id}`, chars[i]); console.log('PREFILLED (per-char)'); }
  await dev.bringToFront();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
