'use strict';
/* ============================================================
   input.js — keyboard (desktop) + touch buttons (mobile)
   ============================================================ */
const Input = {
  keys: Object.create(null),
  touch: { left: false, right: false, gas: false, brake: false, drift: false },
  autoGas: false,
  isTouch: ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches),
  itemQueue: [],
  onPause: null,
  onConfirm: null,
  onMuteToggle: null,
  onRespawn: null,

  init() {
    /* restore prefs */
    this.autoGas = this.isTouch;
    try {
      const saved = localStorage.getItem('bk_autogas') ?? localStorage.getItem('pk_autogas');
      if (saved !== null) this.autoGas = saved === '1';
    } catch (e) { }

    window.addEventListener('keydown', e => {
      // Preserve native keyboard activation and dialog navigation.
      if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if ((e.code === 'Enter' || e.code === 'Space') && /BUTTON|A/.test(e.target.tagName)) return;
      if (e.repeat) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
          e.preventDefault();
        return;
      }
      this.keys[e.code] = true;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.itemQueue.push(1);
          break;
        case 'Escape': case 'KeyP': if (this.onPause) this.onPause(); break;
        case 'Enter': e.preventDefault(); if (this.onConfirm) this.onConfirm(); break;
        case 'KeyM': if (this.onMuteToggle) this.onMuteToggle(); break;
        case 'KeyR': if (this.onRespawn) this.onRespawn(); break;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.reset(); });

    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && !this.isTouch) {
        this.isTouch = true;
        if (typeof Game !== 'undefined' && Game.racing && !Game.paused) {
          document.getElementById('touch-controls')?.classList.remove('hidden');
        }
      }
    }, { passive: true });

    this.bindTouch();
    const chk = document.getElementById('chk-autogas');
    const updateAutoGas = (enabled) => {
      const gasBtn = document.getElementById('tc-gas-btn');
      const tc = document.getElementById('touch-controls');
      if (gasBtn) gasBtn.style.display = enabled ? 'none' : '';
      tc?.classList.toggle('autogas-active', enabled);
    };
    if (chk) {
      chk.checked = this.autoGas;
      chk.addEventListener('change', () => {
        this.autoGas = chk.checked;
        try {
          const val = chk.checked ? '1' : '0';
          localStorage.setItem('bk_autogas', val);
          localStorage.setItem('pk_autogas', val);
        } catch (e) { }
        updateAutoGas(chk.checked);
      });
    }
    updateAutoGas(this.autoGas);
  },

  bindTouch() {
    const bind = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = e => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { }
        el.classList.add('pressed');
        this.touch[prop] = true;
      };
      const up = e => {
        e.preventDefault();
        el.classList.remove('pressed');
        this.touch[prop] = false;
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bind('tc-left-btn', 'left');
    bind('tc-right-btn', 'right');
    bind('tc-gas-btn', 'gas');
    bind('tc-brake-btn', 'brake');
    bind('tc-drift-btn', 'drift');

    const resetBtn = document.getElementById('tc-reset-btn');
    if (resetBtn) {
      const handleRespawn = e => {
        e.preventDefault();
        resetBtn.classList.add('pressed');
        this.onRespawn?.();
        setTimeout(() => resetBtn.classList.remove('pressed'), 200);
      };
      resetBtn.addEventListener('pointerdown', handleRespawn);
      resetBtn.addEventListener('click', handleRespawn);
    }

    const itemBtn = document.getElementById('tc-item-btn');
    if (itemBtn) {
      itemBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        itemBtn.classList.add('pressed');
        this.itemQueue.push(1);
      });
      ['pointerup', 'pointercancel', 'pointerleave']
        .forEach(ev => itemBtn.addEventListener(ev, () => itemBtn.classList.remove('pressed')));
    }

    /* block gestures on the control layer */
    const tc = document.getElementById('touch-controls');
    tc.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    tc.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  },

  consumeItemPress() { return this.itemQueue.length > 0 ? !!this.itemQueue.pop() : false; },

  reset() {
    this.keys = Object.create(null);
    for (const key of Object.keys(this.touch)) this.touch[key] = false;
    this.itemQueue.length = 0;
    document.querySelectorAll('.t-btn.pressed').forEach(el => el.classList.remove('pressed'));
  },

  get left() { return !!(this.keys.ArrowLeft || this.keys.KeyA || this.touch.left); },
  get right() { return !!(this.keys.ArrowRight || this.keys.KeyD || this.touch.right); },
  get gasHeld() {
    return !!(this.autoGas || this.keys.ArrowUp || this.keys.KeyW || this.touch.gas);
  },
  get brakeHeld() { return !!(this.keys.ArrowDown || this.keys.KeyS || this.touch.brake); },
  get driftHeld() {
    return !!(this.keys.ShiftLeft || this.keys.ShiftRight || this.touch.drift);
  },
  get steer() { return (this.left ? -1 : 0) + (this.right ? 1 : 0); }
};
