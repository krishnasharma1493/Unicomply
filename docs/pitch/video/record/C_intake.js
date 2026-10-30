const { take, click, typeIn, pick, sleep, glide, resetDemo } = require('./lib');
// C + D: the hero intake. A misspelt institution is resolved live, then the case is registered and the overlap banner appears.
(async () => {
  await resetDemo();
  await take('C_intake', 'intake', '/cases/new', async (page) => {
    await typeIn(page, page.getByLabel('Institution name, as written in the complaint'), 'maharaja agrsen institute of technology delhi', 60);
    await typeIn(page, page.getByLabel('State'), 'Delhi', 90);
    await page.getByText(/best match Maharaja Agrasen Institute of Technology/).first().waitFor({ timeout: 20000 });
    await sleep(3500); // let the candidates panel read
    await pick(page, '#intake-complainant_type', 'Parent');
    await typeIn(page, page.getByLabel('Complainant name'), 'Sushila Dubey', 70);
    await pick(page, '#intake-category_id', 'Certificates withheld');
    await typeIn(page, page.getByLabel('Subject'), '10th/12th original certificates not returned; full fees demanded', 28);
    await typeIn(page, page.getByLabel('Description'), 'My son left the college after the first semester. The college is not returning his 10th and 12th original mark sheets and is demanding fees for all four years before it will release them.', 12);
    await sleep(800);
    await click(page, page.getByRole('button', { name: 'Register case' }));
    await page.getByText('Potential Overlapping Cases – Coordination Required').first().waitFor({ timeout: 30000 });
    await sleep(4500); // banner, linked cases and reasons on screen
    const reasons = page.getByText(/Same institution/).first();
    if (await reasons.count()) { await glide(page, reasons, 30); await sleep(2500); }
  }, { lead: 1000, tail: 1500 });
})().catch((e) => { console.error(e); process.exit(1); });
