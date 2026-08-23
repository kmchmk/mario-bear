'use strict';
/* ============================================================
   kart.js — arcade kart physics (drift, boost, off-road) + AI
   ============================================================ */
const PHYS = {
  MAX_SPEED: 340,
  ACCEL: 1.9,
  BOOST_ACCEL: 3.4,
  BRAKE: 640,
  REVERSE_MAX: -130,
  COAST_DRAG: 0.9,
  OFF_DRAG: 2.6,
  OFF_FACTOR: 0.42,
  TURN_RATE: 2.35,
  DRIFT_BASE: 0.95,
  DRIFT_STEER: 0.95,
  SLIP: 0.34,
  HOP_TIME: 0.22,
  MINI_T1: 0.9,
  MINI_T2: 1.85,
  MT1_BOOST: 0.55,
  MT2_BOOST: 0.95,
  PAD_TIME: 0.85,
  ITEM_TIME: 1.15,
  RADIUS: 26
};

class Kart {
  constructor(cfg) {
    this.name = cfg.name;
    this.color = cfg.color;
    this.accent = cfg.accent;
    this.headImg = cfg.headImg;
    this.charId = cfg.charId;
    this.isPlayer = !!cfg.isPlayer;
    this.speedMul = cfg.speedMul || 1;

    const gp = TRACK.gridPose(cfg.slot);
    this.x = gp.x; this.y = gp.y; this.angle = gp.a;
    this.v = 0;

    this.steerIn = 0;
    this.gasIn = false;
    this.brakeIn = false;
    this.driftHeld = false;
    this.hopQueued = false;

    this.hopT = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.slip = 0;

    this.boostT = 0;
    this.padCd = 0;
    this.spinT = 0;
    this.invulnT = 0;
    this.bumpCd = 0;
    this.surface = TRACK.ROAD;

    this.item = null;          // 'bone' | 'banana' | 'triple'
    this.itemCount = 0;
    this.rouletteT = 0;

    this.idx = TRACK.nearestIdx(this.x, this.y);
    this.progress = this.idx - TRACK.NS;
    this.halfway = false;
    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.rank = cfg.slot + 1;
    this.wrongWay = false;

    this.ai = this.isPlayer ? null : {
      skill: cfg.skill || 0.97,
      wobbleSeed: Math.random() * 10,
      stuckT: 0,
      reverseT: 0,
      itemDelay: 1 + Math.random() * 2
    };
  }

  get maxSpeed() {
    let m = PHYS.MAX_SPEED * this.speedMul;
    if (!this.isPlayer && this.ai && this.rubber) m *= this.rubber;
    if (this.boostT > 0) m *= 1.42;
    else if (this.surface === TRACK.GRASS) m *= PHYS.OFF_FACTOR;
    return m;
  }

  queueHop() { this.hopQueued = true; }

  useItem(race) {
    if (this.rouletteT > 0 || !this.item) return false;
    const it = this.item;
    if (it === 'bone') {
      this.boostT = Math.max(this.boostT, PHYS.ITEM_TIME);
      race.onBoostUsed(this);
      this.item = null;
    } else if (it === 'triple') {
      this.boostT = Math.max(this.boostT, PHYS.ITEM_TIME);
      race.onBoostUsed(this);
      this.itemCount--;
      if (this.itemCount <= 0) this.item = null;
    } else if (it === 'banana') {
      race.dropBanana(this);
      this.item = null;
    }
    return true;
  }

  spinOut() {
    if (this.spinT > 0 || this.invulnT > 0) return;
    this.spinT = 1.05;
    this.v *= 0.32;
    this.drifting = false;
    this.driftCharge = 0;
  }

  respawn() {
    const p = TRACK.poseAt((this.idx + 8) * TRACK.STEP);
    this.x = p.x; this.y = p.y; this.angle = p.a;
    this.v = 0;
    this.invulnT = 1.4;
    this.spinT = 0;
    this.slip = 0;
    this.drifting = false;
  }

  update(dt, race) {
    if (this.boostT > 0) this.boostT -= dt;
    if (this.padCd > 0) this.padCd -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.bumpCd > 0) this.bumpCd -= dt;
    if (this.rouletteT > 0) this.rouletteT -= dt;

    let steer = this.steerIn;
    let gas = this.gasIn, brake = this.brakeIn;
    if (this.spinT > 0) {
      this.spinT -= dt;
      steer = 0; gas = false; brake = false;
    }
    if (race.frozen) { gas = false; brake = false; steer *= 0.2; }

    this.surface = TRACK.surfaceAt(this.x, this.y);
    const offroad = this.surface === TRACK.GRASS && this.boostT <= 0;

    /* ---- drift state machine ---- */
    if (this.hopQueued) {
      this.hopQueued = false;
      if (!this.drifting && this.hopT <= 0 && Math.abs(this.v) > 165 && !offroad) {
        this.hopT = PHYS.HOP_TIME;
        if (this.isPlayer) race.audio.play('hop');
      }
    }
    if (this.hopT > 0) {
      this.hopT -= dt;
      if (this.hopT <= 0 && this.driftHeld && Math.abs(steer) > .15 && Math.abs(this.v) > 150) {
        this.drifting = true;
        this.driftDir = Math.sign(steer);
        this.driftCharge = 0;
        if (this.isPlayer) race.audio.play('driftStart');
      }
    }
    if (this.drifting) {
      const bias = Math.max(-1, Math.min(1, steer * this.driftDir));
      this.driftCharge += dt * (1 + Math.abs(bias) * .45);
      if (!this.driftHeld || Math.abs(this.v) < 115 || offroad) {
        this.releaseDrift(race);
      } else {
        race.emitDriftSparks(this, bias);
      }
    }

    /* ---- longitudinal ---- */
    const tmax = this.maxSpeed;
    const av0 = Math.abs(this.v);
    if (gas && !brake) {
      const rate = this.boostT > 0 ? PHYS.BOOST_ACCEL : PHYS.ACCEL;
      if (av0 < tmax) this.v += (tmax - av0 + 30) * rate * dt;
      else this.v += (tmax - av0) * 2.4 * dt;
    } else if (brake) {
      if (this.v > 0) this.v -= PHYS.BRAKE * dt;
      else this.v = Math.max(PHYS.REVERSE_MAX, this.v - 300 * dt);
    } else {
      const drag = offroad ? PHYS.OFF_DRAG : PHYS.COAST_DRAG;
      this.v -= this.v * drag * dt;
      if (Math.abs(this.v) < 6) this.v = 0;
    }
    if (offroad && gas && this.v > tmax) this.v = tmax;

    /* ---- steering ---- */
    const av = Math.abs(this.v);
    if (this.drifting) {
      const bias = Math.max(-1, Math.min(1, steer * this.driftDir));
      this.angle += this.driftDir * (PHYS.DRIFT_BASE + bias * PHYS.DRIFT_STEER) *
        dt * Math.min(1, av / 170);
    } else if (av > 4) {
      /* steering floor lets stuck karts wiggle free at low speed */
      const grip = Math.min(1, Math.max(av, 90) / 150) *
        (1 - 0.28 * Math.min(1, Math.max(0, av - 250) / 260));
      this.angle += steer * PHYS.TURN_RATE * grip * dt * Math.sign(this.v || 1);
    }

    /* ---- slip: velocity lags heading while drifting ---- */
    const slipTarget = this.drifting ? PHYS.SLIP : 0;
    this.slip += (slipTarget - this.slip) * Math.min(1, 7 * dt);
    const moveA = this.angle - (this.drifting ? this.driftDir : 0) * this.slip;

    this.x += Math.cos(moveA) * this.v * dt;
    this.y += Math.sin(moveA) * this.v * dt;

    /* ---- world bounds ---- */
    const M = 34;
    if (this.x < M || this.x > TRACK.WORLD - M || this.y < M || this.y > TRACK.WORLD - M) {
      this.x = Math.max(M, Math.min(TRACK.WORLD - M, this.x));
      this.y = Math.max(M, Math.min(TRACK.WORLD - M, this.y));
      this.v *= 0.55;
      /* gentle assist: ease back toward the track heading */
      const tan = TRACK.samples[this.idx];
      let da = tan.a - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * Math.min(1, 2.2 * dt);
    }

    /* ---- boost pads ---- */
    if (this.surface === TRACK.BOOST && this.padCd <= 0) {
      this.padCd = 1.1;
      this.boostT = Math.max(this.boostT, PHYS.PAD_TIME);
      race.onPadHit(this);
    }

    /* ---- particles ---- */
    if (offroad && av > 60) {
      if (Math.random() < 12 * dt) race.spawnDust(this);
    }
    if (this.boostT > 0 && Math.random() < 30 * dt) race.spawnFlame(this);

    /* ---- progress / laps ---- */
    const ni = TRACK.nearestIdx(this.x, this.y, this.idx);
    let d = ni - this.idx;
    const halfNS = TRACK.NS >> 1;
    if (d > halfNS) d -= TRACK.NS;
    if (d < -halfNS) d += TRACK.NS;
    if (Math.abs(d) <= 40) this.progress += d;
    this.idx = ni;

    const progMod = ((this.progress % TRACK.NS) + TRACK.NS) % TRACK.NS;
    if (progMod > TRACK.NS * 0.45 && progMod < TRACK.NS * 0.75) this.halfway = true;

    const newLap = Math.floor(this.progress / TRACK.NS) + 1;
    if (newLap > this.lap) {
      if (this.halfway) {
        this.lap = newLap;
        this.halfway = false;
        race.onLap(this);
      }
      /* jumped without checkpoint: ignore */
    } else if (newLap < this.lap) {
      this.lap = newLap;   // reversed over the line
    }

    /* ---- wrong way (player) ---- */
    if (this.isPlayer && !this.finished) {
      const tan = TRACK.samples[this.idx];
      const fwdDot = Math.cos(this.angle) * Math.cos(tan.a) +
                     Math.sin(this.angle) * Math.sin(tan.a);
      this.wrongWay = fwdDot < -0.25 && this.v > 40;
    }
  }

  releaseDrift(race) {
    if (this.drifting) {
      const tier = this.driftCharge >= PHYS.MINI_T2 ? 2 :
                   (this.driftCharge >= PHYS.MINI_T1 ? 1 : 0);
      if (tier > 0) {
        this.boostT = Math.max(this.boostT,
          tier === 2 ? PHYS.MT2_BOOST : PHYS.MT1_BOOST);
        if (this.isPlayer) race.audio.play('miniturbo');
        race.spawnMiniTurbo(this, tier);
      }
    }
    this.drifting = false;
    this.driftCharge = 0;
  }
}
