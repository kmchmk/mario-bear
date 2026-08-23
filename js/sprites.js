'use strict';
/* ============================================================
   sprites.js — kart sprites (puppy photo driver + cartoon rivals),
   item boxes, bananas, HUD icons
   ============================================================ */
const Sprites = (() => {

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- cute rival heads ---------- */
  function makeHead(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = 120;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    draw(g);
    return c;
  }

  function catHead() {
    return makeHead(g => {
      // ears
      g.fillStyle = '#7e8390';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(60 + s * 38, 52);
        g.lineTo(60 + s * 22, 6);
        g.lineTo(60 + s * 4, 34);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#f8a5c2';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(60 + s * 32, 46);
        g.lineTo(60 + s * 23, 18);
        g.lineTo(60 + s * 12, 36);
        g.closePath(); g.fill();
      }
      // face
      g.fillStyle = '#9aa0ad';
      g.beginPath(); g.ellipse(60, 66, 44, 40, 0, 0, 7); g.fill();
      g.strokeStyle = '#3b3f4a'; g.lineWidth = 5; g.stroke();
      // muzzle
      g.fillStyle = '#f6f7fb';
      g.beginPath(); g.ellipse(60, 80, 24, 17, 0, 0, 7); g.fill();
      // eyes
      g.fillStyle = '#3b3f4a';
      g.beginPath(); g.ellipse(44, 58, 7, 10, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(76, 58, 7, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(46, 54, 2.6, 0, 7); g.fill();
      g.beginPath(); g.arc(78, 54, 2.6, 0, 7); g.fill();
      // nose + mouth
      g.fillStyle = '#e5728f';
      g.beginPath(); g.moveTo(60, 74); g.lineTo(55, 81); g.lineTo(65, 81);
      g.closePath(); g.fill();
      g.strokeStyle = '#3b3f4a'; g.lineWidth = 3.4;
      g.beginPath(); g.arc(53, 86, 6, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(67, 86, 6, 0, Math.PI); g.stroke();
      // whiskers
      g.lineWidth = 2.4;
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
        g.beginPath();
        g.moveTo(60 + s * 26, 76 + i * 8);
        g.lineTo(60 + s * 48, 70 + i * 12);
        g.stroke();
      }
    });
  }

  function bunnyHead() {
    return makeHead(g => {
      // ears
      g.fillStyle = '#eceff4';
      g.strokeStyle = '#3b3f4a'; g.lineWidth = 5;
      for (const s of [-1, 1]) {
        g.save();
        g.translate(60 + s * 16, 30); g.rotate(s * 0.16);
        g.beginPath(); g.ellipse(0, -14, 11, 30, 0, 0, 7);
        g.fill(); g.stroke();
        g.fillStyle = '#ffb7cd';
        g.beginPath(); g.ellipse(0, -12, 5.5, 20, 0, 0, 7); g.fill();
        g.fillStyle = '#eceff4';
        g.restore();
      }
      // face
      g.fillStyle = '#f4f6fa';
      g.beginPath(); g.ellipse(60, 70, 42, 37, 0, 0, 7);
      g.fill(); g.stroke();
      // eyes
      g.fillStyle = '#3b3f4a';
      g.beginPath(); g.ellipse(45, 62, 6.5, 9, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(75, 62, 6.5, 9, 0, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(47, 59, 2.4, 0, 7); g.fill();
      g.beginPath(); g.arc(77, 59, 2.4, 0, 7); g.fill();
      // nose + teeth
      g.fillStyle = '#ff9db4';
      g.beginPath(); g.arc(60, 76, 4.6, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#3b3f4a'; g.lineWidth = 2;
      rr(g, 54, 82, 5.5, 9, 2); g.fill(); g.stroke();
      rr(g, 60.5, 82, 5.5, 9, 2); g.fill(); g.stroke();
      // blush
      g.fillStyle = 'rgba(255,157,180,.5)';
      g.beginPath(); g.ellipse(34, 76, 7, 4.6, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(86, 76, 7, 4.6, 0, 0, 7); g.fill();
    });
  }

  function pandaHead() {
    return makeHead(g => {
      // ears
      g.fillStyle = '#2d3038';
      g.beginPath(); g.arc(28, 28, 15, 0, 7); g.fill();
      g.beginPath(); g.arc(92, 28, 15, 0, 7); g.fill();
      // face
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#2d3038'; g.lineWidth = 5;
      g.beginPath(); g.ellipse(60, 68, 44, 40, 0, 0, 7);
      g.fill(); g.stroke();
      // eye patches
      g.fillStyle = '#2d3038';
      g.beginPath(); g.ellipse(43, 60, 13, 15, -0.35, 0, 7); g.fill();
      g.beginPath(); g.ellipse(77, 60, 13, 15, 0.35, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(46, 56, 4.6, 0, 7); g.fill();
      g.beginPath(); g.arc(74, 56, 4.6, 0, 7); g.fill();
      g.fillStyle = '#2d3038';
      g.beginPath(); g.arc(46, 58, 2.2, 0, 7); g.fill();
      g.beginPath(); g.arc(74, 58, 2.2, 0, 7); g.fill();
      // nose
      g.beginPath(); g.ellipse(60, 82, 8, 6, 0, 0, 7); g.fill();
      g.strokeStyle = '#2d3038'; g.lineWidth = 3;
      g.beginPath(); g.arc(60, 90, 7, 0.2, Math.PI - 0.2); g.stroke();
    });
  }

  /* ---------- kart body (faces RIGHT / +x) ---------- */
  const KART_W = 210, KART_H = 150;

  function makeKart(headImg, color, accent) {
    const c = document.createElement('canvas');
    c.width = KART_W; c.height = KART_H;
    const g = c.getContext('2d');
    g.lineJoin = 'round';

    const cx = KART_W / 2, cy = KART_H / 2;

    /* wheels */
    g.fillStyle = '#23262e';
    g.strokeStyle = '#111319'; g.lineWidth = 4;
    // rear (big)
    for (const s of [-1, 1]) {
      rr(g, cx - 88, cy + s * 34 - 21, 46, 42, 13); g.fill(); g.stroke();
      g.fillStyle = '#59606e';
      g.beginPath(); g.arc(cx - 65, cy + s * 34, 10, 0, 7); g.fill();
      g.fillStyle = '#23262e';
    }
    // front (small)
    for (const s of [-1, 1]) {
      rr(g, cx + 42, cy + s * 32 - 17, 38, 34, 11); g.fill(); g.stroke();
      g.fillStyle = '#59606e';
      g.beginPath(); g.arc(cx + 61, cy + s * 32, 8, 0, 7); g.fill();
      g.fillStyle = '#23262e';
    }

    /* exhausts */
    g.fillStyle = '#8a93a3';
    g.strokeStyle = '#111319'; g.lineWidth = 3.5;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx - 92, cy + s * 12, 9, 6.5, 0, 0, 7);
      g.fill(); g.stroke();
    }

    /* chassis */
    g.fillStyle = color;
    g.strokeStyle = '#1c1f26'; g.lineWidth = 5;
    g.beginPath();
    g.moveTo(cx - 84, cy - 26);
    g.quadraticCurveTo(cx - 30, cy - 40, cx + 30, cy - 33);
    g.quadraticCurveTo(cx + 78, cy - 27, cx + 88, cy - 8);
    g.quadraticCurveTo(cx + 94, cy, cx + 88, cy + 10);
    g.quadraticCurveTo(cx + 76, cy + 30, cx + 20, cy + 34);
    g.quadraticCurveTo(cx - 40, cy + 38, cx - 84, cy + 24);
    g.quadraticCurveTo(cx - 98, cy, cx - 84, cy - 26);
    g.closePath(); g.fill(); g.stroke();

    /* nose stripe */
    g.fillStyle = accent;
    g.beginPath();
    g.moveTo(cx + 50, cy - 24);
    g.quadraticCurveTo(cx + 84, cy - 16, cx + 88, cy - 4);
    g.quadraticCurveTo(cx + 90, cy + 4, cx + 84, cy + 12);
    g.quadraticCurveTo(cx + 62, cy + 24, cx + 44, cy + 22);
    g.quadraticCurveTo(cx + 56, cy, cx + 50, cy - 24);
    g.closePath(); g.fill();

    /* cockpit rim */
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(cx - 22, cy + 2, 40, 34, 0, 0, 7); g.fill();

    /* steering wheel */
    g.strokeStyle = '#2b2f38'; g.lineWidth = 6;
    g.beginPath();
    g.ellipse(cx + 18, cy - 4, 13, 11, -0.25, 0, 7);
    g.stroke();

    /* driver head */
    if (headImg) {
      const hw = 82;
      const hh = hw * (headImg.height / headImg.width);
      g.save();
      g.translate(cx - 24, cy - 18);
      g.rotate(-0.09);
      g.drawImage(headImg, -hw * 0.42, -hh * 0.8, hw, hh);
      g.restore();
    }
    return c;
  }

  /* ---------- item box frames ---------- */
  function makeBoxFrames() {
    const FRAMES = 14, SIZE = 96;
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      const a = f / FRAMES * Math.PI;
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      const g = c.getContext('2d');
      g.translate(SIZE / 2, SIZE / 2);

      const w = 30 * (0.75 + 0.25 * Math.cos(a));   // squash to fake rotation
      const h = 30;
      const grad = g.createLinearGradient(-w, -h, w, h);
      grad.addColorStop(0, 'rgba(126,200,255,.95)');
      grad.addColorStop(.5, 'rgba(255,255,255,.85)');
      grad.addColorStop(1, 'rgba(160,110,255,.95)');
      g.fillStyle = grad;
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.lineWidth = 3;
      g.beginPath();
      g.rect(-w, -h, w * 2, h * 2);
      g.fill(); g.stroke();
      g.fillStyle = '#fff';
      g.font = '900 30px Trebuchet MS, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(80,140,255,.9)';
      g.shadowBlur = 8;
      g.fillText('?', 0, 2);
      g.shadowBlur = 0;
      frames.push(c);
    }
    return frames;
  }

  /* ---------- banana ---------- */
  function makeBanana() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 34);
    g.rotate(-0.35);
    g.fillStyle = '#ffd93d';
    g.strokeStyle = '#c99a17'; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-20, -6);
    g.quadraticCurveTo(0, 22, 20, -6);
    g.quadraticCurveTo(0, 8, -20, -6);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#8d6e00';
    g.beginPath(); g.arc(-20, -6, 3.4, 0, 7); g.fill();
    g.beginPath(); g.arc(20, -6, 3.4, 0, 7); g.fill();
    return c;
  }

  /* ---------- HUD icons ---------- */
  function boneIcon(size, count) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);
    g.rotate(-Math.PI / 5);
    g.fillStyle = '#fdfdf5';
    g.strokeStyle = '#8d8d7a'; g.lineWidth = 3;
    const L = size * 0.3, R = size * 0.11;
    g.beginPath();
    g.moveTo(-L, 0); g.lineTo(L, 0);
    g.lineWidth = R * 1.6; g.strokeStyle = '#fdfdf5'; g.lineCap = 'round';
    g.stroke();
    g.fillStyle = '#fdfdf5'; g.strokeStyle = '#8d8d7a'; g.lineWidth = 2.5;
    for (const ex of [-L, L]) for (const ey of [-R, R]) {
      g.beginPath(); g.arc(ex, ey, R, 0, 7); g.fill(); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (count > 1) {
      g.font = `900 ${size * 0.34 | 0}px Trebuchet MS, sans-serif`;
      g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.lineWidth = size * 0.05;
      g.strokeStyle = '#1c1f26';
      g.fillStyle = '#ffd93d';
      g.strokeText('x' + count, size - 4, size - 4);
      g.fillText('x' + count, size - 4, size - 4);
    }
    return c;
  }

  function bananaIcon(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.drawImage(makeBanana(), 0, 0, size, size);
    return c;
  }

  return { makeKart, catHead, bunnyHead, pandaHead, makeBoxFrames, makeBanana, boneIcon, bananaIcon, KART_W, KART_H };
})();
