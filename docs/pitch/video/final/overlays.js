// Renders transparent caption pills and opaque chapter cards with headless Chrome (Playwright from ../record).
const { chromium } = require('../record/node_modules/playwright');
const plan = require('./plan');
const fs = require('fs');
const base = `*{margin:0;box-sizing:border-box}html,body{width:1920px;height:1080px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}`;
const pill = (t, top) => `<style>${base}body{background:transparent;position:relative}
.p{position:absolute;left:50%;${top ? 'top:28px' : 'bottom:64px'};transform:translateX(-50%);max-width:1560px;display:flex;align-items:center;gap:20px;padding:22px 40px 22px 32px;border-radius:999px;background:rgba(255,255,255,.96);border:1.5px solid #cfd3d0;box-shadow:0 10px 36px rgba(27,31,29,.22);color:#1b1f1d;font-size:40px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.d{flex:none;width:14px;height:14px;border-radius:50%;background:#0b5e6b}</style><div class="p"><span class="d"></span><span>${t}</span></div>`;
const card = (n, t) => `<style>${base}body{background:#f3f3f1;display:flex;flex-direction:column;justify-content:center;padding:0 200px}
.k{font-size:26px;letter-spacing:.18em;text-transform:uppercase;color:#5b625e;font-weight:600}
h1{margin:26px 0 34px;font-size:112px;line-height:1.05;letter-spacing:-.03em;font-weight:700;color:#1b1f1d}
.r{width:140px;height:8px;border-radius:4px;background:#0b5e6b}
.n{color:#0b5e6b}</style><div class="k">Demo · chapter <span class="n">${n}</span> of 9</div><h1>${t}</h1><div class="r"></div>`;
(async () => {
  fs.mkdirSync('png', { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const ch of plan) {
    await p.setContent(card(ch.n, ch.title)); await p.screenshot({ path: `png/card_${ch.id}.png` });
    for (let i = 0; i < ch.caps.length; i++) {
      await p.setContent(pill(ch.caps[i][0].replace(/&/g, '&amp;'), ch.caps[i][3] === 'top'));
      await p.screenshot({ path: `png/cap_${ch.id}${i}.png`, omitBackground: true });
    }
  }
  await b.close();
  console.log('overlays done');
})();
