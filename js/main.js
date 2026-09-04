'use strict';
/* ============================================================
   main.js — boot, Mode-7 renderer, camera, race manager, states
   ============================================================ */

const HORIZON_FRAC = 0.38;      // sky fraction of screen height
const CAM_H = 42;               // camera height in world units
const CAM_BACK = 132;           // camera distance behind kart
const FOG_NEAR = 430, FOG_FAR = 1450;

/* ---------- character roster ---------- */
const CHARS = [
  { id: 'bear', name: 'Bear', color: '#d87940', accent: '#f1e6c8', head: 'assets/bear_head.png', player: true, skill: 1.0 },
  { id: 'cat', name: 'Whiskers', color: '#9aa0ad', accent: '#f8a5c2', head: 'CAT', skill: 0.985 },
  { id: 'bunny', name: 'Bounce', color: '#64b5f6', accent: '#ffffff', head: 'BUNNY', skill: 0.97 },
  { id: 'panda', name: 'Bamboo', color: '#ffffff', accent: '#2d3038', head: 'PANDA', skill: 0.95 }
];

const Game = {
  difficulty: 'sport',
  paused: false,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  state: 'loading',            // loading | title | countdown | racing | finished | paused
  canvas: null,
  ctx: null,
  DW: 0, DH: 0,
  horY: 0,
  buf: null, bufCtx: null, bufImg: null, buf32: null,
  IW: 0, IH: 0,
  focD: 0,
  world32: null,
  cam: { x: 0, y: 0, a: 0 },
  race: null,
  audio: null,
  time: 0,
  lastTs: 0,
  frameEMA: 16,
  qualityTimer: 0,
  shake: 0,
  attract: true,
  bestTime: null,
  resultsShown: false,
  confetti: [],
  kartSprites: new Map(),
  boxFrames: null,
  bananaSprite: null
};

/* ================= assets ================= */
function loadAssets() {
  const jobs = CHARS.map(ch => new Promise(res => {
    if (ch.head === 'CAT') { ch.headCv = Sprites.catHead(); return res(); }
    if (ch.head === 'BUNNY') { ch.headCv = Sprites.bunnyHead(); return res(); }
    if (ch.head === 'PANDA') { ch.headCv = Sprites.pandaHead(); return res(); }
    const img = new Image();
    img.onload = () => res();
    img.onerror = () => { ch.imgEl = null; ch.headCv = Sprites.catHead(); res(); };          // keep going even if missing
    img.src = ch.head;
    ch.imgEl = img;
  }));
  jobs.push(new Promise(resolve => {
    const img = new Image();
    img.onload = () => { Game.bearRear = img; resolve(); };
    img.onerror = () => resolve();
    img.src = 'assets/bear-kart-rear.png';
  }));
  return Promise.all(jobs).then(() => {
    for (const ch of CHARS) {
      Game.kartSprites.set(ch.id,
        ch.id === 'bear' && Game.bearRear ? Game.bearRear : Scenery.rivalKart(ch));
      const head = ch.headCv || ch.imgEl;
      try { ch.avatarUrl = head?.toDataURL ? head.toDataURL() : (head?.src || ch.head); } catch (_) { ch.avatarUrl = ''; }
    }
    Game.boxFrames = Sprites.makeBoxFrames();
    Game.bananaSprite = Sprites.makeBanana();
    HUD.buildIcons();
  });
}

/* ================= sizing ================= */
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  Game.canvas.width = Math.round(w * dpr);
  Game.canvas.height = Math.round(h * dpr);
  Game.canvas.style.width = w + 'px';
  Game.canvas.style.height = h + 'px';
  Game.DW = Game.canvas.width;
  Game.DH = Game.canvas.height;
  const hf = (Game.DW < Game.DH) ? 0.47 : HORIZON_FRAC;   // taller sky in portrait
  Game.horY = Math.round(Game.DH * hf);
  Game.focD = (Game.DH - Game.horY) * 1.15;

  /* internal ground buffer */
  const targetW = Input.isTouch && Game.DW < Game.DH ? 420 : 720;
  Game.IW = Math.max(240, Math.min(960, targetW));
  Game.IH = Math.max(140, Math.round(Game.IW * (Game.DH - Game.horY) / Game.DW));
  Game.buf = document.createElement('canvas');
  Game.buf.width = Game.IW; Game.buf.height = Game.IH;
  Game.bufCtx = Game.buf.getContext('2d', { alpha: false });
  Game.bufImg = Game.bufCtx.createImageData(Game.IW, Game.IH);
  Game.buf32 = new Uint32Array(Game.bufImg.data.buffer);
}

/* ================= mode-7 ground ================= */
function renderGround(cam) {
  const IW = Game.IW, IH = Game.IH;
  const out = Game.buf32;
  const md = Game.world32;
  const cosA = Math.cos(cam.a), sinA = Math.sin(cam.a);
  const px = -sinA, py = cosA;                    // right vector
  let o = 0;

  for (let r = 0; r < IH; r++) {
    /* depth of this scanline */
    const z = (CAM_H * 1.15 * IH) / (r + 0.55);
    /* fog blend factor */
    let f = (z - FOG_NEAR) / (FOG_FAR - FOG_NEAR);
    f = f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
    const fogR = 191, fogG = 185, fogB = 153;
    const frI = ((fogR << 16) | (fogG << 8) | fogB);
    const inv = 1 - f;

    /* world position at left edge of the scanline */
    const stepX = px * z / (IH * 1.15);
    const stepY = py * z / (IH * 1.15);
    let wx = cam.x + cosA * z - px * (IW >> 1) * z / (IH * 1.15);
    let wy = cam.y + sinA * z - py * (IW >> 1) * z / (IH * 1.15);

    for (let x = 0; x < IW; x++) {
      const mx = wx | 0, my = wy | 0;
      let c;
      if (mx >= 0 && my >= 0 && mx < TRACK.WORLD && my < TRACK.WORLD) {
        c = md[(my << 11) + mx];
      } else {
        c = 0xff3f685f;                          // grass green (ABGR)
      }
      if (f > 0) {
        /* blend with fog */
        const cr = (c & 255), cg = (c >> 8) & 255, cb = (c >> 16) & 255;
        const nr = cr * inv + fogR * f | 0;
        const ng = cg * inv + fogG * f | 0;
        const nb2 = cb * inv + fogB * f | 0;
        c = 0xff000000 | (nb2 << 16) | (ng << 8) | nr;
      } else {
        c |= 0xff000000;
      }
      out[o++] = c;
      wx += stepX; wy += stepY;
    }
  }
  Game.bufCtx.putImageData(Game.bufImg, 0, 0);
}
/* ================= sky ================= */
let skyCv = null, cloudCv = null, cloudW = 0;

function buildSky() {
  const W = Game.DW, HY = Game.horY;
  skyCv = document.createElement('canvas');
  skyCv.width = W; skyCv.height = HY;
  const g = skyCv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, HY);
  sky.addColorStop(0, '#829ba0'); sky.addColorStop(.6, '#d2c9aa'); sky.addColorStop(1, '#e4c497');
  g.fillStyle = sky; g.fillRect(0, 0, W, HY);
  const glow = g.createRadialGradient(W * .73, HY * .38, 0, W * .73, HY * .38, HY * .9);
  glow.addColorStop(0, '#fff1beee'); glow.addColorStop(.12, '#fff0b899'); glow.addColorStop(1, '#ffe6a800');
  g.fillStyle = glow; g.fillRect(0, 0, W, HY);
  cloudW = Math.ceil(Math.max(W * 2, 1400));
  cloudCv = document.createElement('canvas'); cloudCv.width = cloudW; cloudCv.height = HY;
  const cg = cloudCv.getContext('2d');
  for (let layer = 0; layer < 4; layer++) {
    cg.fillStyle = ['#989d8d', '#858f7b', '#6b8066', '#4c6955'][layer];
    cg.beginPath(); cg.moveTo(0, HY);
    for (let x = 0; x <= cloudW; x += 5) {
      const t = x / cloudW * Math.PI * 2;
      const wave = Math.abs(Math.sin(t * 3 + layer) * .6 + Math.sin(t * 7 + 2) * .25 + Math.sin(t * 13) * .12);
      cg.lineTo(x, HY - HY * (.08 + wave * (.55 - layer * .12)));
    }
    cg.lineTo(cloudW, HY); cg.closePath(); cg.fill();
  }
}

function drawSky(camA) {
  const g = Game.ctx;
  g.drawImage(skyCv, 0, 0);
  if (cloudCv) {
    let off = -(camA / (Math.PI * 2)) * cloudW % cloudW;
    if (off > 0) off -= cloudW;
    for (let x = off; x < Game.DW; x += cloudW) {
      g.drawImage(cloudCv, x | 0, 0);
    }
  }
}

/* ================= sprite projection ================= */
function project(wx, wy, cam) {
  const dx = wx - cam.x, dy = wy - cam.y;
  const cosA = Math.cos(cam.a), sinA = Math.sin(cam.a);
  const depth = dx * cosA + dy * sinA;
  if (depth < 26) return null;
  const lat = -dx * sinA + dy * cosA;
  const scale = Game.focD / depth;
  return {
    x: Game.DW / 2 + lat * scale,
    y: Game.horY + CAM_H * scale,
    scale, depth
  };
}

function drawShadow(g, pr, w) {
  g.fillStyle = 'rgba(20,40,20,.35)';
  g.beginPath();
  g.ellipse(pr.x, pr.y, w * .52, w * .17, 0, 0, 7);
  g.fill();
}

function drawKartSprite(g, kart, pr, time) {
  const img = Game.kartSprites.get(kart.charId);
  if (!img) return;
  const w = pr.scale * (kart.isPlayer ? 59 : 55), h = w * img.height / img.width;
  drawShadow(g, pr, w * .85);
  g.save();
  const hop = kart.hopT > 0 ? Math.sin(kart.hopT / PHYS.HOP_TIME * Math.PI) * 10 * pr.scale : 0;
  const bounce = Game.reducedMotion ? 0 : Math.sin(time * 24) * Math.min(1, Math.abs(kart.v) / 200) * pr.scale * .35;
  g.translate(pr.x, pr.y - hop - bounce);
  // Lean around the tire contact point, never rotate a flat sprite into the road.
  const lean = Game.reducedMotion ? 0 : (kart.drifting ? kart.driftDir * .075 : kart.steerIn * .025);
  const spin = kart.spinT > 0 ? Math.cos(kart.spinT * 18) : 1;
  g.rotate(lean); g.scale(spin, 1);
  if (kart.invulnT > 0) g.globalAlpha *= .65;
  g.drawImage(img, -w / 2, -h, w, h);
  g.restore();
  if (!kart.isPlayer && pr.depth < 650 && pr.depth > 60 && (Game.state === 'racing' || Game.state === 'finished')) {
    const fs = Math.max(10 * Game.DW / window.innerWidth, pr.scale * 5);
    g.font = '600 ' + fs + 'px Arial'; g.textAlign = 'center';
    g.fillStyle = '#14241de0'; const tw = g.measureText(kart.name).width + 18;
    g.beginPath(); g.roundRect(pr.x - tw / 2, pr.y - h - fs * 2, tw, fs * 1.65, 4); g.fill();
    g.fillStyle = '#f4f1e8'; g.fillText(kart.name, pr.x, pr.y - h - fs * .8);
  }
}

/* ================= pause-aware loop guard ================= */
function raceActive() {
  return !Game.paused &&
    (Game.state === 'racing' || Game.state === 'finished' || Game.state === 'countdown');
}

/* ================= particles ================= */
class Particles {
  constructor() { this.list = []; }
  spawn(o) { this.list.push(o); }
  update(dt) {
    this.list = this.list.filter(p => {
      p.life -= dt;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      return p.life > 0;
    });
    if (this.list.length > 260) this.list.splice(0, this.list.length - 260);
  }
}
/* ================= camera ================= */
function updateCamera(dt) {
  const k = Game.race.camKart || Game.race.player;
  const cam = Game.cam;
  const tx = k.x - Math.cos(k.angle) * CAM_BACK;
  const ty = k.y - Math.sin(k.angle) * CAM_BACK;
  const s = Math.min(1, 8 * dt);
  cam.x += (tx - cam.x) * s;
  cam.y += (ty - cam.y) * s;
  let da = k.angle - cam.a;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  cam.a += da * Math.min(1, 6.5 * dt);
}

/* ================= scene ================= */
function drawScene() {
  const g = Game.ctx, race = Game.race, cam = Game.cam;
  g.save();
  if (!Game.reducedMotion && !Game.paused && Game.shake > .05) {
    g.translate((Math.random() - .5) * Game.shake, (Math.random() - .5) * Game.shake);
    Game.shake *= .86;
  }
  drawSky(cam.a);
  renderGround(cam);
  g.imageSmoothingEnabled = true;
  g.drawImage(Game.buf, 0, Game.horY, Game.DW, Game.DH - Game.horY);
  const items = [];
  const add = (o, type, range = FOG_FAR) => {
    const pr = project(o.x, o.y, cam);
    if (pr && pr.depth < range) items.push({ o, type, pr, d: pr.depth });
  };
  for (const tree of Scenery.objects) add(tree, 'scenery');
  for (const k of race.karts) add(k, 'kart');
  for (const box of race.itemBoxes) if (box.active) add(box, 'box');
  for (const b of race.bananas) add(b, 'banana');
  for (const p of race.particles.list) add(p, 'part');
  // All world objects share one depth order; rivals can no longer cover Bear from behind.
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    const { o, pr, type } = it;
    const alpha = 1 - Math.min(1, Math.max(0, (it.d - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
    g.globalAlpha = alpha;
    if (type === 'kart') drawKartSprite(g, o, pr, Game.time);
    else if (type === 'scenery') {
      const h = pr.scale * o.height, w = h * o.sprite.width / o.sprite.height;
      if (pr.x + w / 2 >= 0 && pr.x - w / 2 <= Game.DW) g.drawImage(o.sprite, pr.x - w / 2, pr.y - h, w, h);
    } else if (type === 'box') {
      const frame = Game.boxFrames[(Game.time * 10 + o.phase * 5 | 0) % Game.boxFrames.length];
      const size = pr.scale * 29;
      drawShadow(g, pr, size);
      g.drawImage(frame, pr.x - size / 2, pr.y - size * 1.35 - Math.sin(Game.time * 3 + o.phase) * pr.scale * 2, size, size);
    } else if (type === 'banana') {
      const size = pr.scale * 22; drawShadow(g, pr, size);
      g.drawImage(Game.bananaSprite, pr.x - size / 2, pr.y - size * .95, size, size);
    } else {
      g.globalAlpha *= Math.min(1, o.life / o.fade);
      g.fillStyle = o.color; g.beginPath();
      g.arc(pr.x, pr.y - pr.scale * (o.z || 0), Math.min(22, Math.max(1.5, pr.scale * o.size)), 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  const shade = g.createLinearGradient(0, Game.DH * .6, 0, Game.DH);
  shade.addColorStop(0, '#0c1b1400'); shade.addColorStop(1, '#0c1b1455');
  g.fillStyle = shade; g.fillRect(0, Game.DH * .6, Game.DW, Game.DH * .4);
  g.restore();
}

/* ================= game states ================= */
function showEl(id, on) {
  document.getElementById(id).classList.toggle('hidden', !on);
}

function startRace(withPlayer) {
  clearTimeout(Game.goTimer);
  Game.paused = false;
  Game.finishDelay = null;
  Game.shake = 0;
  Input.reset();
  document.activeElement?.blur();
  showEl('pause-screen', false);
  showEl('results-screen', false);
  showEl('countdown', false);
  document.getElementById('countdown').style.animationPlayState = 'running';
  Game.attract = !withPlayer;
  Game.race = new Race(withPlayer, Game.audio);
  Game.race.frozen = !withPlayer ? false : true;
  const k0 = Game.race.player;
  Game.cam.x = k0.x - Math.cos(k0.angle) * CAM_BACK;
  Game.cam.y = k0.y - Math.sin(k0.angle) * CAM_BACK;
  Game.cam.a = k0.angle;
  Game.resultsShown = false;
  Game.isNewRecord = false;
  Game.confetti = [];

  if (withPlayer) {
    Game.state = 'countdown';
    Game.countdownT = 3.9;
    Game.lastCount = null;
    showEl('title-screen', false);
    showEl('touch-controls', Input.isTouch);
    showEl('btn-pause', true);
    Game.audio.stopMusic();
  } else {
    Game.state = 'racing';           // attract demo
    showEl('btn-pause', false);
  }
}

function updateCountdown(dt) {
  Game.countdownT -= dt;
  const el = document.getElementById('countdown');
  let label = null;
  if (Game.countdownT > 3) label = '';
  else if (Game.countdownT > 2) label = '3';
  else if (Game.countdownT > 1) label = '2';
  else if (Game.countdownT > 0) label = '1';
  else if (Game.countdownT > -0.8) label = 'GO!';

  if (label !== Game.lastCount) {
    Game.lastCount = label;
    if (label) {
      el.textContent = label;
      el.classList.remove('hidden', 'pop');
      void el.offsetWidth;                    // restart animation
      el.classList.add('pop');
      if (label === 'GO!') {
        Game.audio.play('go');
        Game.race.frozen = false;
        Game.state = 'racing';
        Game.audio.startMusic();
        /* rocket start */
        if (Input.gasHeld) {
          Game.race.player.boostT = Math.max(Game.race.player.boostT, .9);
          Game.race.msg('ROCKET START!', '#ff7043');
          Game.audio.play('boost');
        }
        Game.goTimer = setTimeout(() => el.classList.add('hidden'), 850);
      } else if (label === '3' || label === '2' || label === '1') {
        Game.audio.play('countA');
      }
    } else {
      el.classList.add('hidden');
    }
  }
}

function onPlayerFinish() {
  Game.state = 'finished';
  Game.finishDelay = 1.6;
  saveBest();
}

Game.onPlayerFinish = onPlayerFinish;

function buildResults() {
  const list = document.getElementById('results-list');
  const race = Game.race;
  const rows = [...race.karts].sort((a, b) => a.rank - b.rank);
  const meWon = race.player.rank === 1;
  document.getElementById('results-title').textContent =
    meWon ? 'Top dog.' : 'Nice run, Bear.';
  // Result refresh must not repeatedly trigger a sound.

  let html = '<table>';
  for (const k of rows) {
    const ch = CHARS.find(c => c.id === k.charId);
    const url = ch?.avatarUrl || (ch?.imgEl ? ch.imgEl.src : '');
    html += `<tr class="${k.isPlayer ? 'me' : ''}">
      <td class="pos">${k.rank}</td>
      <td style="width:44px">${url ? `<img src="${url}" width="36" height="36" style="border-radius:50%;object-fit:cover;background:#fff">` : ''}</td>
      <td>${k.name}${k.isPlayer ? ' (You)' : ''}</td>
      <td style="text-align:right">${k.finished ? HUD.fmtTime(k.finishTime) : 'racing…'}</td>
    </tr>`;
  }
  html += '</table>';
  const laps = race.player.lapTimes;
  if (laps.length) html += '<div class="results-sub">FASTEST LAP ' + HUD.fmtTime(Math.min(...laps)) + ' · ' + race.difficulty.toUpperCase() + '</div>';
  if (Game.bestTime != null) {
    const isNew = !!Game.isNewRecord;
    const prefix = isNew ? '★ NEW ' : '';
    html += `<div class="results-sub${isNew ? ' record-sub' : ''}">${prefix}${race.difficulty.toUpperCase()} RECORD · ${HUD.fmtTime(Game.bestTime)}</div>`;
  }
  list.innerHTML = html;
}

function saveBest() {
  const t = Game.race?.player?.finishTime;
  if (t == null) return;
  if (Game.bestTime == null || t < Game.bestTime) {
    Game.bestTime = t;
    Game.isNewRecord = true;
    try { localStorage.setItem('bk_best_' + Game.race.difficulty, String(t)); } catch (e) { }
  }
}
/* ================= main loop ================= */
function tick(ts) {
  requestAnimationFrame(tick);
  if (!Game.race) return;
  let dt = (ts - Game.lastTs) / 1000;
  Game.lastTs = ts;
  if (!dt || dt <= 0) return;
  dt = Math.min(dt, 0.05);
  if (!Game.paused) Game.time += dt;
  if (Game.state === 'title') return;

  /* adaptive internal resolution */
  Game.frameEMA = Game.frameEMA * .95 + (dt * 1000) * .05;
  Game.qualityTimer += dt;
  if (Game.qualityTimer > 2.5 && !Input.isTouch) {
    Game.qualityTimer = 0;
    const g = document.getElementById('game');
    if (Game.frameEMA > 23 && Game.IW > 420) {
      Game.IW = Math.max(420, Math.round(Game.IW * 0.85));
      rebuildBuffer();
    } else if (Game.frameEMA < 17.5 && Game.IW < 900) {
      Game.IW = Math.min(900, Math.round(Game.IW * 1.12));
      rebuildBuffer();
    }
  }

  if (!Game.paused && Game.state === 'countdown') updateCountdown(dt);
  if (raceActive()) {
    if (Game.state === 'racing' || Game.state === 'finished') {
      Game.race.update(dt);
      Game.race.updateItems(dt);
    }
    updateCamera(dt);
  }

  if (!Game.paused && Game.finishDelay != null) {
    Game.finishDelay -= dt;
    if (Game.finishDelay <= 0) {
      Game.finishDelay = null;
      buildResults(); Game.resultsShown = true;
      showEl('results-screen', true); showEl('touch-controls', false);
      showEl('btn-pause', false);
      Game.audio.stopMusic();
      document.getElementById('btn-again').focus();
    }
  }

  /* engine sound */
  {
    const p = Game.race.player;
    const racing = raceActive() && (Game.state !== 'countdown');
    Game.audio.engine(
      racing ? Math.min(1, Math.abs(p.v) / PHYS.MAX_SPEED) : 0,
      raceActive() && !Game.resultsShown
    );
    Game.audio.skid(racing && p.drifting ? 0.11 : 0);
  }

  /* results live refresh */
  if (Game.resultsShown &&
      (Game._resRefresh = (Game._resRefresh || 0) + dt) > 0.7) {
    Game._resRefresh = 0;
    buildResults();
    saveBest();
  }

  renderFrame();
}

function renderFrame() {
  const g = Game.ctx;
  drawScene();
  if (Game.state !== 'title') HUD.draw(g, Game.DW, Game.DH, Game.race, Game.time);
  drawConfetti(g);
}

function drawConfetti(g) {
  if (!Game.resultsShown || Game.reducedMotion || Game.paused) return;
  if (Game.race?.player?.rank !== 1) return;
  if (Game.confetti.length < 90 && Math.random() < .3) {
    Game.confetti.push({
      x: Math.random() * Game.DW,
      y: -20,
      vx: (Math.random() - .5) * 60,
      vy: 120 + Math.random() * 160,
      rot: Math.random() * 7,
      vr: (Math.random() - .5) * 6,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 5,
      color: ['#ffd93d', '#ff7043', '#7ec8ff', '#f48fb1', '#9ae66e'][(Math.random() * 5) | 0],
      life: 4
    });
  }
  Game.confetti = Game.confetti.filter(c => c.life > 0 && c.y < Game.DH + 30);
  for (const c of Game.confetti) {
    c.life -= 1 / 60; c.x += c.vx / 60; c.y += c.vy / 60; c.rot += c.vr / 60;
    g.save();
    g.translate(c.x, c.y); g.rotate(c.rot);
    g.globalAlpha = Math.min(1, c.life);
    g.fillStyle = c.color;
    g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    g.restore();
  }
  g.globalAlpha = 1;
}

function rebuildBuffer() {
  Game.IH = Math.max(140, Math.round(Game.IW *
    (Game.DH - Game.horY) / Game.DW));
  Game.buf.width = Game.IW; Game.buf.height = Game.IH;
  Game.bufCtx = Game.buf.getContext('2d', { alpha: false });
  Game.bufImg = Game.bufCtx.createImageData(Game.IW, Game.IH);
  Game.buf32 = new Uint32Array(Game.bufImg.data.buffer);
}
/* ================= boot & wiring ================= */
async function boot() {
  Game.canvas = document.getElementById('game');
  Game.ctx = Game.canvas.getContext('2d');
  Input.init();
  Game.audio = new AudioSys();
  try {
    const muteVal = localStorage.getItem('bk_mute') ?? localStorage.getItem('pk_mute');
    Game.audio.muted = muteVal === '1';
    const difficulty = localStorage.getItem('bk_difficulty');
    if (['cruise', 'sport', 'expert'].includes(difficulty)) Game.difficulty = difficulty;
  } catch (e) {}
  setDifficulty(Game.difficulty);
  updateMuteLabel();
  for (const [button, dialog] of [['btn-guide', 'guide-dialog'], ['btn-bear', 'bear-dialog']]) {
    const el = document.getElementById(dialog);
    document.getElementById(button).addEventListener('click', () => { Input.reset(); el.showModal(); });
    el.querySelector('.dialog-close').addEventListener('click', () => el.close());
    el.addEventListener('click', e => { if (e.target === el) { const r = el.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) el.close(); } });
  }
  document.querySelectorAll('[data-difficulty]').forEach(el => el.addEventListener('click', () => setDifficulty(el.dataset.difficulty)));
  const begin = () => { if (Game.state === 'loading') return; Game.audio.init(); startRace(true); };
  document.getElementById('btn-start').addEventListener('click', begin);
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', begin);
  document.getElementById('btn-again').addEventListener('click', begin);
  document.getElementById('btn-quit').addEventListener('click', goTitle);
  document.getElementById('btn-title').addEventListener('click', goTitle);
  document.getElementById('btn-mute').addEventListener('click', toggleMute);
  document.getElementById('btn-menu-mute').addEventListener('click', toggleMute);
  Input.onPause = togglePause;
  Input.onConfirm = () => { if (!Game.paused && (Game.state === 'title' || Game.resultsShown)) begin(); };
  Input.onMuteToggle = toggleMute;
  Input.onRespawn = () => {
    if (Game.state === 'racing' && !Game.paused && !Game.race.player.finished) {
      Game.race.player.respawn(); Game.race.msg('BACK ON TRACK', '#dbe0c6');
    }
  };
  const autoPause = () => {
    Input.reset();
    if (!Game.paused && !Game.resultsShown && ['racing', 'countdown', 'finished'].includes(Game.state)) togglePause();
  };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  // Keep keyboard focus in the visible modal panel.
  document.addEventListener('keydown', e => {
    const panel = Game.paused ? 'pause-screen' : Game.resultsShown ? 'results-screen' : null;
    if (e.code !== 'Tab' || !panel) return;
    const nodes = [...document.getElementById(panel).querySelectorAll('button,input')];
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (!nodes.includes(document.activeElement)) {
      first.focus(); e.preventDefault();
    } else if (e.shiftKey && document.activeElement === first) {
      last.focus(); e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus(); e.preventDefault();
    }
  });
  await loadAssets();
  const wd = TRACK.canvas.getContext('2d').getImageData(0, 0, TRACK.WORLD, TRACK.WORLD);
  Game.world32 = new Uint32Array(wd.data.buffer);
  resize(); buildSky(); drawTrackPreview();
  window.addEventListener('resize', () => { resize(); buildSky(); });
  startRace(false);
  Game.state = 'title';
  showEl('title-screen', true);
  document.getElementById('btn-start').disabled = false;
  document.getElementById('start-label').textContent = 'LET’S RACE';
  document.getElementById('load-status').textContent = 'Ready to race.';
  Game.lastTs = performance.now();
  requestAnimationFrame(tick);
}

function setDifficulty(value) {
  Game.difficulty = value;
  const text = { cruise: 'Easy pace. Find your racing line.', sport: 'A little speed. A little competition.', expert: 'Faster karts. Rivals that mean business.' };
  document.querySelectorAll('[data-difficulty]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.difficulty === value)));
  document.getElementById('difficulty-description').textContent = text[value];
  Game.bestTime = null;
  try {
    localStorage.setItem('bk_difficulty', value);
    const raw = localStorage.getItem('bk_best_' + value);
    const saved = Number(raw);
    if (raw !== null && Number.isFinite(saved) && saved > 0) Game.bestTime = saved;
  } catch (e) {}
  document.getElementById('best-record').textContent = Game.bestTime ? value.toUpperCase() + ' RECORD / ' + HUD.fmtTime(Game.bestTime) : 'YOUR NEXT FAVORITE RACE.';
}

function drawTrackPreview() {
  const cv = document.getElementById('track-preview'), g = cv.getContext('2d');
  const b = TRACK.getBounds(), scale = Math.min(210 / (b.x1 - b.x0), 120 / (b.y1 - b.y0));
  const ox = (240 - (b.x1 - b.x0) * scale) / 2, oy = (150 - (b.y1 - b.y0) * scale) / 2;
  g.clearRect(0, 0, 240, 150); g.beginPath();
  TRACK.minimapPath.forEach((p, i) => { const x = ox + (p.x - b.x0) * scale, y = oy + (p.y - b.y0) * scale; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.closePath(); g.lineJoin = 'round'; g.strokeStyle = '#d2d9be'; g.lineWidth = 5; g.stroke();
  const p = TRACK.samples[0]; g.fillStyle = '#ed7b40'; g.beginPath(); g.arc(ox + (p.x - b.x0) * scale, oy + (p.y - b.y0) * scale, 6, 0, 7); g.fill();
}

function togglePause() {
  if (!Game.race || !['racing', 'countdown', 'finished'].includes(Game.state) || Game.resultsShown) return;
  Game.paused = !Game.paused;
  Input.reset(); showEl('pause-screen', Game.paused);
  showEl('touch-controls', Input.isTouch && !Game.paused);
  const count = document.getElementById('countdown');
  count.style.animationPlayState = Game.paused ? 'paused' : 'running';
  if (Game.paused) {
    Game.audio.stopMusic(); Game.audio.engine(0, false); Game.audio.skid(0);
    document.getElementById('btn-resume').focus();
  } else {
    document.activeElement?.blur();
    if (Game.state === 'racing') Game.audio.startMusic();
  }
}
function toggleMute() {
  Game.audio.init(); Game.audio.setMuted(!Game.audio.muted);
  try {
    const val = Game.audio.muted ? '1' : '0';
    localStorage.setItem('bk_mute', val);
    localStorage.setItem('pk_mute', val);
  } catch (e) {}
  updateMuteLabel();
}
function updateMuteLabel() {
  const muted = Game.audio.muted;
  document.getElementById('btn-mute').textContent = muted ? 'Sound: Off' : 'Sound: On';
  const button = document.getElementById('btn-menu-mute');
  button.textContent = muted ? 'Sound off' : 'Sound on';
  button.setAttribute('aria-pressed', String(muted));
  button.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}
function goTitle() {
  startRace(false);
  Game.state = 'title';
  showEl('touch-controls', false); showEl('title-screen', true);
  Game.audio.stopMusic(); Game.audio.engine(0, false); Game.audio.skid(0);
  setDifficulty(Game.difficulty);
  document.getElementById('btn-start').focus();
}
window.addEventListener('load', () => boot().catch(error => {
  console.error('Unable to prepare Bear Kart:', error);
  document.getElementById('start-label').textContent = 'RELOAD TO TRY AGAIN';
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-start').addEventListener('click', () => window.location.reload(), { once: true });
  document.getElementById('load-status').textContent = 'The game could not load. Please reload the page.';
}));
