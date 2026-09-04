// M5 write-layer acceptance. Messages are sent from the options page context (an extension page), no UI needed yet.
// Only the three gtf-test-* repositories are ever touched; the flow ends by restoring the Case 1 state.
const { chromium } = require('playwright-core');
const EXT_ID = process.argv[2]; const READ = process.env.GTF_READ_TOKEN;
const gh = async (path) => { const r = await fetch('https://api.github.com' + path, { headers: { Authorization: `Bearer ${READ}`, Accept: 'application/vnd.github+json' } }); return r.json(); };
const topics = async (repo) => (await gh(`/repos/mutsuyuki/${repo}/topics`)).names;
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9224');
  const ctx = browser.contexts()[0];
  const opt = await ctx.newPage(); await opt.goto(`chrome-extension://${EXT_ID}/options.html`);
  await opt.waitForFunction(() => /Signed in/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 15000 });
  const send = (req) => opt.evaluate((r) => chrome.runtime.sendMessage(r), req);
  const setP = (repo, group) => send({ type: 'repos.setProject', owner: 'mutsuyuki', repo, group });
  const P = 'topic-groups-';
  console.log('0 GITHUB before', JSON.stringify({ api: await topics('gtf-test-api'), frontend: await topics('gtf-test-frontend'), firmware: await topics('gtf-test-firmware') }));

  await send({ type: 'prefs.set', patch: { dryRun: true } });
  const dry = await setP('gtf-test-firmware', P + 'client-a');
  console.log('1 DRY-RUN firmware->client-a', JSON.stringify(dry), '| github firmware:', JSON.stringify(await topics('gtf-test-firmware')));

  await send({ type: 'prefs.set', patch: { dryRun: false } });
  const w1 = await setP('gtf-test-firmware', P + 'client-a');
  console.log('2 CASE2 firmware->client-a', JSON.stringify(w1), '| github:', JSON.stringify(await topics('gtf-test-firmware')));

  const w2 = await setP('gtf-test-api', P + 'client-b');
  console.log('3 CASE3 api->client-b', JSON.stringify(w2), '| github:', JSON.stringify(await topics('gtf-test-api')));

  const same = await setP('gtf-test-api', P + 'client-b');
  console.log('4 UNCHANGED api->client-b again', JSON.stringify(same));

  const bad = await setP('gtf-test-api', 'group-client-b');
  console.log('5 WRONG-PREFIX refused', JSON.stringify(bad));

  // bulk over the port: api back to client-a, firmware to Ungrouped (restores Case 1)
  const bulk = await opt.evaluate(({ port, items }) => new Promise((resolve) => {
    const p = chrome.runtime.connect({ name: port }); const events = []; const t0 = Date.now();
    p.onMessage.addListener((e) => { events.push({ t: Date.now() - t0, ...e }); if (e.type === 'result') { p.disconnect(); resolve(events); } });
    p.postMessage({ type: 'bulk.setProject', items });
  }), { port: 'gtf-bulk', items: [{ owner: 'mutsuyuki', repo: 'gtf-test-api', group: P + 'client-a' }, { owner: 'mutsuyuki', repo: 'gtf-test-firmware', group: null }] });
  console.log('6 BULK events', JSON.stringify(bulk.map(e => e.type === 'result' ? { t: e.t, type: e.type, ok: e.succeeded.map(s => [s.repo, s.result.after]), failed: e.failed } : e)));

  const journal = await send({ type: 'journal.list' });
  console.log('7 JOURNAL', JSON.stringify(journal.ok ? journal.data.map(j => ({ repo: j.repo, before: j.before, after: j.after, dryRun: j.dryRun })) : journal));
  console.log('8 GITHUB after (Case 1 restored?)', JSON.stringify({ api: await topics('gtf-test-api'), frontend: await topics('gtf-test-frontend'), firmware: await topics('gtf-test-firmware') }));
  await opt.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
