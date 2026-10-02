import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'silent', server: { port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  const url = server.resolvedUrls.local[0];
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => {
    const game = window.__game;
    game.startSolo(123);
    game.run.score = 5000;
    game.endRun(false);
    game.sceneT = 2;
  });

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene === 'nameEntry', null, { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true })));
  assert.equal(await page.evaluate(() => window.__game.scene), 'nameEntry', 'holding Enter on results must not submit the default name');
  const emptyDraftCursor = await page.evaluate(() => {
    const game = window.__game;
    game.nameDraft = '';
    game.nameCursor = 0;
    game.input.menuDirEdge = 3;
    game.nameEntry();
    return game.nameCursor;
  });
  assert.equal(emptyDraftCursor, 0, 'gamepad right must keep an empty name on a valid character slot');
  await page.keyboard.type('ACE');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene === 'highscores', null, { timeout: 5000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-chomp-save-v1')));
  assert.deepEqual(saved.highScores[0], { name: 'ACE', score: 5000, tier: 0, heat: 0, won: false });
  assert.equal(saved.lastPlayerName, 'ACE');

  await page.reload();
  await page.waitForFunction(() => window.__game);
  assert.equal(await page.evaluate(() => window.__game.meta.highScores[0].name), 'ACE');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(70);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene === 'highscores', null, { timeout: 5000 });

  const runsBeforeDebug = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-chomp-save-v1')).runs);
  await page.goto(`${url}?auto=run&seed=123`);
  await page.waitForFunction(() => window.__game?.run);
  assert.equal(await page.evaluate(() => window.__game.run.cheated), true, 'debug URL runs must not enter high scores');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('neon-chomp-save-v1')).runs), runsBeforeDebug, 'debug URL runs must not save progress');
  console.log('High score UI, persistence, and debug URL checks passed.');
} finally {
  await browser.close();
  await server.close();
}
