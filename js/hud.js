'use strict';
/* ============================================================
   hud.js — laps, timer, position badge, minimap, item slot,
   messages, wrong-way & boost effects (all canvas-drawn)
   ============================================================ */
const HUD = (() => {

  const ORD = ['st', 'nd', 'rd', 'th'];
  const RANK_COL = ['#ffd93d', '#e3e9f0', '#ffab73', '#b6c1cf'];

  function fmtTime(t) {
    if (t == null) return '--:--.--';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const c = Math.floor((t * 100) % 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
  }

  let posPulse = 0, lastRank = 0;

  /* ---------- minimap ---------- */
  function drawMinimap(g, W, size, race) {
    const pad = Math.max(10, size * 0.09);
    const my0 = 72;                              // below the pause button
    g.save();
    g.globalAlpha = .92;
    g.fillStyle = 'rgba(12,20,38,.62)';
    rrPath(g, W - size - 14, my0, size, size, 16); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.stroke();

    const b = TRACK.getBounds();
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const sc = Math.min((size - pad * 2) / bw, (size - pad * 2) / bh);
    const ox = W - size - 14 + pad + ((size - pad * 2) - bw * sc) / 2;
    const oy = my0 + pad + ((size - pad * 2) - bh * sc) / 2;
    const T = p => [ox + (p.x - b.x0) * sc, oy + (p.y - b.y0) * sc];

    /* road */
    g.beginPath();
    TRACK.minimapPath.forEach((p, i) => {
      const [x, y] = T(p);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = '#f4f4f4'; g.lineWidth = Math.max(5, size * .055);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    g.strokeStyle = '#8f97a8'; g.lineWidth = Math.max(2.4, size * .03); g.stroke();

    /* start line notch */
    {
      const s0 = TRACK.samples[0];
      const [x, y] = T(s0);
      g.save(); g.translate(x, y); g.rotate(s0.a);
      g.fillStyle = '#ffd93d';
      g.fillRect(-2, -size * .04, 4, size * .08);
      g.restore();
    }
    /* boosts */
    g.fillStyle = '#ff9d2e';
    for (const bp of TRACK.boosts) {
      const [x, y] = T(bp);
      g.beginPath(); g.arc(x, y, Math.max(2, size * .02), 0, 7); g.fill();
    }
    /* item boxes */
    for (const box of race.itemBoxes) {
      if (!box.active) continue;
      const [x, y] = T(box);
      g.fillStyle = '#7ec8ff';
      g.fillRect(x - size * .014, y - size * .014, size * .028, size * .028);
    }

    /* karts */
    for (const k of race.karts) {
      const [x, y] = T(k);
      if (k.isPlayer) {
        g.fillStyle = k.color;
        g.beginPath(); g.arc(x, y, size * .045, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.strokeStyle = k.color; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(k.angle) * size * .075,
                 y + Math.sin(k.angle) * size * .075);
        g.stroke();
      } else {
        g.fillStyle = k.color;
        g.beginPath(); g.arc(x, y, size * .032, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; g.stroke();
      }
    }
    g.restore();
  }

  function rrPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- main draw ---------- */
  function draw(g, W, H, race, time) {
    const u = H / 720;                     // scale unit
    const player = race.player;
    if (!player) return;

    /* ---- lap + timer pill ---- */
    const lapNum = Math.min(Math.max(player.lap, 1), race.laps);
    const lapTxt = 'LAP ' + lapNum + '/' + race.laps;
    g.font = `900 ${28 * u | 0}px Trebuchet MS, sans-serif`;
    const tw = g.measureText(lapTxt).width;
    const px = 16 * u, py = 14 * u;
    g.fillStyle = 'rgba(12,20,38,.55)';
    rrPath(g, px, py, tw + 34 * u, 40 * u, 12 * u); g.fill();
    g.fillStyle = player.lap >= race.laps ? '#ffd93d' : '#fff';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(lapTxt, px + 17 * u, py + 21 * u);

    g.font = `700 ${22 * u | 0}px "Courier New", monospace`;
    g.fillStyle = '#fff';
    g.fillText(fmtTime(race.time), px + 4 * u, py + 66 * u);

    /* final lap flash */
    if (lapNum === race.laps && !player.finished) {
      const a = .5 + .5 * Math.sin(time * 6);
      g.font = `900 ${20 * u | 0}px Trebuchet MS, sans-serif`;
      g.fillStyle = `rgba(255,217,61,${a})`;
      g.fillText('FINAL LAP!', px + 4 * u, py + 96 * u);
    }

    /* ---- minimap ---- */
    const mmSize = Math.max(104, Math.min(H * .24, W * .26));
    drawMinimap(g, W, mmSize, race);

    /* ---- item slot (desktop) or next to item button (touch) ---- */
    if (!Input.isTouch || W > 760) {
      const S = 74 * u;
      const ix = px, iy = py + 118 * u;
      g.fillStyle = 'rgba(12,20,38,.5)';
      rrPath(g, ix, iy, S, S, 14 * u); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2.5 * u; g.stroke();

      let icon = null;
      if (player.rouletteT > 0) {
        icon = ICONS[(time * 14 | 0) % ICONS.length];
      } else if (player.item === 'bone') icon = ICON_BONE;
      else if (player.item === 'banana') icon = ICON_BANANA;
      else if (player.item === 'triple') icon = ICON_TRIPLE;

      if (icon) {
        const m = 10 * u;
        g.drawImage(icon, ix + m, iy + m, S - 2 * m, S - 2 * m);
      } else {
        g.font = `900 ${30 * u | 0}px Trebuchet MS`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,.25)';
        g.fillText('?', ix + S / 2, iy + S / 2 + 2);
      }
    }

    /* ---- position badge ---- */
    const rank = Math.min(player.rank, 4);
    if (rank !== lastRank) { posPulse = 1; lastRank = rank; }
    posPulse = Math.max(0, posPulse - .06);

    const fs = (86 + posPulse * 18) * u;
    const num = String(rank), suf = ORD[rank - 1];
    /* measure, then draw left-anchored so nothing clips */
    g.font = `900 ${fs | 0}px Trebuchet MS, sans-serif`;
    const nw = g.measureText(num).width;
    g.font = `900 ${fs * .48 | 0}px Trebuchet MS, sans-serif`;
    const sw = g.measureText(suf).width;
    const totalW = nw + sw * .92;

    const badgeBottom = Input.isTouch && W < 900
      ? H - 224 * u
      : H - 52 * u;
    const bx = Math.max(totalW * 1.06, W - 26 * u) - totalW;
    const by = badgeBottom;

    g.save();
    g.translate(bx, by);
    g.transform(1, 0, -0.18, 1, 0, 0);       // italic slant
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.lineWidth = 10 * u;
    g.strokeStyle = '#141a26';
    g.fillStyle = RANK_COL[rank - 1];
    g.font = `900 ${fs | 0}px Trebuchet MS, sans-serif`;
    g.strokeText(num, 0, 0); g.fillText(num, 0, 0);
    g.font = `900 ${fs * .48 | 0}px Trebuchet MS, sans-serif`;
    g.strokeText(suf, nw * 1.02, -fs * .05);
    g.fillText(suf, nw * 1.02, -fs * .05);
    g.restore();

    /* ---- wrong way ---- */
    if (player.wrongWay && Math.sin(time * 9) > 0) {
      g.font = `900 ${44 * u | 0}px Trebuchet MS, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 8 * u; g.strokeStyle = '#5e0000';
      g.fillStyle = '#ff5252';
      g.strokeText('WRONG WAY!', W / 2, H * .3);
      g.fillText('WRONG WAY!', W / 2, H * .3);
    }

    /* ---- center messages ---- */
    for (const m of race.msgs) {
      const t = (time - m.t0) / m.dur;
      if (t < 0 || t > 1) continue;
      const pop = t < .15 ? t / .15 : 1;
      const fade = t > .75 ? 1 - (t - .75) / .25 : 1;
      const sc = .6 + pop * .55;
      g.save();
      g.translate(W / 2, H * .3);
      g.scale(sc, sc);
      g.globalAlpha = fade;
      const mfs = Math.min(64 * u, W * .085);
      g.font = `900 ${mfs | 0}px Trebuchet MS, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10 * u; g.strokeStyle = 'rgba(20,26,38,.9)';
      g.strokeText(m.text, 0, 0);
      g.fillStyle = m.color;
      g.fillText(m.text, 0, 0);
      g.restore();
    }

    /* ---- boost speed lines ---- */
    if (player.boostT > 0) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.32)';
      g.lineWidth = 3 * u;
      const cx = W / 2, cy = H * .52;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = Math.min(W, H) * (.42 + Math.random() * .2);
        const r1 = r0 + 60 * u + Math.random() * 70 * u;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }
      g.restore();
    }
  }

  /* icons built lazily after Sprites ready */
  let ICONS = [], ICON_BONE, ICON_BANANA, ICON_TRIPLE;
  function buildIcons() {
    ICON_BONE = Sprites.boneIcon(64, 1);
    ICON_BANANA = Sprites.bananaIcon(64);
    ICON_TRIPLE = Sprites.boneIcon(64, 3);
    ICONS = [
      Sprites.boneIcon(56, 1),
      Sprites.bananaIcon(56),
      Sprites.boneIcon(56, 3)
    ];
  }

  return { draw, fmtTime, buildIcons };
})();
