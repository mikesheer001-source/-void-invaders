# Void Invaders

A complete touch-first Space Invaders game in one self-contained `index.html`.
No build step, external assets, account, or keyboard required.

## Play

Open `index.html` in a modern browser, or publish the repository with GitHub Pages.
On a phone, use Safari or Chrome in portrait or landscape.

- Drag anywhere on the game field to move, or hold the left/right buttons.
- Hold **FIRE** while moving. Multiple fingers are supported.
- **Pulse:** unlimited rapid shots.
- **Grenade:** limited charges, area damage, and nearby projectile clearing.
- **Laser:** piercing beam with energy that recharges while idle.
- Weapon charges replenish between waves. Defeat a boss every five waves to restore one life.
- Scouts fire aimed shots; drones have extra health; armored enemies need three pulse hits.
- Collect repair and weapon pickups. Score, wave, hull, and boss health appear on screen.
- Pause or adjust sound, effects, handedness, sensitivity, and difficulty. Best score and settings save on your device.
- Switching away from the browser automatically pauses the mission.

Optional desktop controls: **A/D** or **←/→** to move, **Space/J** to fire,
**1/2/3** to change weapons, and **P/Esc** to pause/resume.

## GitHub Pages

In repository **Settings → Pages**, choose **Deploy from a branch**, then
**main** and **/(root)**, and save. The expected address is:

https://mikesheer001-source.github.io/-void-invaders/

## Verify

Only development tests need Node and Playwright:

```sh
npm install
npx playwright install chromium
npm test
```

The suite tests phone and desktop viewports, simultaneous touch movement and firing,
dragging, all weapon mechanics, boss spawning and attacks, wave progression,
pause/settings behavior, life loss, retry, rotation, and local persistence.
It saves screenshots under the ignored `test-results/` directory and fails on browser runtime errors.
Device presets emulate viewport and touch input; they are not physical iOS/Android device tests.
Optional environment variables `TEST_BROWSER_PATH` and `PLAYWRIGHT_PATH` allow using existing installations.

The game uses Canvas 2D, Pointer Events, Web Audio, and localStorage. It still runs
when storage is unavailable; saving settings and best score then remains unavailable.
