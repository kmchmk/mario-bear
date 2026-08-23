'use strict';
/* ============================================================
   audio.js — WebAudio: engine, sfx, chip-tune music (no assets)
   ============================================================ */
class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ok = false;
    this.musicOn = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.15;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    this.ok = true;

    /* ---- engine hum (always running, gain-gated) ---- */
    const c = this.ctx;
    this.engOsc = c.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 55;
    this.engOsc2 = c.createOscillator();
    this.engOsc2.type = 'square';
    this.engOsc2.frequency.value = 62;

    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 700;

    this.engGain = c.createGain();
    this.engGain.gain.value = 0;

    this.engOsc.connect(this.engFilter);
    this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.sfxGain);
    this.engOsc.start();
    this.engOsc2.start();

    /* ---- skid noise loop ---- */
    const nb = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.skidSrc = c.createBufferSource();
    this.skidSrc.buffer = nb;
    this.skidSrc.loop = true;
    this.skidFilter = c.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 820;
    this.skidFilter.Q.value = 0.9;
    this.skidGain = c.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.sfxGain);
    this.skidSrc.start();

    /* music scheduler state */
    this.step = 0;
    this.nextStepT = 0;
    this.timerId = null;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  engine(speedNorm, active) {
    if (!this.ok) return;
    const f = 52 + speedNorm * 150 + Math.sin(performance.now() * 0.02) * 3 * speedNorm;
    this.engOsc.frequency.value = f;
    this.engOsc2.frequency.value = f * 1.13;
    this.engGain.gain.value = active ? (0.028 + speedNorm * 0.05) : 0;
  }

  skid(level) {
    if (!this.ok) return;
    this.skidGain.gain.value = level;
  }

  /* ---------------- SFX ---------------- */
  tone(o) {
    if (!this.ok) return;
    const c = this.ctx;
    const t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
    const g = c.createGain();
    const v = o.vol == null ? 0.18 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  noiseBurst(dur, freq, vol, delay) {
    if (!this.ok) return;
    const c = this.ctx;
    const t0 = c.currentTime + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  play(name) {
    if (!this.ok) return;
    switch (name) {
      case 'hop': this.tone({ type: 'triangle', f0: 300, f1: 430, dur: .09, vol: .12 }); break;
      case 'driftStart': this.tone({ type: 'sawtooth', f0: 240, f1: 480, dur: .12, vol: .1 }); break;
      case 'miniturbo':
        this.tone({ type: 'sawtooth', f0: 300, f1: 900, dur: .28, vol: .16 });
        this.noiseBurst(.2, 2600, .1);
        break;
      case 'pad':
        this.tone({ type: 'sawtooth', f0: 200, f1: 950, dur: .3, vol: .15 });
        break;
      case 'boost':
        this.tone({ type: 'sawtooth', f0: 180, f1: 880, dur: .4, vol: .18 });
        this.noiseBurst(.3, 3200, .14);
        break;
      case 'pickup':
        this.tone({ type: 'square', f0: 780, dur: .07, vol: .13 });
        this.tone({ type: 'square', f0: 1180, dur: .1, vol: .13, delay: .07 });
        break;
      case 'tick': this.tone({ type: 'square', f0: 640, dur: .03, vol: .08 }); break;
      case 'itemGet':
        [660, 830, 990, 1320].forEach((f, i) =>
          this.tone({ type: 'square', f0: f, dur: .09, vol: .12, delay: i * .06 }));
        break;
      case 'bump':
        this.noiseBurst(.09, 380, .3);
        this.tone({ type: 'triangle', f0: 95, f1: 55, dur: .12, vol: .25 });
        break;
      case 'slip':
        this.tone({ type: 'sawtooth', f0: 700, f1: 110, dur: .5, vol: .17 });
        this.noiseBurst(.35, 1500, .12);
        break;
      case 'lap':
        [523, 659, 784].forEach((f, i) =>
          this.tone({ type: 'square', f0: f, dur: .11, vol: .13, delay: i * .09 }));
        break;
      case 'finalLap':
        [659, 784, 988, 1319].forEach((f, i) =>
          this.tone({ type: 'square', f0: f, dur: .1, vol: .14, delay: i * .07 }));
        break;
      case 'countA': this.tone({ type: 'square', f0: 440, dur: .14, vol: .2 }); break;
      case 'go':
        this.tone({ type: 'square', f0: 880, dur: .45, vol: .22 });
        this.tone({ type: 'square', f0: 1760, dur: .4, vol: .08 });
        break;
      case 'fanfare':
        [[392, 0], [523, .12], [659, .24], [784, .38], [1046, .62]]
          .forEach(([f, d]) => this.tone({ type: 'square', f0: f, dur: d > .5 ? .5 : .16, vol: .16, delay: d }));
        this.noiseBurst(.4, 5000, .08, .62);
        break;
      case 'lose':
        [[392, 0], [370, .18], [349, .36], [330, .56]]
          .forEach(([f, d]) => this.tone({ type: 'triangle', f0: f, dur: .2, vol: .15, delay: d }));
        break;
    }
  }

  /* ---------------- music ---------------- */
  startMusic() {
    if (!this.ok || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStepT = this.ctx.currentTime + 0.06;
    this.timerId = setInterval(() => this.schedule(), 40);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }

  schedule() {
    if (!this.musicOn || !this.ok) return;
    const SPB = 60 / 138 / 4;               // 16th note duration
    while (this.nextStepT < this.ctx.currentTime + 0.16) {
      this.playStep(this.step, this.nextStepT, SPB);
      this.nextStepT += SPB;
      this.step++;
    }
  }

  playStep(step, t, spb) {
    const s = step % 64;
    const c = this.ctx;

    /* lead */
    const lead = MUSIC_LEAD[s];
    if (lead) {
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = 440 * Math.pow(2, (lead - 69) / 12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.055, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spb * (MUSIC_LEN[s] || 1.6));
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + spb * 2.2);
    }
    /* bass */
    const bass = MUSIC_BASS[s];
    if (bass) {
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = 440 * Math.pow(2, (bass - 69) / 12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.8);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + spb * 2);
    }
    /* hats */
    if (s % 2 === 0) {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = c.createGain();
      const v = (s % 8 === 4 || s % 8 === 6) ? 0.05 : 0.03;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      n.connect(f); f.connect(g); g.connect(this.musicGain);
      n.start(t); n.stop(t + 0.05);
    }
    /* snare on backbeat */
    if (s % 16 === 8) {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 1800; f.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      n.connect(f); f.connect(g); g.connect(this.musicGain);
      n.start(t); n.stop(t + 0.14);
    }
  }
}

/* C major, bouncy, 4 bars of 16 steps.
   Format per step: midi note or 0=rest. Length array extends held notes. */
const _ = 0;
const MUSIC_LEAD = [
  76, _, 79, _, 81, _, 79, _, 76, _, 74, _, 72, _, 74, _,
  76, _, 79, _, 81, _, 83, _, 84, _, 83, _, 81, _, 79, _,
  81, _, 84, _, 86, _, 84, _, 81, _, 79, _, 76, _, 79, _,
  74, _, 76, _, 79, _, 76, _, 74, _, 72, _, _, _, _, _
];
const MUSIC_LEN = [
  1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0,
  1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0,
  1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0,
  1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 1.6, 0, 0, 0, 0, 0
];
const MUSIC_BASS = [
  48, _, _, _, 43, _, _, _, 48, _, _, _, 43, _, _, _,
  45, _, _, _, 40, _, _, _, 45, _, _, _, 40, _, _, _,
  41, _, _, _, 48, _, _, _, 41, _, _, _, 48, _, _, _,
  43, _, _, _, 50, _, _, _, 43, _, _, _, 47, _, _, _
];
