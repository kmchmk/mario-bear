'use strict';
/* ============================================================
   main.js — boot, Mode-7 renderer, camera, race manager, states
   ============================================================ */

const HORIZON_FRAC = 0.42;      // sky fraction of screen height
const CAM_H = 46;               // camera height in world units
const CAM_BACK = 108;           // camera distance behind kart
const FOG_NEAR = 300, FOG_FAR = 900;

/* ---------- character roster ---------- */
const CHARS = [
  { id: 'bear', name: 'Bear', color: '#e53935', accent: '#ffd93d', head: 'assets/bear_head.png', player: true, skill: 1.0 },
  { id: 'cat', name: 'Whiskers', color: '#9aa0ad', accent: '#f8a5c2', head: 'CAT', skill: 0.985 },
  { id: 'bunny', name: 'Bounce', color: '#64b5f6', accent: '#ffffff', head: 'BUNNY', skill: 0.97 },
  { id: 'panda', name: 'Bamboo', color: '#ffffff', accent: '#2d3038', head: 'PANDA', skill: 0.95 }
];

const Game = {
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
    img.onerror = () => res();          // keep going even if missing
    img.src = ch.head;
    ch.imgEl = img;
  }));
  return Promise.all(jobs).then(() => {
    for (const ch of CHARS) {
      Game.kartSprites.set(ch.id,
        Sprites.makeKart(ch.headCv || ch.imgEl, ch.color, ch.accent));
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
  const targetW = Input.isTouch && Game.DW < Game.DH ? 330 : 430;
  Game.IW = Math.max(240, Math.min(560, targetW));
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
    const fogR = 168, fogG = 216, fogB = 255;
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
        c = 0xff3ca85a;                          // grass green (ABGR)
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
  skyCv.width = Math.max(2, W); skyCv.height = Math.max(2, HY);
  const g = skyCv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, HY);
  grd.addColorStop(0, '#5fb8f2');
  grd.addColorStop(.65, '#a8dcff');
  grd.addColorStop(1, '#e8f7ff');
  g.fillStyle = grd; g.fillRect(0, 0, W, HY);

  /* sun */
  const sx = W * .78, sy = HY * .26;
  const sg = g.createRadialGradient(sx, sy, 4, sx, sy, HY * .34);
  sg.addColorStop(0, 'rgba(255,246,190,.95)');
  sg.addColorStop(.25, 'rgba(255,238,150,.55)');
  sg.addColorStop(1, 'rgba(255,238,150,0)');
  g.fillStyle = sg;
  g.beginPath(); g.arc(sx, sy, HY * .34, 0, 7); g.fill();
  g.fillStyle = '#fff8cf';
  g.beginPath(); g.arc(sx, sy, HY * .085, 0, 7); g.fill();

  /* rotating backdrop: clouds + hills (drawn into a wide strip) */
  cloudW = Math.max(W * 1.6, 900);
  cloudCv = document.createElement('canvas');
  cloudCv.width = cloudW; cloudCv.height = Math.max(2, HY);
  const cg = cloudCv.getContext('2d');

  /* hills along the bottom */
  cg.fillStyle = '#79b563';
  cg.beginPath();
  cg.moveTo(0, HY);
  for (let x = 0; x <= cloudW; x += 8) {
    const t = x / cloudW * Math.PI * 2;
    const y = HY - 18 -
      Math.abs(Math.sin(t * 3) * 22 + Math.sin(t * 7) * 10);
    cg.lineTo(x, y);
  }
  cg.lineTo(cloudW, HY); cg.closePath(); cg.fill();
  cg.fillStyle = '#8cc774';
  cg.beginPath();
  cg.moveTo(0, HY);
  for (let x = 0; x <= cloudW; x += 8) {
    const t = x / cloudW * Math.PI * 2;
    const y = HY - 10 - Math.abs(Math.sin(t * 5 + 2) * 12);
    cg.lineTo(x, y);
  }
  cg.lineTo(cloudW, HY); cg.closePath(); cg.fill();

  /* puffy clouds */
  function puff(x, y, s) {
    cg.fillStyle = 'rgba(255,255,255,.92)';
    cg.beginPath();
    cg.arc(x, y, 16 * s, 0, 7);
    cg.arc(x + 15 * s, y - 9 * s, 19 * s, 0, 7);
    cg.arc(x + 33 * s, y, 15 * s, 0, 7);
    cg.arc(x + 16 * s, y + 7 * s, 17 * s, 0, 7);
    cg.fill();
  }
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i++) {
    puff(rnd() * cloudW, 12 + rnd() * (HY * .45), .7 + rnd() * .9);
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
  const img = Game.kartSprites.get(kart.charId) || [...Game.kartSprites.values()][0];
  const w = pr.scale * 62;
  drawShadow(g, pr, w);

  g.save();
  g.translate(pr.x, pr.y - pr.scale * 2);
  /* base sprite faces +x; rotate into view (rel 0 => nose points up-screen) */
  const relA = kart.spinT > 0
    ? (1.05 - kart.spinT) / 1.05 * Math.PI * 4
    : kart.angle - Game.cam.a;
  g.rotate(relA - Math.PI / 2);
  if (kart.invulnT > 0 && (time * 14 | 0) % 2 === 0) g.globalAlpha = .35;
  const bounce = Math.abs(Math.sin(time * 21)) * pr.scale *
    (Math.abs(kart.v) > 30 ? 1.6 : 0);
  g.translate(0, -bounce);
  g.drawImage(img, -w / 2, -w * (img.height / img.width) / 2 - w * .06,
    w, w * (img.height / img.width));
  g.restore();

  /* drift sparks & boost flames drawn in world space already via particles */

  /* name tag for rivals close by */
  if (!kart.isPlayer && pr.depth < 420 && pr.depth > 60) {
    g.font = `700 ${Math.max(11, pr.scale * 5.2) | 0}px Trebuchet MS`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.strokeStyle = 'rgba(20,26,38,.75)';
    g.lineWidth = 3;
    const ty = pr.y - w * (img.height / img.width) - 8 * pr.scale * .12 - 6;
    g.strokeText(kart.name, pr.x, ty);
    g.fillText(kart.name, pr.x, ty);
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
  draw(g, cam, time) {
    const sorted = [];
    for (const p of this.list) {
      const pr = project(p.x, p.y, cam);
      if (!pr || pr.depth > FOG_FAR * 1.2) continue;
      sorted.push({ p, pr });
    }
    sorted.sort((a, b) => b.pr.depth - a.pr.depth);
    for (const { p, pr } of sorted) {
      const r = Math.max(1.5, pr.scale * p.size);
      g.globalAlpha = Math.min(1, p.life / p.fade);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(pr.x, pr.y - pr.scale * (p.z || 0), r, 0, 7);
      g.fill();
      g.globalAlpha = 1;
    }
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
  const g = Game.ctx;
  const race = Game.race;
  const cam = Game.cam;

  /* screen shake */
  g.save();
  if (Game.shake > 0.05) {
    g.translate((Math.random() - .5) * Game.shake,
                (Math.random() - .5) * Game.shake);
    Game.shake *= 0.86;
  }

  drawSky(cam.a);

  renderGround(cam);
  g.imageSmoothingEnabled = false;
  g.drawImage(Game.buf, 0, 0, Game.IW, Game.IH,
    0, Game.horY, Game.DW, Game.DH - Game.horY);

  /* ---- collect world sprites sorted by depth ---- */
  const items = [];
  for (const box of race.itemBoxes) {
    if (!box.active) continue;
    const pr = project(box.x, box.y, cam);
    if (pr && pr.depth < FOG_FAR) {
      items.push({ d: pr.depth, type: 'box', pr, o: box });
    }
  }
  for (const b of race.bananas) {
    const pr = project(b.x, b.y, cam);
    if (pr && pr.depth < FOG_FAR) items.push({ d: pr.depth, type: 'banana', pr, o: b });
  }
  for (const p of race.particles.list) {
    const pr = project(p.x, p.y, cam);
    if (pr && pr.depth < FOG_FAR) {
      items.push({ d: pr.depth + 0.5, type: 'part', pr, o: p });
    }
  }

  /* fog fade helper */
  function fogA(depth) {
    return 1 - Math.min(1, Math.max(0,
      (depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR))) * .85;
  }

  items.sort((a, b) => b.d - a.d);
  let kartDrawn = false;
  for (const it of items) {
    if (!kartDrawn && it.d < CAM_BACK - 4) {
      /* player kart sits between sprites by depth */
      drawPlayerKart(g, cam);
      kartDrawn = true;
    }
    const a = fogA(it.d);
    g.globalAlpha = a;
    if (it.type === 'box') {
      const f = Game.boxFrames[(Game.time * 10 + it.o.phase * 5 | 0) % Game.boxFrames.length];
      const bob = Math.sin(Game.time * 3 + it.o.phase) * it.pr.scale * 3;
      const s = it.pr.scale * 34;
      g.drawImage(f, it.pr.x - s / 2, it.pr.y - s * 1.15 - bob, s, s);
    } else if (it.type === 'banana') {
      const s = it.pr.scale * 22;
      drawShadow(g, it.pr, s);
      g.drawImage(Game.bananaSprite,
        it.pr.x - s / 2, it.pr.y - s * .95, s, s);
    } else {
      const p = it.o;
      const r = Math.min(26, Math.max(1.5, it.pr.scale * p.size));
      g.globalAlpha = a * Math.min(1, p.life / p.fade);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(it.pr.x, it.pr.y - it.pr.scale * (p.z || 0), r, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  if (!kartDrawn) drawPlayerKart(g, cam);

  /* rivals */
  const rivals = [];
  for (const k of race.karts) {
    if (k.isPlayer) continue;
    const pr = project(k.x, k.y, cam);
    if (pr && pr.depth < FOG_FAR * 1.1) {
      rivals.push({ k, pr });
    }
  }
  rivals.sort((a, b) => b.pr.depth - a.pr.depth);
  for (const { k, pr } of rivals) {
    g.globalAlpha = fogA(pr.depth);
    drawKartSprite(g, k, pr, Game.time);
    g.globalAlpha = 1;
  }

  g.restore();
}

function drawPlayerKart(g, cam) {
  const k = Game.race.player;
  const pr = project(k.x, k.y, cam);
  if (!pr) return;
  drawKartSprite(g, k, pr, Game.time);
}
/* ================= game states ================= */
function showEl(id, on) {
  document.getElementById(id).classList.toggle('hidden', !on);
}

function startRace(withPlayer) {
  Game.attract = !withPlayer;
  Game.race = new Race(withPlayer, Game.audio);
  Game.race.frozen = !withPlayer ? false : true;
  const k0 = Game.race.player;
  Game.cam.x = k0.x - Math.cos(k0.angle) * CAM_BACK;
  Game.cam.y = k0.y - Math.sin(k0.angle) * CAM_BACK;
  Game.cam.a = k0.angle;
  Game.resultsShown = false;
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
        setTimeout(() => el.classList.add('hidden'), 850);
      } else if (label === '3' || label === '2' || label === '1') {
        Game.audio.play('countA');
      }
    } else {
      el.classList.add('hidden');
    }
  }
}

function onPlayerFinish() {
  setTimeout(() => {
    buildResults();
    showEl('results-screen', true);
    Game.resultsShown = true;
  }, 1600);
}
Game.onPlayerFinish = onPlayerFinish;

function buildResults() {
  const list = document.getElementById('results-list');
  const race = Game.race;
  const rows = [...race.karts].sort((a, b) => a.rank - b.rank);
  const meWon = race.player.rank === 1;
  document.getElementById('results-title').textContent =
    meWon ? '🏆 You Win!' : '🏁 Finish!';
  if (!meWon) Game.audio.play('lose');

  let html = '<table>';
  for (const k of rows) {
    const ch = CHARS.find(c => c.id === k.charId);
    const headCv = ch.headCv || ch.imgEl;
    let url = '';
    try { url = headCv.toDataURL ? headCv.toDataURL() : headCv.src; } catch (e) { }
    html += `<tr class="${k.isPlayer ? 'me' : ''}">
      <td class="pos">${k.rank}</td>
      <td style="width:44px">${url ? `<img src="${url}" width="36" height="36" style="border-radius:50%;object-fit:cover;background:#fff">` : ''}</td>
      <td>${k.name}${k.isPlayer ? ' (You)' : ''}</td>
      <td style="text-align:right">${k.finished ? HUD.fmtTime(k.finishTime) : 'racing…'}</td>
    </tr>`;
  }
  html += '</table>';
  if (Game.bestTime != null) {
    html += `<div id="results-sub">Best time: ${HUD.fmtTime(Game.bestTime)}</div>`;
  }
  list.innerHTML = html;
}

function saveBest() {
  const t = Game.race.player.finishTime;
  if (t == null) return;
  if (Game.bestTime == null || t < Game.bestTime) {
    Game.bestTime = t;
    try { localStorage.setItem('pk_best', String(t)); } catch (e) { }
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
  Game.time += dt;

  /* adaptive internal resolution */
  Game.frameEMA = Game.frameEMA * .95 + (dt * 1000) * .05;
  Game.qualityTimer += dt;
  if (Game.qualityTimer > 2.5 && !Input.isTouch) {
    Game.qualityTimer = 0;
    const g = document.getElementById('game');
    if (Game.frameEMA > 23 && Game.IW > 280) {
      Game.IW = Math.max(280, Math.round(Game.IW * 0.85));
      rebuildBuffer();
    } else if (Game.frameEMA < 12.5 && Game.IW < 520) {
      Game.IW = Math.min(520, Math.round(Game.IW * 1.12));
      rebuildBuffer();
    }
  }

  if (Game.state === 'countdown') updateCountdown(dt);
  if (raceActive()) {
    if (Game.state === 'racing' || Game.state === 'finished') {
      Game.race.update(dt);
      Game.race.updateItems(dt);
    }
    updateCamera(dt);
  }

  /* engine sound */
  {
    const p = Game.race.player;
    const racing = raceActive() && (Game.state !== 'countdown');
    Game.audio.engine(
      racing ? Math.min(1, Math.abs(p.v) / PHYS.MAX_SPEED) : 0,
      raceActive()
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
  if (!Game.resultsShown) return;
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

  await loadAssets();          // kart sprites, item boxes, icons

  /* world pixels for mode-7 */
  const wd = TRACK.canvas.getContext('2d')
    .getImageData(0, 0, TRACK.WORLD, TRACK.WORLD);
  Game.world32 = new Uint32Array(wd.data.buffer);

  /* best time */
  try {
    const b = localStorage.getItem('pk_best');
    if (b) Game.bestTime = parseFloat(b);
  } catch (e) { }

  resize();
  window.addEventListener('resize', () => { resize(); buildSky(); });

  Input.init();
  const audio = new AudioSys();
  try { if (localStorage.getItem('pk_mute') === '1') audio.muted = true; } catch (e) { }
  Game.audio = audio;

  /* ---- DOM wiring ---- */
  const video = document.getElementById('bear-video');
  video.play().catch(() => { });

  document.getElementById('btn-start').addEventListener('click', () => {
    audio.init();
    startRace(true);
  });
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', () => {
    showEl('pause-screen', false);
    startRace(true);
  });
  document.getElementById('btn-quit').addEventListener('click', () => {
    showEl('pause-screen', false);
    goTitle();
  });
  document.getElementById('btn-mute').addEventListener('click', toggleMute);
  document.getElementById('btn-again').addEventListener('click', () => {
    showEl('results-screen', false);
    startRace(true);
  });
  document.getElementById('btn-title').addEventListener('click', () => {
    showEl('results-screen', false);
    goTitle();
  });
  /* any first gesture unlocks audio */
  window.addEventListener('pointerdown', function once() {
    audio.init();
    video.play().catch(() => { });
    window.removeEventListener('pointerdown', once);
  }, { once: true });

  Input.onPause = togglePause;
  Input.onConfirm = () => {
    if (Game.state === 'title') {
      audio.init();
      startRace(true);
    } else if (Game.resultsShown) {
      showEl('results-screen', false);
      startRace(true);
    }
  };
  Input.onMuteToggle = toggleMute;
  Input.onRespawn = () => {
    if ((Game.state === 'racing' || Game.state === 'finished') && !Game.race.player.finished)
      Game.race.player.respawn();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden &&
        (Game.state === 'racing' || Game.state === 'countdown')) togglePause();
  });

  buildSky();
  startRace(false);            // attract demo behind title
  Game.state = 'title';
  showEl('title-screen', true);
  Game.lastTs = performance.now();
  requestAnimationFrame(tick);
}

function togglePause() {
  if (!Game.race || Game.state === 'title' || Game.resultsShown) return;
  Game.paused = !Game.paused;
  showEl('pause-screen', Game.paused);
}

function toggleMute() {
  Game.audio.setMuted(!Game.audio.muted);
  try { localStorage.setItem('pk_mute', Game.audio.muted ? '1' : '0'); } catch (e) { }
  updateMuteLabel();
}
function updateMuteLabel() {
  document.getElementById('btn-mute').textContent =
    Game.audio.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
}

function goTitle() {
  Game.paused = false;
  showEl('pause-screen', false);
  showEl('touch-controls', false);
  showEl('btn-pause', false);
  document.getElementById('countdown').classList.add('hidden');
  startRace(false);
  Game.state = 'title';
  showEl('title-screen', true);
  Game.audio.stopMusic();
  Game.audio.engine(0, false);
  Game.audio.skid(0);
}

window.addEventListener('load', boot);

