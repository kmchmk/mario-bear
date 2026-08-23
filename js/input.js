'use strict';
/* ============================================================
   input.js — keyboard (desktop) + touch buttons (mobile)
   ============================================================ */
const Input = {
  keys: Object.create(null),
  touch: { left: false, right: false, gas: false, brake: false, drift: false },
  autoGas: false,
  isTouch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
  itemQueue: [],
  onPause: null,
  onConfirm: null,
  onMuteToggle: null,
  onRespawn: null,

  init() {
    /* restore prefs */
    try {
      this.autoGas = localStorage.getItem('pk_autogas') === '1';
    } catch (e) { }
    if (this.isTouch && localStorage.getItem('pk_autogas') === null) {
      this.autoGas = true;                       // friendlier default on phones
    }

    window.addEventListener('keydown', e => {
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
        case 'Enter': if (this.onConfirm) this.onConfirm(); break;
        case 'KeyM': if (this.onMuteToggle) this.onMuteToggle(); break;
        case 'KeyR': if (this.onRespawn) this.onRespawn(); break;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); });

    this.bindTouch();
    const chk = document.getElementById('chk-autogas');
    chk.checked = this.autoGas;
    chk.addEventListener('change', () => {
      this.autoGas = chk.checked;
      try { localStorage.setItem('pk_autogas', chk.checked ? '1' : '0'); } catch (e) { }
      document.getElementById('tc-gas-btn').style.display = chk.checked ? 'none' : '';
      document.getElementById('tc-brake-btn').style.display = chk.checked ? '' : 'none';
    });
    if (this.autoGas) {
      document.getElementById('tc-gas-btn').style.display = 'none';
      document.getElementById('tc-brake-btn').style.display = '';
    } else {
      document.getElementById('tc-gas-btn').style.display = '';
      document.getElementById('tc-brake-btn').style.display = 'none';
    }
  },

  bindTouch() {
    const bind = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = e => {
        e.preventDefault();
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
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', e => e.preventDefault());
    };
    bind('tc-left-btn', 'left');
    bind('tc-right-btn', 'right');
    bind('tc-gas-btn', 'gas');
    bind('tc-brake-btn', 'brake');
    bind('tc-drift-btn', 'drift');

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
