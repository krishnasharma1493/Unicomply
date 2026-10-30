const { take, click, sleep, glide } = require('./lib');
// A: the login page with the five role personas, then one click into the Senior officer's Today queue.
(async () => {
  await take('A_login', null, '/login', async (page) => {
    await sleep(1800);
    const cards = page.getByRole('button', { name: /Raghavan|Deshmukh|Rao|Tiwari|Joshi/ });
    for (let i = 0; i < 4; i++) { await glide(page, cards.nth(i), 18); await sleep(500); }
    await click(page, page.getByRole('button', { name: /Raghavan/ }));
    await page.waitForURL('**/', { timeout: 15000 });
    await sleep(2200);
  }, { lead: 1200 });
})().catch((e) => { console.error(e); process.exit(1); });
