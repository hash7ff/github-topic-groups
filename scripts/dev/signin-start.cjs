const { chromium } = require('playwright-core');
const SP = __dirname; const EXT_ID = process.argv[2];
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  for (const p of ctx.pages().filter(p => p.url().includes('/options.html'))) await p.close();
  const opt = await ctx.newPage();
  const errors = []; opt.on('pageerror', e => errors.push(e.message));
  await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.waitForFunction(() => document.getElementById('status')?.textContent !== 'Checking…', null, { timeout: 15000 });
  console.log('1 STATUS(migrated PAT expected)', JSON.stringify({ status: await opt.textContent('#status'), install: await opt.textContent('#installStatus'), signedInVisible: !(await opt.getAttribute('#signedIn', 'hidden') !== null) }));
  await opt.click('#signOut');
  await opt.waitForFunction(() => /Not signed in/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 15000 });
  console.log('2 SIGNED_OUT', JSON.stringify({ status: await opt.textContent('#status'), result: await opt.textContent('#result') }));
  await opt.click('#signIn');
  await opt.waitForSelector('#flow:not([hidden])', { timeout: 20000 });
  const code = (await opt.textContent('#userCode')).trim();
  const uri = await opt.getAttribute('#openGitHub', 'href');
  console.log('3 FLOW', JSON.stringify({ code, uri, flowStatus: await opt.textContent('#flowStatus') }));
  await opt.screenshot({ path: SP + '/m45_flow.png', fullPage: true });
  // open the device page in the same (logged-in) profile and prefill the code; the human approves
  const dev = await ctx.newPage();
  await dev.goto(uri, { waitUntil: 'domcontentloaded' });
  await dev.waitForTimeout(1200);
  const inputs = await dev.evaluate(() => [...document.querySelectorAll('input')].filter(i => i.type !== 'hidden').map(i => ({ type: i.type, name: i.name, id: i.id, maxlength: i.maxLength, visible: !!(i.offsetWidth || i.offsetHeight) })));
  console.log('4 DEVICE_PAGE', JSON.stringify({ url: dev.url(), title: await dev.title(), inputs }));
  const single = inputs.filter(i => i.visible && i.type === 'text');
  try {
    if (single.length === 1) { await dev.fill(`#${single[0].id}` || `input[name="${single[0].name}"]`, code); }
    else if (single.length >= 8) { const chars = code.replace('-', '').split(''); for (let i = 0; i < single.length && i < chars.length; i++) await dev.fill(`#${single[i].id}`, chars[i]); }
    console.log('5 PREFILLED', single.length === 1 ? 'single input' : `${single.length} inputs`);
  } catch (e) { console.log('5 PREFILL_FAILED', e.message.slice(0, 120)); }
  await dev.bringToFront();
  await dev.screenshot({ path: SP + '/m45_device.png' });
  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
