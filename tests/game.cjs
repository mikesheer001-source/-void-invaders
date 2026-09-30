// Run: node tests/game.cjs (requires Playwright and its Chromium browser).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// This test-only bridge never appears in the shipped page.
const instrumented = source.replace("applyPrefs();$('best').textContent", "window.__test={get game(){return game},get state(){return state},get held(){return held},get prefs(){return prefs},get weapon(){return weapon},update,nextWave,damageBoss,hurtPlayer,get H(){return H}};applyPrefs();$('best').textContent");
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(req.url.startsWith('/instrumented') ? instrumented : source);
});
const errors = [];
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; console.log('PASS', message); }
async function tick(page, seconds) { await page.evaluate(s => { for(let i=0;i<s*60;i++)window.__test.update(1/60); }, seconds); }
async function pointer(page, id, type, pointerId, x, y) {
  await page.dispatchEvent(id, type, { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, clientX: x || 10, clientY: y || 10, bubbles: true });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_PATH ? { executablePath: process.env.TEST_BROWSER_PATH } : {}) });
  try {
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    for (const [name, options] of [
      ['iphone-portrait', { ...devices['iPhone 13'], defaultBrowserType: 'chromium' }],
      ['android-portrait', { ...devices['Pixel 7'] }],
      ['phone-landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
      ['small-phone', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }],
      ['desktop', { viewport: { width: 1440, height: 900 } }]
    ]) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(name + ': ' + error.message));
      await page.goto(url);
      await page.screenshot({ path: path.join(root, 'test-results', name + '-menu.png') });
      await page.locator('#start').click();
      await page.waitForTimeout(1800);
      const layout = await page.evaluate(() => {
        const r = document.querySelector('#fire').getBoundingClientRect();
        const weapons=document.querySelector('.weapons').getBoundingClientRect();
        const hud=document.querySelector('.hud').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, visible: r.bottom <= innerHeight && r.top >= 0 && weapons.top>=hud.bottom, canvas: document.querySelector('canvas').height > 0 };
      });
      check(!layout.overflow && layout.visible && layout.canvas, name + ' canvas and controls fit viewport');
      await page.screenshot({ path: path.join(root, 'test-results', name + '-game.png') });
      await page.locator('#settings').click();
      const done = page.locator('#settings-done');
      await done.scrollIntoViewIfNeeded();
      check(await done.isVisible(), name + ' settings can be closed');
      await done.click();
      await page.locator('#pause').click();
      check(await page.locator('#resume').isVisible(), name + ' pause dialog opens');
      await page.locator('#resume').click();
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push('mechanics: ' + error.message));
    await page.goto(url + '/instrumented');
    await page.locator('#start').click();
    await tick(page, 2);
    // Synthetic pointers do not have browser pointer capture; use real touch via CDP below.
    const cdp = await context.newCDPSession(page);
    const fireBox = await page.locator('#fire').boundingBox();
    const arenaBox = await page.locator('#game').boundingBox();
    const fireTouch = { id: 1, x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2 };
    const moveTouch = { id: 2, x: arenaBox.x + arenaBox.width * .25, y: arenaBox.y + arenaBox.height * .85 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fireTouch, moveTouch] });
    await tick(page, .2);
    check(await page.evaluate(() => __test.held.fire.size > 0 && __test.game.shots.length > 0 && __test.game.player.x < 180), 'real multi-touch moves and fires simultaneously');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [fireTouch, { ...moveTouch, x: arenaBox.x + arenaBox.width * .75 }] });
    await tick(page, .3);
    check(await page.evaluate(() => __test.game.player.x > 300), 'drag-to-move follows finger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(await page.evaluate(() => __test.held.fire.size === 0), 'releasing touch stops fire');
    await page.locator('[data-weapon=grenade]').click();
    await page.evaluate(() => { const g=__test.game; g.cooldown=0; g.shots=[]; g.enemies=[{x:220,y:180,r:14,type:'armored',hp:3,maxHP:3},{x:270,y:180,r:14,type:'drone',hp:2,maxHP:2}]; g.player.x=g.player.target=240; __test.held.fire.add(99); });
    await tick(page, .9);
    await page.evaluate(() => __test.held.fire.clear());
    check(await page.evaluate(() => __test.game.score >= 90 && __test.game.wave === 2), 'grenade destroys adjacent enemies and advances wave');
    await tick(page, 2);
    await page.locator('[data-weapon=laser]').click();
    await page.evaluate(() => { const g=__test.game;g.enemies=[{x:240,y:120,r:14,type:'armored',hp:3,maxHP:3},{x:240,y:190,r:14,type:'drone',hp:2,maxHP:2}];g.player.x=g.player.target=240;__test.held.fire.add(99); });
    await tick(page, .2);
    check(await page.evaluate(() => __test.game.wave === 3), 'laser pierces multiple enemies');
    await page.evaluate(() => __test.held.fire.clear());
    await tick(page, 2);
    await page.evaluate(() => {const g=__test.game;g.wave=4;g.enemies=[];__test.nextWave();});
    await tick(page, 2);
    check(await page.evaluate(() => __test.game.wave===5 && __test.game.boss.hp>0 && !document.querySelector('#bossbar').hidden), 'wave five spawns boss with health bar');
    await tick(page, 2);
    check(await page.evaluate(() => __test.game.enemyShots.length>0), 'boss fires projectile patterns');
    await page.evaluate(() => {const g=__test.game;g.energy=100;g.player.x=g.player.target=g.boss.x;__test.held.fire.add(99);});
    await tick(page, .15);
    check(await page.evaluate(() => __test.game.energy<100 && __test.game.boss.hp<__test.game.boss.maxHP), 'laser damages boss and spends energy');
    await page.evaluate(() => {__test.held.fire.clear();__test.damageBoss(10000);});
    await tick(page, .1);
    check(await page.evaluate(() => __test.game.wave===6 && !__test.game.boss && __test.game.score>500), 'boss defeat awards score and continues to wave six');
    await page.locator('#pause').click();
    const pausedTime = await page.evaluate(() => __test.game.time);
    await tick(page, 3);
    check(await page.evaluate(t => __test.game.time===t, pausedTime), 'pause freezes simulation');
    await page.locator('#pause-settings').click();
    await page.locator('#hand-setting').check();
    await page.locator('#sound-setting').uncheck();
    await page.locator('#settings-done').click();
    check(await page.locator('#resume').isVisible(), 'settings opened from pause return to pause');
    await page.locator('#resume').click();
    await page.evaluate(() => {for(let i=0;i<3;i++){__test.game.player.invincible=0;__test.hurtPlayer();}});
    check(await page.locator('#retry').isVisible(), 'losing three lives opens game-over screen');
    check(await page.evaluate(() => Number(JSON.parse(localStorage.getItem('void.best'))) > 500), 'best score saved');
    await page.locator('#retry').click();
    check(await page.evaluate(() => __test.game.wave===1 && __test.game.lives===3 && __test.game.score===0), 'retry resets mission');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(150);
    check(await page.evaluate(() => Number.isFinite(__test.game.player.y) && __test.game.player.y===__test.H-32), 'orientation change preserves playable ship position');
    await page.reload();
    check(await page.evaluate(() => __test.prefs.leftHanded && !__test.prefs.sound), 'settings persist after reload');
    check(errors.length===0, 'no browser runtime errors: '+JSON.stringify(errors));
    await context.close();
    console.log('\n'+checks+' checks passed. Screenshots: test-results/');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error);server.close();process.exitCode=1; });
