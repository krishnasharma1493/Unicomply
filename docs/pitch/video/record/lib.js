// Shared helpers for the scripted demo recordings. One chapter = one browser context = one video.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:5180';
const API = 'http://localhost:8010/api/v1';
const PASSWORD = 'change-me-demo-pass';
const OUT = path.join(__dirname, '..', 'recordings');
const SHOTS = path.join(__dirname, '..', 'shots');
const VIEW = { width: 1536, height: 864 }; // 125% of 1920x1080, so text is large enough to read on video
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = {
  senior: 'senior@aicte.example',
  pgrc: 'pgrc.head@aicte.example',
  rb: 'rb.head@aicte.example',
  ro: 'ro.nw@aicte.example',
  intake: 'intake@aicte.example',
};

async function token(who) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL[who], password: PASSWORD }),
  });
  return (await r.json()).data.access_token;
}

async function resetDemo() {
  const r = await fetch(`${API}/demo/reset`, { method: 'POST', headers: { authorization: `Bearer ${await token('senior')}` } });
  if (!r.ok) throw new Error(`reset failed: ${r.status}`);
  await sleep(2500);
}

// A soft dark dot that follows the mouse, so viewers can see where the Driver is pointing.
const CURSOR = `
(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const d = document.createElement('div');
    d.id = '__cur';
    d.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(15,23,42,.28);border:2px solid rgba(15,23,42,.85);box-shadow:0 2px 8px rgba(0,0,0,.25);transition:transform .12s ease;left:-50px;top:-50px';
    document.documentElement.appendChild(d);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { d.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { d.style.transform = 'scale(1)'; }, true);
  };
  if (document.readyState !== 'loading') add(); else addEventListener('DOMContentLoaded', add);
})();`;

// Open a recorded take, already signed in as `who` (so the video starts on the work, not on a login).
async function take(name, who, startPath, fn, opts = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  const dir = path.join(OUT, `_${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch({ args: ['--force-device-scale-factor=1.25', '--hide-scrollbars'] });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1.25,
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
    reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(CURSOR);
  if (who) {
    const t = await token(who);
    await ctx.addInitScript((tk) => { try { sessionStorage.setItem('unicomply_access_token', tk); } catch {} }, t);
  }
  const page = await ctx.newPage();
  await page.goto(`${WEB}${startPath}`, { waitUntil: 'networkidle' });
  await page.mouse.move(VIEW.width * 0.7, VIEW.height * 0.5);
  await sleep(opts.lead ?? 900);
  try {
    await fn(page);
    await sleep(opts.tail ?? 1200);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  } finally {
    const video = page.video();
    await ctx.close();
    await browser.close();
    if (video) {
      const src = await video.path();
      fs.renameSync(src, path.join(OUT, `${name}.webm`));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`recorded ${name}`);
}

async function glide(page, loc, steps = 28) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('no box for locator');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  await sleep(250);
}
async function click(page, loc) {
  await glide(page, loc);
  await loc.click();
  await sleep(450);
}
async function typeIn(page, loc, text, delay = 55) {
  await click(page, loc);
  await page.keyboard.type(text, { delay });
}
async function pick(page, label, optionText) {
  const field = label.startsWith('#') ? page.locator(label) : page.getByRole('combobox', { name: label });
  await click(page, field);
  await sleep(350);
  const opt = page.locator('.ant-select-dropdown:visible').getByText(optionText, { exact: true }).first();
  await click(page, opt);
}

module.exports = { WEB, API, EMAIL, VIEW, sleep, token, resetDemo, take, glide, click, typeIn, pick };
