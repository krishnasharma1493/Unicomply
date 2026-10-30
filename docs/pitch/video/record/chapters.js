const { take, click, typeIn, sleep, glide, WEB } = require('./lib');
const web = (page, re) => page.getByText(re).first();

const chapters = {
  // B: one screen for all of AICTE
  B_overview: () => take('B_overview', 'senior', '/overview', async (page) => {
    await sleep(2500);
    const cards = page.locator('.ant-card, [class*="stat"], [class*="kpi"]');
    for (let i = 0; i < Math.min(await cards.count(), 4); i++) { await glide(page, cards.nth(i), 20); await sleep(900); }
    await page.mouse.wheel(0, 500); await sleep(2500);
    await page.mouse.wheel(0, 400); await sleep(2500);
  }),

  // E: 3,751 real AICTE institutions, then the Institution 360 of the hero
  E_institutions: () => take('E_institutions', 'senior', '/institutions', async (page) => {
    await sleep(2200);
    await typeIn(page, page.getByPlaceholder('Name, acronym or Permanent ID'), 'maharaja agrasen', 80);
    await sleep(2200);
    await click(page, page.getByRole('link', { name: /Maharaja Agrasen Institute of Technology/ }).first());
    await sleep(3500);
    await page.mouse.wheel(0, 450); await sleep(2800);
  }),

  // F: find the hero case, its SLA and history, and the disposal block
  F_cases: () => take('F_cases', 'pgrc', '/cases', async (page) => {
    await sleep(1800);
    await click(page, page.getByRole('button', { name: /Search cases/ }));
    await sleep(600);
    await page.keyboard.type('00412', { delay: 120 });
    await sleep(1500);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/cases\/\d+/, { timeout: 15000 });
    await sleep(3500);
    await page.mouse.wheel(0, 380); await sleep(3000);
    const dispose = page.getByRole('button', { name: /Dispose/ }).first();
    if (await dispose.count()) { await click(page, dispose); await sleep(3200); await page.keyboard.press('Escape'); await sleep(800); }
  }),

  // G: confirm the overlap and name a coordinator
  G_overlap: () => take('G_overlap', 'pgrc', '/overlaps/1', async (page) => {
    await sleep(3000);
    await page.mouse.wheel(0, 250); await sleep(2500);
    await page.mouse.wheel(0, -250); await sleep(900);
    await click(page, page.getByRole('button', { name: 'Confirm overlap' }));
    await sleep(2800);
    await click(page, page.getByRole('button', { name: 'Confirm', exact: true }));
    await web(page, /Overlap confirmed|Coordinator:/).waitFor({ timeout: 15000 });
    await sleep(3500);
  }),

  // H: the other bureau's head is alerted
  H_alert: () => take('H_alert', 'rb', '/', async (page) => {
    await sleep(2200);
    await click(page, page.getByRole('button', { name: /^Alerts, \d+ unread/ }));
    await sleep(3500);
    await page.keyboard.press('Escape');
    await click(page, page.getByRole('link', { name: 'Alerts' }).first());
    await sleep(3500);
  }),

  // I: an uncertain name goes to a person
  I_review: () => take('I_review', 'senior', '/reviews', async (page) => {
    await sleep(2200);
    await click(page, page.getByRole('button', { name: /^Review PGRC\/2026\/00033/ }));
    await sleep(3200);
    const pickBtn = page.getByRole('button', { name: /^Pick / }).first();
    if (await pickBtn.count()) { await glide(page, pickBtn); await sleep(2500); }
  }),

  // J: reports and CSV
  J_reports: () => take('J_reports', 'senior', '/reports', async (page) => {
    await sleep(2500);
    await page.mouse.wheel(0, 380); await sleep(2500);
    await page.mouse.wheel(0, -380); await sleep(800);
    const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await click(page, page.getByRole('button', { name: 'Download CSV' }));
    await dl; await sleep(2500);
  }),
};

(async () => {
  for (const name of process.argv.slice(2)) {
    if (!chapters[name]) throw new Error(`unknown chapter ${name}`);
    try { await chapters[name](); } catch (e) { console.error(`FAILED ${name}: ${String(e).split('\n')[0]}`); }
  }
})();
