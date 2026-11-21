// Smoke tests for Quadrant_Chart_Builder.html. Run with: node tests/smoke.js
// Needs Playwright (npm install --no-save playwright@1.63.0, then npx playwright install chromium).
// Set APP_FILE to test another copy of the app. Exits with code 1 if any check fails.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const APP = process.env.APP_FILE || path.join(__dirname, '..', 'Quadrant_Chart_Builder.html');
const APP_URL = 'file://' + path.resolve(APP);
const DESK = { viewport: { width: 1280, height: 900 } };
const PHONE = devices['iPhone 13'];

const SETUP_X = { title: 'Which of our product bets are worth the next quarter of engineering time and money', note: 'Placement reflects the team workshop held in October; scores are rough, open to debate, and will be revisited after the next planning cycle ends.', axes: { top: 'High customer impact in every segment', bottom: 'Low customer impact', left: 'Hard to build well', right: 'Easy to build well, fast' }, quads: { tl: 'Big bets', tr: 'Quick wins', bl: 'Money pits', br: 'Fill-ins' }, items: [{ name: 'Self-serve onboarding flow', x: 0.73, y: 0.7 }, { name: 'Usage-based billing', x: 0.3, y: 0.3 }] };
const SETUP_Y = { title: 'Close points', note: '', axes: { top: 'High', bottom: 'Low', left: 'Left', right: 'Right' }, quads: { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' }, items: [{ name: 'Alpha product line', x: 0.40, y: 0.60 }, { name: 'Beta product line', x: 0.42, y: 0.62 }, { name: 'Gamma', x: 0.43, y: 0.58 }, { name: 'Near the corner', x: 0.05, y: 0.95 }, { name: 'Right edge', x: 0.98, y: 0.5 }] };

/* ---------- helpers ---------- */

// Opens the app in a fresh context and waits for the page to settle.
async function open(browser, opts) {
  const context = await browser.newContext({ acceptDownloads: true, ...opts });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(APP_URL);
  await page.waitForSelector('#chart svg g.pt');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page, errors };
}

async function loadSetup(page, obj) {
  await page.fill('#paste', typeof obj === 'string' ? obj : JSON.stringify(obj));
  await page.click('#load-text');
  await page.waitForTimeout(300);
}

const rowCount = page => page.locator('li.row').count();
const firstName = page => page.locator('li.row input[data-field="name"]').first().inputValue();
const scrollY = page => page.evaluate(() => window.scrollY);

// Text-on-text overlaps and text outside the viewBox. With dots: true, also text over a dot of another point.
async function textProblems(page, dots) {
  return page.evaluate((dots) => {
    const svg = document.querySelector('#chart svg');
    const vb = svg.viewBox.baseVal;
    const boxes = [...svg.querySelectorAll('text')].map(t => {
      const b = t.getBBox();
      return { t, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height, label: t.textContent.slice(0, 40) };
    });
    const problems = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > 1 && oy > 1) problems.push(`"${a.label}" overlaps "${b.label}"`);
      }
    }
    for (const a of boxes) {
      if (a.x0 < 0 || a.y0 < 0 || a.x1 > vb.width || a.y1 > vb.height) problems.push(`"${a.label}" is outside the chart`);
    }
    if (dots) {
      const all = [...svg.querySelectorAll('circle.dot')].map(c => ({ cx: +c.getAttribute('cx'), cy: +c.getAttribute('cy'), r: +c.getAttribute('r'), g: c.closest('g.pt') }));
      for (const a of boxes) {
        const own = a.t.closest('g.pt');
        for (const d of all) {
          if (own && d.g === own) continue;
          const nx = Math.max(a.x0, Math.min(d.cx, a.x1)), ny = Math.max(a.y0, Math.min(d.cy, a.y1));
          if (Math.hypot(nx - d.cx, ny - d.cy) < d.r) problems.push(`"${a.label}" is over a dot`);
        }
      }
    }
    return problems;
  }, dots);
}

// Words in a point's lines that are not words of its name
async function choppedWords(page) {
  return page.evaluate(() => {
    const out = [];
    for (const g of document.querySelectorAll('#chart svg g.pt')) {
      const label = g.getAttribute('aria-label');
      const m = label.match(/^(.*), \d+ across and/);
      const name = m ? m[1] : label;
      const words = new Set(name.trim().split(/\s+/));
      for (const ts of g.querySelectorAll('text tspan')) {
        for (const w of ts.textContent.trim().split(/\s+/)) if (w && !words.has(w)) out.push(`"${w}" in "${name}"`);
      }
    }
    return out;
  });
}

// An empty spot on the chart: the background or a grid line, not text, a dot or a point
async function findEmpty(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#chart svg');
    const r = svg.getBoundingClientRect();
    for (let fy = 0.5; fy < 0.95; fy += 0.02) {
      for (let fx = 0.5; fx > 0.05; fx -= 0.02) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest('g.pt')) continue;
        if ((el.tagName === 'rect' || el.tagName === 'line') && el.closest('#chart svg')) return { x, y };
      }
    }
    return null;
  });
}

async function centerChart(page) {
  await page.evaluate(() => { const b = document.querySelector('#chart').getBoundingClientRect(); window.scrollTo(0, window.scrollY + b.top + b.height / 2 - innerHeight / 2); });
  await page.waitForTimeout(150);
}

// Is fonts.googleapis.com reachable from here?
function fontsReachable() {
  return new Promise(resolve => {
    const req = https.get('https://fonts.googleapis.com/css2?family=Instrument+Sans', res => { res.resume(); resolve(res.statusCode === 200); });
    req.setTimeout(4000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

const pngSize = buf => ({ png: buf.slice(1, 4).toString() === 'PNG', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/* ---------- checks ---------- */
// Each check returns { ok, detail } or { skip, detail }

const checks = [
  ['page loads with no console or page errors', async b => {
    const c = await open(b, DESK);
    await c.context.close();
    return { ok: c.errors.length === 0, detail: c.errors.join(' | ') };
  }],

  ['desktop example: no overlapping text', async b => {
    const c = await open(b, DESK);
    const p = await textProblems(c.page, false);
    await c.context.close();
    return { ok: p.length === 0, detail: p.join(' | ') };
  }],

  ['iPhone example: no overlaps (dots too) and no chopped words', async b => {
    const c = await open(b, PHONE);
    const p = await textProblems(c.page, true);
    const w = await choppedWords(c.page);
    await c.context.close();
    return { ok: p.length === 0 && w.length === 0, detail: [...p, ...w].join(' | ') };
  }],

  ['setup X: no overlapping text, viewBox taller than 700', async b => {
    const c = await open(b, DESK);
    await loadSetup(c.page, SETUP_X);
    const p = await textProblems(c.page, true);
    const h = Number((await c.page.getAttribute('#chart svg', 'viewBox')).split(' ')[3]);
    await c.context.close();
    return { ok: p.length === 0 && h > 700, detail: [...p, `viewBox height ${h}`].join(' | ') };
  }],

  ['setup Y: no text-on-text overlap', async b => {
    const c = await open(b, DESK);
    await loadSetup(c.page, SETUP_Y);
    const p = await textProblems(c.page, false);
    await c.context.close();
    return { ok: p.length === 0, detail: p.join(' | ') };
  }],

  ['empty spot click adds a point; undo removes it; redo brings it back', async b => {
    const c = await open(b, DESK);
    const box = await c.page.locator('#chart svg').boundingBox();
    const n0 = await rowCount(c.page);
    await c.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await c.page.waitForTimeout(200);
    const n1 = await rowCount(c.page);
    await c.page.click('#undo');
    await c.page.waitForTimeout(100);
    const n2 = await rowCount(c.page);
    await c.page.click('#redo');
    await c.page.waitForTimeout(100);
    const n3 = await rowCount(c.page);
    await c.context.close();
    return { ok: n1 === n0 + 1 && n2 === n0 && n3 === n0 + 1, detail: `rows ${n0}, ${n1}, ${n2}, ${n3}` };
  }],

  ['Delete on a focused point, then Control+z, restores it', async b => {
    const c = await open(b, DESK);
    const n0 = await rowCount(c.page), name0 = await firstName(c.page);
    await c.page.locator('#chart svg g.pt').first().focus();
    await c.page.keyboard.press('Delete');
    await c.page.waitForTimeout(100);
    await c.page.click('h1');
    await c.page.keyboard.press('Control+z');
    await c.page.waitForTimeout(100);
    const n2 = await rowCount(c.page), name2 = await firstName(c.page);
    await c.context.close();
    return { ok: n2 === n0 && name2 === name0, detail: `rows ${n0} -> ${n2}, first "${name0}" -> "${name2}"` };
  }],

  ['JSON round-trip keeps the title and point count', async b => {
    const c = await open(b, DESK);
    await c.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const before = { t: await c.page.inputValue('#f-title'), n: await rowCount(c.page) };
    await c.page.click('#copy-json');
    await c.page.waitForTimeout(300);
    let code = null;
    try { code = await c.page.evaluate(() => navigator.clipboard.readText()); } catch (e) { code = null; }
    if (!code || !code.trim()) code = await c.page.inputValue('#paste');
    await loadSetup(c.page, code);
    const after = { t: await c.page.inputValue('#f-title'), n: await rowCount(c.page) };
    await c.context.close();
    return { ok: before.t === after.t && before.n === after.n, detail: `"${before.t}" ${before.n} -> "${after.t}" ${after.n}` };
  }],

  ['Mermaid round-trip keeps the title and point count', async b => {
    const c = await open(b, DESK);
    await c.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const before = { t: await c.page.inputValue('#f-title'), n: await rowCount(c.page) };
    await c.page.click('#copy-mermaid');
    await c.page.waitForTimeout(300);
    let code = null;
    try { code = await c.page.evaluate(() => navigator.clipboard.readText()); } catch (e) { code = null; }
    if (!code || !code.trim()) code = await c.page.inputValue('#paste');
    await loadSetup(c.page, code);
    const after = { t: await c.page.inputValue('#f-title'), n: await rowCount(c.page) };
    await c.context.close();
    return { ok: before.t === after.t && before.n === after.n, detail: `"${before.t}" ${before.n} -> "${after.t}" ${after.n}` };
  }],

  ['PNG download of the example is 1920x1400', async b => {
    const c = await open(b, DESK);
    const [dl] = await Promise.all([c.page.waitForEvent('download'), c.page.click('#dl-png')]);
    const d = pngSize(fs.readFileSync(await dl.path()));
    await c.context.close();
    return { ok: d.png && d.w === 1920 && d.h === 1400, detail: JSON.stringify(d) };
  }],

  ['SVG download embeds the font', async b => {
    if (!(await fontsReachable())) return { skip: 'fonts.googleapis.com is not reachable' };
    const c = await open(b, DESK);
    const [dl] = await Promise.all([c.page.waitForEvent('download'), c.page.click('#dl-svg')]);
    const svg = fs.readFileSync(await dl.path(), 'utf8');
    await c.context.close();
    return { ok: svg.includes('@font-face'), detail: '' };
  }],

  ['phone: no sideways scroll, name inputs at least 250 px wide', async b => {
    const c = await open(b, PHONE);
    const widths = await c.page.$$eval('li.row input[data-field="name"]', els => els.map(e => e.getBoundingClientRect().width));
    const sw = await c.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    await c.context.close();
    return { ok: widths.length > 0 && Math.min(...widths) >= 250 && sw[0] === sw[1], detail: `min name width ${Math.min(...widths).toFixed(0)} px, scrollWidth ${sw[0]} / ${sw[1]}` };
  }],

  ['phone: vertical swipe on empty chart space scrolls the page and adds no point', async b => {
    const c = await open(b, PHONE);
    await centerChart(c.page);
    const spot = await findEmpty(c.page);
    if (!spot) { await c.context.close(); return { ok: false, detail: 'no empty spot found' }; }
    const n0 = await rowCount(c.page), y0 = await scrollY(c.page);
    const cdp = await c.context.newCDPSession(c.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot.x, y: spot.y }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: spot.x, y: spot.y - 25 * i }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await c.page.waitForTimeout(400);
    const y1 = await scrollY(c.page), n1 = await rowCount(c.page);
    await c.context.close();
    return { ok: y1 - y0 > 50 && n1 === n0, detail: `scrollY ${y0} -> ${y1}, rows ${n0} -> ${n1}` };
  }]
];

(async () => {
  const started = Date.now();
  const browser = await chromium.launch();
  let failed = 0;
  for (const [name, fn] of checks) {
    let r;
    try { r = await fn(browser); } catch (e) { r = { ok: false, detail: 'threw: ' + e.message }; }
    if (r.skip) {
      console.log(`SKIP ${name}  (${r.skip})`);
    } else if (r.ok) {
      console.log(`PASS ${name}`);
    } else {
      failed++;
      console.log(`FAIL ${name}${r.detail ? '  ' + r.detail : ''}`);
    }
  }
  await browser.close();
  console.log(`${checks.length} checks, ${failed} failed, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  process.exit(failed ? 1 : 0);
})();
