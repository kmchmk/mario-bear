'use strict';
const HUD = (() => {
  const C = { cream: '#f4f1e8', muted: '#b7c2af', orange: '#ed9155', panel: '#13241ddd' };
  let icons = {};
  let itemBounds = { x: 0, y: 0, w: 0, h: 0 };

  function fmtTime(t) {
    if (!Number.isFinite(t) || t < 0) return '--:--.--';
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '.' + String(Math.floor(t * 100) % 100).padStart(2, '0');
  }

  function buildIcons() {
    icons = {
      bone: Sprites.boneIcon(80, 1),
      triple: Sprites.boneIcon(80, 3),
      triple3: Sprites.boneIcon(80, 3),
      triple2: Sprites.boneIcon(80, 2),
      banana: Sprites.bananaIcon(80)
    };
  }

  function panel(g, x, y, w, h, r = 9) {
    g.fillStyle = C.panel; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
    g.strokeStyle = '#e5e9d51f'; g.lineWidth = 1; g.stroke();
  }

  function text(g, value, x, y, size = 12, color = C.cream, weight = 500, align = 'left') {
    g.font = weight + ' ' + size + 'px Arial'; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = color; g.fillText(value, x, y);
  }

  function getSafeInsets() {
    if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
    const probe = document.getElementById('safe-area-probe');
    if (!probe || !probe.getBoundingClientRect) return { top: 0, right: 0, bottom: 0, left: 0 };
    const r = probe.getBoundingClientRect();
    const winW = typeof window !== 'undefined' ? window.innerWidth : 800;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
    return {
      top: Math.max(0, r.top || 0),
      left: Math.max(0, r.left || 0),
      right: Math.max(0, winW - (r.right || winW)),
      bottom: Math.max(0, winH - (r.bottom || winH))
    };
  }

  function hitItemBox(x, y) {
    return x >= itemBounds.x && x <= itemBounds.x + itemBounds.w &&
           y >= itemBounds.y && y <= itemBounds.y + itemBounds.h;
  }

  function map(g, race, x, y, size) {
    panel(g, x, y, size, size + 24, 8);
    text(g, 'PINEWOOD', x + 10, y + 16, 7.5, C.muted, 600);
    const b = TRACK.getBounds(), scale = Math.min((size - 24) / (b.x1 - b.x0), (size - 22) / (b.y1 - b.y0));
    const ox = x + (size - (b.x1 - b.x0) * scale) / 2;
    const oy = y + 22 + (size - (b.y1 - b.y0) * scale) / 2;
    const X = p => ox + (p.x - b.x0) * scale, Y = p => oy + (p.y - b.y0) * scale;
    g.beginPath(); TRACK.minimapPath.forEach((p, i) => i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)));
    g.closePath(); g.strokeStyle = '#b2c0a477'; g.lineWidth = 4.5; g.lineJoin = 'round'; g.stroke();
    const start = TRACK.samples[0]; g.fillStyle = C.orange; g.fillRect(X(start) - 3, Y(start) - 4, 6, 8);
    for (const k of [...race.karts].sort((a,b) => Number(a.isPlayer) - Number(b.isPlayer))) {
      g.fillStyle = k.isPlayer ? C.orange : k.color; g.beginPath(); g.arc(X(k), Y(k), k.isPlayer ? 4 : 2.7, 0, 7); g.fill();
      g.strokeStyle = k.isPlayer ? '#fff' : '#18281d'; g.lineWidth = 1.2; g.stroke();
    }
  }

  function draw(g, W, H, race, time) {
    const winW = typeof window !== 'undefined' ? window.innerWidth : W;
    const winH = typeof window !== 'undefined' ? window.innerHeight : H;
    const scale = W / winW;
    const w = W / scale, h = H / scale;
    const touch = Input.isTouch;
    const p = race.player;
    const insets = getSafeInsets();

    const isLandscape = w > h;
    const isShort = h < 550;
    const isMobileLandscape = isLandscape && isShort;
    const isPortraitMobile = !isLandscape && w < 650;
    const compact = w < 650 || isShort;

    g.save(); g.scale(scale, scale);

    let item = p.rouletteT > 0 ? ['bone', 'banana', 'triple'][Math.floor(time * 12) % 3] : p.item;
    const iconKey = item === 'triple'
      ? (p.itemCount === 1 ? 'bone' : (icons['triple' + p.itemCount] ? 'triple' + p.itemCount : 'triple'))
      : item;
    const iconImg = icons[iconKey] || (item ? icons[item] : null);
    const itemNames = { bone: 'BONE BOOST', triple: 'BOOST × ' + p.itemCount, banana: 'BANANA' };
    const currentSpeed = Math.round(Math.abs(p.v) * .32);
    const speedRatio = Math.min(1, Math.abs(p.v) / (PHYS.MAX_SPEED * p.speedMul * 1.42));
    const speedStatus = p.boostT > 0 ? 'BOOST ACTIVE' : (p.surface === TRACK.GRASS ? 'OFF ROAD' : 'BEAR / NO. 01');

    if (isMobileLandscape) {
      const padX = Math.max(12, insets.left + 8);
      const padY = Math.max(8, insets.top + 6);
      const padRight = Math.max(12, insets.right + 8);
      const barH = 46;

      panel(g, padX, padY, 66, barH, 7);
      text(g, 'POS', padX + 8, padY + 12, 7, C.muted, 600);
      text(g, String(p.rank).padStart(2, '0'), padX + 8, padY + 37, 24, p.rank === 1 ? C.orange : C.cream, 800);
      text(g, '/04', padX + 38, padY + 36, 9, C.muted);

      const lx = padX + 71;
      panel(g, lx, padY, 112, barH, 7);
      text(g, 'LAP ' + Math.max(1, Math.min(p.lap, race.laps)) + ' / ' + race.laps, lx + 9, padY + 13, 8.5, C.cream, 700);
      g.fillStyle = '#f4f1e825'; g.fillRect(lx + 9, padY + 18, 94, 1);
      text(g, fmtTime(p.finished ? p.finishTime : race.time), lx + 9, padY + 37, 16, C.cream, 500);

      const sx = lx + 117;
      panel(g, sx, padY, 94, barH, 7);
      text(g, String(currentSpeed).padStart(3, '0'), sx + 9, padY + 28, 20, C.cream, 600);
      text(g, 'KM/H', sx + 52, padY + 28, 7.5, C.muted, 600);
      g.fillStyle = '#a9ba952b'; g.fillRect(sx + 9, padY + 33, 76, 2.5);
      g.fillStyle = p.boostT > 0 ? C.orange : '#b5c996';
      g.fillRect(sx + 9, padY + 33, 76 * speedRatio, 2.5);
      text(g, speedStatus, sx + 9, padY + 42, 6.5, p.boostT > 0 ? C.orange : C.muted, 600);

      const ix = sx + 99;
      panel(g, ix, padY, 82, barH, 7);
      itemBounds = { x: ix, y: padY, w: 82, h: barH };
      if (iconImg) {
        g.drawImage(iconImg, ix + 5, padY + 6, 34, 34);
        text(g, p.rouletteT > 0 ? 'PICKING…' : (itemNames[item] || 'ITEM'), ix + 42, padY + 22, 7, item ? C.orange : C.muted, 600);
        text(g, touch ? 'TAP USE' : '[SPACE]', ix + 42, padY + 35, 6.5, C.muted, 500);
      } else {
        text(g, '+', ix + 18, padY + 30, 22, '#b7c2af66', 300, 'center');
        text(g, 'ITEM', ix + 52, padY + 22, 7, C.muted, 600, 'center');
        text(g, touch ? 'TAP' : '[SPACE]', ix + 52, padY + 35, 6.5, C.muted, 500, 'center');
      }

      const mapSize = Math.min(74, Math.max(60, h * 0.22));
      map(g, race, w - padRight - mapSize, padY + 46, mapSize);

      if (p.drifting) {
        const dx = w / 2 - 80, dy = h - Math.max(insets.bottom + 14, 18) - 34;
        panel(g, dx, dy, 160, 34, 6);
        const tier = p.driftCharge >= PHYS.MINI_T2 ? 2 : p.driftCharge >= PHYS.MINI_T1 ? 1 : 0;
        const color = tier === 2 ? C.orange : tier === 1 ? '#74c9e0' : C.muted;
        text(g, tier ? 'RELEASE FOR ' + (tier === 2 ? 'SUPER BOOST' : 'BOOST') : 'BUILDING DRIFT', w / 2, dy + 14, 7.5, color, 700, 'center');
        g.fillStyle = '#f4f1e82b'; g.fillRect(dx + 10, dy + 21, 140, 3.5);
        g.fillStyle = color; g.fillRect(dx + 10, dy + 21, 140 * Math.min(1, p.driftCharge / PHYS.MINI_T2), 3.5);
      }
    } else if (isPortraitMobile) {
      const padX = Math.max(12, insets.left + 8);
      const padY = Math.max(12, insets.top + 8);
      const padRight = Math.max(12, insets.right + 8);

      panel(g, padX, padY, 78, 62, 8);
      text(g, 'POSITION', padX + 10, padY + 16, 7.5, C.muted, 600);
      text(g, String(p.rank).padStart(2, '0'), padX + 9, padY + 50, 32, p.rank === 1 ? C.orange : C.cream, 800);
      text(g, '/ 04', padX + 48, padY + 49, 9.5, C.muted);

      const lx = padX + 84;
      panel(g, lx, padY, 116, 62, 8);
      text(g, 'LAP ' + Math.max(1, Math.min(p.lap, race.laps)) + ' / ' + race.laps, lx + 10, padY + 18, 9, C.cream, 700);
      g.fillStyle = '#f4f1e825'; g.fillRect(lx + 10, padY + 25, 96, 1);
      text(g, fmtTime(p.finished ? p.finishTime : race.time), lx + 10, padY + 49, 17, C.cream, 500);

      const iy = padY + 68;
      panel(g, padX, iy, 78, 72, 8);
      itemBounds = { x: padX, y: iy, w: 78, h: 72 };
      if (iconImg) {
        g.drawImage(iconImg, padX + 17, iy + 4, 44, 44);
        text(g, p.rouletteT > 0 ? 'PICKING…' : (itemNames[item] || 'FIND ITEM'), padX + 39, iy + 55, 7, item ? C.orange : C.muted, 600, 'center');
        text(g, touch ? 'TAP TO USE' : '[ SPACE ]', padX + 39, iy + 66, 6.5, C.muted, 500, 'center');
      } else {
        text(g, '+', padX + 39, iy + 36, 26, '#b7c2af66', 300, 'center');
        text(g, 'FIND ITEM', padX + 39, iy + 55, 7, C.muted, 600, 'center');
        text(g, touch ? 'TAP TO USE' : '[ SPACE ]', padX + 39, iy + 66, 6.5, C.muted, 500, 'center');
      }

      const sx = lx;
      panel(g, sx, iy, 116, 72, 8);
      text(g, String(currentSpeed).padStart(3, '0'), sx + 10, iy + 42, 28, C.cream, 600);
      text(g, 'KM/H', sx + 74, iy + 42, 7.5, C.muted, 600);
      g.fillStyle = '#a9ba952b'; g.fillRect(sx + 10, iy + 51, 96, 2.5);
      g.fillStyle = p.boostT > 0 ? C.orange : '#b5c996';
      g.fillRect(sx + 10, iy + 51, 96 * speedRatio, 2.5);
      text(g, speedStatus, sx + 10, iy + 65, 6.5, p.boostT > 0 ? C.orange : C.muted, 600);

      const mapSize = Math.min(84, Math.max(68, w * 0.22));
      map(g, race, w - padRight - mapSize, padY + 66, mapSize);

      if (p.drifting) {
        const dx = w / 2 - 85, dy = h - Math.max(insets.bottom + 145, 160);
        panel(g, dx, dy, 170, 38, 7);
        const tier = p.driftCharge >= PHYS.MINI_T2 ? 2 : p.driftCharge >= PHYS.MINI_T1 ? 1 : 0;
        const color = tier === 2 ? C.orange : tier === 1 ? '#74c9e0' : C.muted;
        text(g, tier ? 'RELEASE FOR ' + (tier === 2 ? 'SUPER BOOST' : 'BOOST') : 'BUILDING DRIFT', w / 2, dy + 15, 7.5, color, 700, 'center');
        g.fillStyle = '#f4f1e82b'; g.fillRect(dx + 11, dy + 23, 148, 3.5);
        g.fillStyle = color; g.fillRect(dx + 11, dy + 23, 148 * Math.min(1, p.driftCharge / PHYS.MINI_T2), 3.5);
      }
    } else {
      const pad = 24;
      panel(g, pad, pad, 108, 82);
      text(g, 'POSITION', pad + 13, pad + 19, 8, C.muted, 600);
      text(g, String(p.rank).padStart(2, '0'), pad + 12, pad + 64, 42, p.rank === 1 ? C.orange : C.cream, 800);
      text(g, '/ 04', pad + 68, pad + 63, 11, C.muted);

      const lx = pad + 123;
      panel(g, lx, pad, 170, 82);
      text(g, 'LAP ' + Math.max(1, Math.min(p.lap, race.laps)) + ' / ' + race.laps, lx + 13, pad + 22, 10, C.cream, 700);
      g.fillStyle = '#f4f1e825'; g.fillRect(lx + 13, pad + 32, 144, 1);
      text(g, fmtTime(p.finished ? p.finishTime : race.time), lx + 13, pad + 59, 24, C.cream, 500);
      text(g, race.difficulty.toUpperCase() + '  /  GOOD BOY GRAND PRIX', lx + 190, pad + 25, 9, '#f4f1e8', 600);

      const iy = pad + 97;
      panel(g, pad, iy, 108, 92);
      itemBounds = { x: pad, y: iy, w: 108, h: 92 };
      if (iconImg) g.drawImage(iconImg, pad + 29.5, iy + 5, 49, 49);
      else text(g, '+', pad + 54, iy + 43, 30, '#b7c2af66', 300, 'center');
      text(g, p.rouletteT > 0 ? 'PICKING…' : (itemNames[item] || 'FIND AN ITEM'), pad + 54, iy + 68, 8, item ? C.orange : C.muted, 600, 'center');
      text(g, '[ SPACE ]', pad + 54, iy + 83, 7, C.muted, 500, 'center');

      const mapSize = 151;
      map(g, race, w - mapSize - pad, pad + 64, mapSize);

      const sx = w - pad - 161;
      const sy = h - 122;
      panel(g, sx, sy, 161, 94);
      text(g, String(currentSpeed).padStart(3, '0'), sx + 13, sy + 53, 45, C.cream, 600);
      text(g, 'KM/H', sx + 120, sy + 53, 8, C.muted, 600);
      g.fillStyle = '#a9ba952b'; g.fillRect(sx + 14, sy + 69, 132, 3);
      g.fillStyle = p.boostT > 0 ? C.orange : '#b5c996';
      g.fillRect(sx + 14, sy + 69, 132 * speedRatio, 3);
      text(g, speedStatus, sx + 14, sy + 85, 7, p.boostT > 0 ? C.orange : C.muted, 600);

      text(g, 'WASD / DRIVE     SHIFT / DRIFT     SPACE / ITEM     R / RECOVER', pad, h - 25, 9, C.muted, 500);

      if (p.drifting) {
        const x = w / 2 - 95, y = h - 69;
        panel(g, x, y, 190, 45);
        const tier = p.driftCharge >= PHYS.MINI_T2 ? 2 : p.driftCharge >= PHYS.MINI_T1 ? 1 : 0;
        const color = tier === 2 ? C.orange : tier === 1 ? '#74c9e0' : C.muted;
        text(g, tier ? 'RELEASE FOR ' + (tier === 2 ? 'SUPER BOOST' : 'BOOST') : 'BUILDING DRIFT', w / 2, y + 18, 8, color, 700, 'center');
        g.fillStyle = '#f4f1e82b'; g.fillRect(x + 13, y + 28, 164, 4);
        g.fillStyle = color; g.fillRect(x + 13, y + 28, 164 * Math.min(1, p.driftCharge / PHYS.MINI_T2), 4);
      }
    }

    const m = [...race.msgs].reverse().find(m => time - m.t0 >= 0 && time - m.t0 < m.dur);
    const warning = p.wrongWay ? 'WRONG WAY · TURN AROUND' : null;
    const message = warning || (m && m.text);
    if (message) {
      const width = Math.min(w - 30, isShort ? 300 : 360);
      const y = isMobileLandscape ? Math.max(54, insets.top + 52) : (isPortraitMobile ? Math.max(162, insets.top + 158) : h * .31);
      g.globalAlpha = warning || Game.reducedMotion ? 1 : Math.min(1, (m.dur - (time - m.t0)) * 3);
      panel(g, (w - width) / 2, y, width, isShort ? 36 : 45, 8);
      text(g, message, w / 2, y + (isShort ? 23 : 29), compact ? 14 : 20, warning ? '#ffac7c' : C.cream, 700, 'center');
      g.globalAlpha = 1;
    }
    if (p.boostT > 0 && !Game.reducedMotion) {
      g.globalAlpha = .22; g.strokeStyle = C.cream; g.lineWidth = 1.4;
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * Math.PI * 2, phase = (time * 2 + i * .17) % 1;
        const radius = Math.max(w, h) * (.35 + phase * .2);
        g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * radius, h * .45 + Math.sin(a) * radius);
        g.lineTo(w / 2 + Math.cos(a) * (radius + 40), h * .45 + Math.sin(a) * (radius + 40)); g.stroke();
      }
    }
    g.restore();
  }
  return { draw, fmtTime, buildIcons, hitItemBox };
})();
