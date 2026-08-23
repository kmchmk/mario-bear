'use strict';
/* ============================================================
   race.js — race manager (karts, items, collisions, laps)
   ============================================================ */
class Race {
  constructor(withPlayer, audio) {
    this.audio = audio;
    this.laps = 3;
    this.time = 0;
    this.frozen = true;
    this.msgs = [];
    this.particles = new Particles();
    this.karts = [];
    this.bananas = [];

    this.itemBoxes = TRACK.itemSpots.map(s => ({
      x: s.x, y: s.y, active: true, t: 0, phase: Math.random() * 7
    }));

    /* grid: CPUs front, player last (classic) */
    let slot = 0;
    const slots = {};
    for (const ch of CHARS) {
      if (ch.player && withPlayer) slots[ch.id] = 3;
      else slots[ch.id] = slot++;
    }
    for (const ch of CHARS) {
      const isP = ch.player && withPlayer;
      this.karts.push(new Kart({
        name: ch.name, color: ch.color, accent: ch.accent,
        headImg: ch.headCv || ch.imgEl, charId: ch.id,
        isPlayer: isP, slot: slots[ch.id],
        speedMul: 1, skill: ch.skill
      }));
    }
    this.player = this.karts.find(k => k.isPlayer) || this.karts[0];
    this.finishedOrder = [];
    this._driftPrev = false;
  }

  msg(text, color, dur) {
    this.msgs.push({ text, color: color || '#ffd93d', t0: Game.time, dur: dur || 1.4 });
    if (this.msgs.length > 3) this.msgs.shift();
  }

  onLap(kart) {
    if (kart.lap > this.laps && !kart.finished) {
      kart.finished = true;
      kart.finishTime = this.time;
      this.finishedOrder.push(kart);
      if (kart.isPlayer) {
        this.audio.play('fanfare');
        this.msg('GOAL!', '#ffd93d', 1.6);
        Game.onPlayerFinish();
      } else {
        kart.speedMul *= .8;          // victory-lap cruise
      }
      return;
    }
    if (!kart.isPlayer || kart.finished || kart.lap <= 1) return;
    if (kart.lap === this.laps) {
      this.audio.play('finalLap');
      this.msg('FINAL LAP!', '#ff9d2e');
    } else {
      this.audio.play('lap');
      this.msg('LAP ' + kart.lap + '!', '#7ec8ff');
    }
  }

  onPadHit(kart) {
    if (kart.isPlayer) this.audio.play('pad');
    for (let i = 0; i < 6; i++) {
      this.particles.spawn({
        x: kart.x + (Math.random() - .5) * 20,
        y: kart.y + (Math.random() - .5) * 20,
        vx: Math.cos(kart.angle) * 60 + (Math.random() - .5) * 40,
        vy: Math.sin(kart.angle) * 60 + (Math.random() - .5) * 40,
        size: 3.2, life: .5, fade: .5,
        color: Math.random() < .5 ? '#ffb300' : '#fff'
      });
    }
  }

  onBoostUsed(kart) { if (kart.isPlayer) this.audio.play('boost'); }

  dropBanana(kart) {
    const bx = kart.x - Math.cos(kart.angle) * 58;
    const by = kart.y - Math.sin(kart.angle) * 58;
    this.bananas.push({ x: bx, y: by, owner: kart, life: 30, age: 0 });
    if (this.bananas.length > 10) this.bananas.shift();
  }
}
/* ---- particle helpers ---- */
Race.prototype.emitDriftSparks = function (kart) {
  if (Math.random() < 0.42) return;
  const tier = kart.driftCharge >= PHYS.MINI_T2 ? 2 :
    (kart.driftCharge >= PHYS.MINI_T1 ? 1 : 0);
  const col = tier === 2 ? '#ffb74d' : tier === 1 ? '#4fc3f7' : 'rgba(255,255,255,.85)';
  const bx = kart.x - Math.cos(kart.angle) * 24;
  const by = kart.y - Math.sin(kart.angle) * 24;
  this.particles.spawn({
    x: bx + (Math.random() - .5) * 16,
    y: by + (Math.random() - .5) * 16,
    vx: (Math.random() - .5) * 90 - kart.driftDir * 40,
    vy: (Math.random() - .5) * 90,
    size: 2.6, life: .35, fade: .35, color: col
  });
};

Race.prototype.spawnMiniTurbo = function (kart, tier) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    this.particles.spawn({
      x: kart.x - Math.cos(kart.angle) * 20,
      y: kart.y - Math.sin(kart.angle) * 20,
      vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
      size: 3.4, life: .45, fade: .45,
      color: tier === 2 ? '#ffb74d' : '#4fc3f7'
    });
  }
};

Race.prototype.spawnDust = function (kart) {
  this.particles.spawn({
    x: kart.x - Math.cos(kart.angle) * 22 + (Math.random() - .5) * 18,
    y: kart.y - Math.sin(kart.angle) * 22 + (Math.random() - .5) * 18,
    vx: (Math.random() - .5) * 50, vy: (Math.random() - .5) * 50,
    size: 3.4, life: .55, fade: .55, color: 'rgba(120,86,52,.7)'
  });
};

Race.prototype.spawnFlame = function (kart) {
  this.particles.spawn({
    x: kart.x - Math.cos(kart.angle) * 34,
    y: kart.y - Math.sin(kart.angle) * 34,
    vx: -Math.cos(kart.angle) * 80 + (Math.random() - .5) * 50,
    vy: -Math.sin(kart.angle) * 80 + (Math.random() - .5) * 50,
    size: 3.4, life: .28, fade: .28,
    color: Math.random() < .5 ? '#ff9800' : '#ffd93d'
  });
};

/* ---- items ---- */
Race.prototype.giveItem = function (kart) {
  const r = kart.rank;
  let roll = Math.random(), item;
  if (r === 1) item = roll < .55 ? 'banana' : roll < .9 ? 'bone' : 'triple';
  else if (r === 2) item = roll < .35 ? 'banana' : roll < .8 ? 'bone' : 'triple';
  else if (r === 3) item = roll < .2 ? 'banana' : roll < .65 ? 'bone' : 'triple';
  else item = roll < .12 ? 'banana' : roll < .55 ? 'bone' : 'triple';

  if (kart.isPlayer) {
    kart.pendingItem = item;
    kart.rouletteT = 1.0;
  } else {
    kart.item = item;
    if (item === 'triple') kart.itemCount = 3;
    kart.ai.itemDelay = 1.5 + Math.random() * 2.5;
  }
};
/* ---- main update ---- */
Race.prototype.update = function (dt) {
  if (!this.frozen) this.time += dt;

  /* player controls */
  const p = this.player;
  if (Game.attract || p.finished) {
    aiAutopilot(p, this, dt);
  } else {
    p.steerIn = Input.steer;
    p.gasIn = Input.gasHeld;
    p.brakeIn = Input.brakeHeld;
    p.driftHeld = Input.driftHeld;
    if (Input.driftHeld && !this._driftPrev) p.queueHop();
  }
  this._driftPrev = Input.driftHeld;
  while (Input.consumeItemPress()) {
    if (p.item && p.rouletteT <= 0) { p.useItem(this); break; }
  }

  /* AI think */
  for (const k of this.karts) {
    if (k.ai && !k.finished) k.aiThink(dt, this);
  }

  /* physics */
  for (const k of this.karts) k.update(dt, this);

  /* kart-kart collisions */
  const KR = PHYS.RADIUS * 2;
  for (let i = 0; i < this.karts.length; i++) {
    for (let j = i + 1; j < this.karts.length; j++) {
      const A = this.karts[i], B = this.karts[j];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < KR * KR) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const ov = (KR - d) / 2;
        A.x -= nx * ov; A.y -= ny * ov;
        B.x += nx * ov; B.y += ny * ov;
        const rel = Math.abs(A.v - B.v);
        if ((A.bumpCd <= 0 || B.bumpCd <= 0)) {
          A.bumpCd = .28; B.bumpCd = .28;
          A.v *= .94; B.v *= .96;
          if ((A.isPlayer || B.isPlayer) && rel > 70) {
            this.audio.play('bump');
            Game.shake = Math.min(6, rel / 40);
          }
        }
      }
    }
  }
};
/* ---- items, boxes, ranks ---- */
Race.prototype.updateItems = function (dt) {
  /* item box respawn + pickup */
  for (const box of this.itemBoxes) {
    if (!box.active) {
      box.t -= dt;
      if (box.t <= 0) box.active = true;
      continue;
    }
    for (const k of this.karts) {
      const dx = k.x - box.x, dy = k.y - box.y;
      if (dx * dx + dy * dy < 38 * 38) {
        box.active = false;
        box.t = 3.2;
        if (k.isPlayer) this.audio.play('pickup');
        this.giveItem(k);
        break;
      }
    }
  }

  /* player roulette resolution */
  const p = this.player;
  if (p.pendingItem && p.rouletteT <= 0) {
    p.item = p.pendingItem;
    p.itemCount = p.item === 'triple' ? 3 : 1;
    p.pendingItem = null;
    if (p.isPlayer) this.audio.play('itemGet');
  }

  /* bananas */
  for (const b of this.bananas) {
    b.life -= dt; b.age += dt;
    for (const k of this.karts) {
      if (k === b.owner && b.age < .8) continue;
      if (k.invulnT > 0 || k.spinT > 0) continue;
      const dx = k.x - b.x, dy = k.y - b.y;
      if (dx * dx + dy * dy < 30 * 30) {
        k.spinOut();
        b.life = 0;
        if (k.isPlayer) { this.audio.play('slip'); Game.shake = 5; }
        break;
      }
    }
  }
  this.bananas = this.bananas.filter(b => b.life > 0);

  /* particles */
  this.particles.update(dt);

  /* rank calculation */
  const order = [...this.karts].sort((a, b) => {
    if (a.finished && b.finished)
      return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  order.forEach((k, i) => { k.rank = i + 1; });
};

function aiAutopilot(kart, race, dt) {
  /* finished karts keep cruising along the track */
  kart.steerIn = 0;
  const LA = 140;
  const tIdx = (kart.idx + Math.round(LA / TRACK.STEP)) % TRACK.NS;
  const tp = TRACK.samples[tIdx];
  let diff = Math.atan2(tp.y - kart.y, tp.x - kart.x) - kart.angle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  kart.steerIn = Math.max(-1, Math.min(1, diff * 2.4));
  kart.gasIn = true;
  kart.brakeIn = false;
}
/* RACE_END */
