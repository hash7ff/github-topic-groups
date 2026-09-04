// Post-review hardening checks: content-script world cannot read storage; options-only messages are refused from content;
// prefix/dryRun cannot be changed from content; writes for another owner are refused; stale expectations abort writes.
const { chromium } = require('playwright-core');
const READ = process.env.GTF_READ_TOKEN; const EXT_ID = process.argv[2];
const gh = async (path) => (await fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } })).json();
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().startsWith('https://github.com/mutsuyuki')) || await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const live = new Map();
  cdp.on('Runtime.executionContextCreated', (e) => live.set(e.context.id, e.context));
  cdp.on('Runtime.executionContextDestroyed', (e) => live.delete(e.executionContextId));
  cdp.on('Runtime.executionContextsCleared', () => live.clear());
  await cdp.send('Runtime.enable');
  await page.goto('https://github.com/mutsuyuki?tab=repositories', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#gtf-root .gtf-toolbar', { timeout: 60000 });
  await page.waitForTimeout(500);
  const isolated = [...live.values()].filter(c => c.auxData && c.auxData.isDefault === false);
  console.log('ISOLATED WORLDS (live)', JSON.stringify(isolated.map(c => ({ id: c.id, name: c.name, origin: c.origin }))));
  let ours = null;
  for (const c of isolated) {
    try { const r = await cdp.send('Runtime.evaluate', { expression: 'typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id', contextId: c.id, returnByValue: true }); if (r.result && r.result.value === EXT_ID) { ours = c; break; } } catch {}
  }
  console.log('OUR WORLD', ours ? JSON.stringify({ id: ours.id, name: ours.name, origin: ours.origin }) : 'not found');
  if (!ours) throw new Error('content script world not found');
  const evalIn = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, contextId: ours.id, awaitPromise: true, returnByValue: true }); return r.exceptionDetails ? 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160) : r.result.value; };
  console.log('1 storage.local from content world:', await evalIn(`chrome.storage.local.get('gtf.auth').then(r => 'READABLE keys=' + JSON.stringify(Object.keys(r))).catch(e => 'DENIED: ' + e.message)`));
  console.log('2 journal.list from content:', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'journal.list'})`)));
  console.log('3 prefs.set prefix from content:', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'prefs.set', patch:{prefix:'group-'}})`)));
  console.log('4 prefs.set collapsed from content (allowed):', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'prefs.set', patch:{collapsed:{}}}).then(r => ({ok: r.ok, prefix: r.data && r.data.prefix}))`)));
  console.log('5 write for another owner:', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'repos.setGroup', owner:'someone-else', repo:'x', group:null, expect:null})`)));
  const before = (await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names;
  console.log('6 stale expectation (firmware, expect a group it does not have):', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'repos.setGroup', owner:'mutsuyuki', repo:'gtf-test-firmware', group:'topic-groups-client-a', expect:['topic-groups-zzz']})`)), '| github unchanged:', JSON.stringify((await gh('/repos/mutsuyuki/gtf-test-firmware/topics')).names) === JSON.stringify(before));
  console.log('7 malformed message:', JSON.stringify(await evalIn(`chrome.runtime.sendMessage({type:'repos.setGroup', owner:'mutsuyuki', repo:'../evil', group:null})`)));
  await cdp.detach();
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
