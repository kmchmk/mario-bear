// Dependency-free logic checks. Canvas/DOM are stubs; this is not visual QA.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML IDs must be unique');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { style: {}, dataset: {}, classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: n => classes.has(n),
      toggle: (n, force) => force ? classes.add(n) : classes.delete(n)
    }, addEventListener() {}, focus() {}, blur() {}, setAttribute() {}, querySelectorAll: () => [],
    getContext: () => context2d, width: 240, height: 150 });
  }
  return elements.get(id);
}
const gradient = { addColorStop() {} };
const context2d = new Proxy({}, { get(target, prop) {
  if (prop === 'getImageData' || prop === 'createImageData') return (...args) => {
    const [w, h] = args.length === 4 ? args.slice(2) : args;
    return { data: new Uint8ClampedArray(w * h * 4) };
  };
  if (prop === 'measureText') return t => ({ width: t.length * 8 });
  if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
  return target[prop] || (() => {});
}, set(target, prop, value) { target[prop] = value; return true; } });
const storage = new Map();
const box = vm.createContext({ console, Math, Uint8ClampedArray, Uint32Array,
  setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame() {}, performance: { now: () => 0 },
  window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, addEventListener() {}, matchMedia: () => ({ matches: false }) },
  navigator: { maxTouchPoints: 0 }, Path2D: class { moveTo() {} lineTo() {} closePath() {} },
  document: { activeElement: { blur() {} }, getElementById: element, createElement: () => element('canvas-' + Math.random()), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (k, v) => storage.set(k, v) }
});
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const file of scripts) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of source.matchAll(/getElementById\('([^']+)'\)/g)) assert(ids.includes(m[1]), `${file}: missing #${m[1]}`);
  vm.runInContext(source, box, { filename: file });
}
for (const m of html.matchAll(/(?:src|href)="((?:assets|css|js)\/[^"?#]+)"/g)) assert(fs.existsSync(path.join(root, m[1])), `Missing asset ${m[1]}`);
const run = code => vm.runInContext(code, box);
run(`Game.audio = { play() {}, stopMusic() {}, startMusic() {}, engine() {}, skid() {}, init() {}, setMuted(m) { this.muted = m; }, muted: false }; TRACK.surfaceAt = () => TRACK.ROAD;`);
run('var originalRenderFrame = renderFrame;');
function test(name, fn) { fn(); console.log('PASS ' + name); }
test('Restart clears pause, held inputs, and old results', () => {
  run(`Game.paused = true; Input.keys.KeyW = true; Input.touch.left = true; Input.itemQueue.push(1); Game.resultsShown = true; startRace(true);`);
  assert.equal(run('Game.paused'), false);
  assert.equal(run('Game.state'), 'countdown');
  assert.equal(run('Game.resultsShown'), false);
  assert.equal(run('Input.left || Input.keys.KeyW || Input.itemQueue.length > 0'), false);
});
test('Pause freezes countdown and resume restarts it', () => {
  run(`renderFrame = () => {}; Game.lastTs = 1000; Game.paused = true; tick(1020);`);
  assert.equal(run('Game.countdownT'), 3.9);
  run(`Game.paused = false; tick(1040);`);
  assert(run('Game.countdownT') < 3.9);
});
test('Grid crossing starts lap one; exactly three full laps finish', () => {
  run(`startRace(true); Game.race.frozen = false;
    function advance(n, direction = 1) {
      const p = Game.race.player;
      for (let i = 0; i < n; i++) {
        const idx = (p.idx + direction + TRACK.NS) % TRACK.NS, point = TRACK.samples[idx];
        p.x = point.x; p.y = point.y; p.angle = point.a; p.v = 0;
        Game.race.time += .02; p.update(0, Game.race);
      }
    }
    advance(TRACK.NS - Game.race.player.idx);`);
  assert.equal(run('Game.race.player.lap'), 1);
  assert.equal(run('Game.race.player.finished'), false);
  run('advance(TRACK.NS * 2)');
  assert.equal(run('Game.race.player.lap'), 3);
  assert.equal(run('Game.race.player.finished'), false);
  run('advance(TRACK.NS)');
  assert.equal(run('Game.race.player.finished'), true);
  assert.equal(run('Game.race.player.lapTimes.length'), 3);
  assert.equal(run('Game.state'), 'finished');
  assert(storage.has('bk_best_sport'));
});
test('Reversing over the start line cannot award a lap', () => {
  run(`startRace(true); advance(TRACK.NS - Game.race.player.idx); advance(5, -1); advance(7);`);
  assert.equal(run('Game.race.player.lap'), 1);
  assert.equal(run('Game.race.player.checkpoints'), 1);
});
test('Missed checkpoint can be recovered by recrossing, without a phantom lap', () => {
  run(`startRace(true); advance(TRACK.NS - Game.race.player.idx); advance(Math.ceil(TRACK.NS / 4) - 3);
    const pMiss = Game.race.player;
    for (let i = 0; i < 8; i++) {
      const pos = TRACK.samples[(pMiss.idx + 1) % TRACK.NS];
      pMiss.x = pos.x - Math.sin(pos.a) * 110; pMiss.y = pos.y + Math.cos(pos.a) * 110;
      pMiss.update(0, Game.race);
    }
    advance(12, -1); advance(18);`);
  assert.equal(run('Game.race.player.checkpoints'), 2);
  assert.equal(run('Game.race.player.lap'), 1);
});
test('Held inventory is not overwritten by another pickup', () => {
  run(`startRace(true); const pItem = Game.race.player; pItem.item = 'triple'; pItem.itemCount = 2;
    Game.race.itemBoxes = [{ x: pItem.x, y: pItem.y, active: true }]; Game.race.updateItems(0);`);
  assert.equal(run('Game.race.player.item'), 'triple');
  assert.equal(run('Game.race.player.itemCount'), 2);
  assert.equal(run('Game.race.itemBoxes[0].active'), true);
});
test('Drift charges and releases a mini-turbo', () => {
  run(`const pDrift = Game.race.player; pDrift.drifting = true; pDrift.driftCharge = PHYS.MINI_T2; pDrift.releaseDrift(Game.race);`);
  assert.equal(run('Game.race.player.boostT'), run('PHYS.MT2_BOOST'));
  assert.equal(run('Game.race.player.drifting'), false);
});
test('Throttle recovers from reverse', () => {
  run(`Game.race.frozen = false; const reverse = Game.race.player; reverse.v = -100; reverse.gasIn = true; reverse.brakeIn = false; reverse.update(.05, Game.race);`);
  assert(run('Game.race.player.v') > -100);
});
test('Difficulty changes actual rival speed and separates records', () => {
  run(`setDifficulty('cruise'); startRace(true); var easy = Game.race.karts[1].speedMul;
    setDifficulty('expert'); startRace(true); var hard = Game.race.karts[1].speedMul;`);
  assert(run('hard > easy'));
  assert.equal(run('Game.bestTime'), null);
});
test('Autopilot and every rival complete all three laps in each difficulty', () => {
  for (const difficulty of ['cruise', 'sport', 'expert']) {
    run(`setDifficulty('${difficulty}'); startRace(true); Game.race.frozen = false; Game.attract = true;
      for (let frame = 0; frame < 18000 && Game.race.karts.some(k => !k.finished); frame++) {
        Game.time += 1 / 60; Game.race.update(1 / 60); Game.race.updateItems(1 / 60);
      }`);
    const summary = run('JSON.stringify(Game.race.karts.map(k => ({name:k.name,lap:k.lap,finished:k.finished,time:k.finishTime})))');
    assert(run('Game.race.karts.every(k => k.finished)'), difficulty + ': ' + summary);
  }
});
test('Renderer executes at desktop, portrait, and landscape sizes', () => {
  run(`Game.canvas = document.createElement('canvas'); Game.ctx = Game.canvas.getContext('2d');
    Game.world32 = new Uint32Array(TRACK.WORLD * TRACK.WORLD);
    Game.boxFrames = Sprites.makeBoxFrames(); Game.bananaSprite = Sprites.makeBanana(); HUD.buildIcons();
    for (const ch of CHARS) Game.kartSprites.set(ch.id, Scenery.rivalKart(ch));`);
  for (const [w, h, touch] of [[1440, 900, false], [390, 844, true], [844, 390, true]]) {
    run(`window.innerWidth = ${w}; window.innerHeight = ${h}; Input.isTouch = ${touch};
      resize(); buildSky(); startRace(true); originalRenderFrame();
      Game.race.player.drifting = true; Game.race.player.driftCharge = 2;
      Game.race.player.boostT = 1; Game.race.msg('BOOST', '#ed7b40'); originalRenderFrame();`);
  }
});
test('Storage denial does not break touch input initialization', () => {
  run(`localStorage.getItem = () => { throw new Error('denied'); }; Input.isTouch = true; Input.init();`);
  assert.equal(run('Input.autoGas'), true);
  box.localStorage.getItem = key => storage.get(key) ?? null;
});
test('Roulette fast-stops immediately on item input', () => {
  run(`startRace(true); const p = Game.race.player; p.pendingItem = 'bone'; p.rouletteT = 1.0; Input.itemQueue.push(1); Game.race.update(0.016);`);
  assert.equal(run('Game.race.player.rouletteT'), 0);
});
test('Resuming pause while finished does not restart racing music', () => {
  run(`startRace(true); Game.state = 'finished'; Game.paused = true; var musicPlayed = false; Game.audio.startMusic = () => { musicPlayed = true; }; togglePause();`);
  assert.equal(run('musicPlayed'), false);
  assert.equal(run('Game.paused'), false);
});
test('Timing format ensures 2-digit minute padding for monospace alignment', () => {
  assert.equal(run('HUD.fmtTime(5.23)'), '00:05.23');
  assert.equal(run('HUD.fmtTime(65.23)'), '01:05.23');
});
test('Dual-key storage persists both Bear Kart (bk_) and legacy (pk_) preferences', () => {
  run(`toggleMute();`);
  assert.equal(run('localStorage.getItem("bk_mute")'), run('localStorage.getItem("pk_mute")'));
});
console.log('All logic and local asset checks passed. Browser rendering, audio, and play feel are not covered.');
