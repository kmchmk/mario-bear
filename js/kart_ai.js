'use strict';
/* ============================================================
   ai.js — CPU driver brain (waypoints, rubber banding, items)
   ============================================================ */

Kart.prototype.aiThink = function (dt, race) {
  const ai = this.ai;
  if (!ai) return;
  const player = race.player;

  /* rubber banding vs player */
  const gap = (player ? player.progress : 0) - this.progress; // >0: AI behind
  let rb = 1 + Math.max(-0.055, Math.min(0.1, gap / TRACK.NS * 0.16));
  this.rubber = Math.max(0.9, Math.min(1.12, rb));

  const av = Math.abs(this.v);

  /* stuck / reverse recovery */
  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    this.steerIn = -this.steerIn;
    this.gasIn = false;
    this.brakeIn = true;
    return;
  }
  if (av < 26 && !race.frozen) {
    ai.stuckT += dt;
    if (ai.stuckT > 1.3) { ai.stuckT = 0; ai.reverseT = 0.75; }
  } else {
    ai.stuckT = 0;
  }

  /* target point ahead on centerline */
  const LA = Math.max(80, Math.min(250, 90 + av * 0.42));
  const tIdx = (this.idx + Math.round(LA / TRACK.STEP)) % TRACK.NS;
  const tp = TRACK.samples[tIdx];
  const desired = Math.atan2(tp.y - this.y, tp.x - this.x) +
    Math.sin(race.time * 1.7 + ai.wobbleSeed) * 0.05;

  let diff = desired - this.angle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  this.steerIn = Math.max(-1, Math.min(1, diff * 2.6));

  /* throttle & braking into corners */
  if (Math.abs(diff) > 1.15 && av > PHYS.MAX_SPEED * 0.62 * this.speedMul) {
    this.gasIn = false;
    this.brakeIn = true;
  } else {
    this.gasIn = true;
    this.brakeIn = false;
  }

  /* avoid bananas ahead */
  for (const b of race.bananas) {
    if (b.owner === this) continue;
    const dx = b.x - this.x, dy = b.y - this.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > 190 * 190 || dist2 < 20) continue;
    const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
    const fwd = dx * fx + dy * fy;
    if (fwd < 24) continue;
    const side = -dx * fy + dy * fx;
    if (Math.abs(side) < 55) {
      this.steerIn = Math.max(-1,
        Math.min(1, this.steerIn + (side > 0 ? -0.85 : 0.85)));
      break;
    }
  }

  /* AI drifts through sustained corners */
  if (!this.drifting && Math.abs(diff) > 0.55 && av > 205 &&
      Math.abs(this.steerIn) > 0.35 && this.hopT <= 0) {
    this.drifting = true;
    this.driftDir = Math.sign(diff);
    this.driftCharge = 0;
  }
  if (this.drifting &&
      (Math.abs(diff) < 0.18 || !this.gasIn)) {
    this.releaseDrift(race);
  }
  this.driftHeld = this.drifting;

  /* item usage */
  if (this.item && this.rouletteT <= 0) {
    ai.itemDelay -= dt;
    if (ai.itemDelay <= 0) {
      ai.itemDelay = 2 + Math.random() * 3;
      const straight = Math.abs(diff) < 0.22;
      if (this.item === 'banana') {
        this.useItem(race);                       // drop behind
      } else if (straight || this.boostT > 0) {
        this.useItem(race);
      }
    }
  }
};
