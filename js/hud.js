'use strict';
const HUD = (() => {
  const C = { cream: '#f4f1e8', muted: '#b7c2af', orange: '#ed9155', panel: '#13241ddd' };
  let icons = {};
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
  function panel(g, x, y, w, h) {
    g.fillStyle = C.panel; g.beginPath(); g.roundRect(x, y, w, h, 9); g.fill();
    g.strokeStyle = '#e5e9d51f'; g.lineWidth = 1; g.stroke();
  }
  function text(g, value, x, y, size = 12, color = C.cream, weight = 500, align = 'left') {
    g.font = weight + ' ' + size + 'px Arial'; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillStyle = color; g.fillText(value, x, y);
  }
  function map(g, race, x, y, size) {
    panel(g, x, y, size, size + 27);
    text(g, 'PINEWOOD', x + 13, y + 21, 8, C.muted, 600);
    const b = TRACK.getBounds(), scale = Math.min((size - 30) / (b.x1 - b.x0), (size - 26) / (b.y1 - b.y0));
    const ox = x + (size - (b.x1 - b.x0) * scale) / 2;
    const oy = y + 27 + (size - (b.y1 - b.y0) * scale) / 2;
    const X = p => ox + (p.x - b.x0) * scale, Y = p => oy + (p.y - b.y0) * scale;
    g.beginPath(); TRACK.minimapPath.forEach((p, i) => i ? g.lineTo(X(p), Y(p)) : g.moveTo(X(p), Y(p)));
    g.closePath(); g.strokeStyle = '#b2c0a477'; g.lineWidth = 5; g.lineJoin = 'round'; g.stroke();
    const start = TRACK.samples[0]; g.fillStyle = C.orange; g.fillRect(X(start) - 3, Y(start) - 4, 6, 8);
    for (const k of [...race.karts].sort((a,b) => Number(a.isPlayer) - Number(b.isPlayer))) {
      g.fillStyle = k.isPlayer ? C.orange : k.color; g.beginPath(); g.arc(X(k), Y(k), k.isPlayer ? 4.5 : 3, 0, 7); g.fill();
      g.strokeStyle = k.isPlayer ? '#fff' : '#18281d'; g.lineWidth = 1.3; g.stroke();
    }
  }
  function draw(g, W, H, race, time) {
    const scale = W / window.innerWidth;
    const w = W / scale, h = H / scale, compact = w < 650, touch = Input.isTouch;
    const p = race.player, pad = compact ? 15 : 24;
    g.save(); g.scale(scale, scale);
    // CSS-pixel coordinates keep the HUD consistent at every device pixel ratio.
    panel(g, pad, pad, compact ? 93 : 108, 82);
    text(g, 'POSITION', pad + 13, pad + 19, 8, C.muted, 600);
    text(g, String(p.rank).padStart(2, '0'), pad + 12, pad + 64, 42, p.rank === 1 ? C.orange : C.cream, 800);
    text(g, '/ 04', pad + (compact ? 60 : 68), pad + 63, 11, C.muted);
    const lx = pad + (compact ? 106 : 123);
    panel(g, lx, pad, compact ? 120 : 170, 82);
    text(g, 'LAP ' + Math.max(1, Math.min(p.lap, race.laps)) + ' / ' + race.laps, lx + 13, pad + 22, 10, C.cream, 700);
    g.fillStyle = '#f4f1e825'; g.fillRect(lx + 13, pad + 32, compact ? 94 : 144, 1);
    text(g, fmtTime(p.finished ? p.finishTime : race.time), lx + 13, pad + 59, compact ? 18 : 24, C.cream, 500);
    if (!compact) text(g, race.difficulty.toUpperCase() + '  /  GOOD BOY GRAND PRIX', lx + 190, pad + 25, 9, '#f4f1e8', 600);
    // Inventory is always visible, including on touch devices.
    const iy = pad + 97;
    panel(g, pad, iy, compact ? 93 : 108, 92);
    let item = p.rouletteT > 0 ? ['bone', 'banana', 'triple'][Math.floor(time * 12) % 3] : p.item;
    const iconKey = item === 'triple'
      ? (p.itemCount === 1 ? 'bone' : (icons['triple' + p.itemCount] ? 'triple' + p.itemCount : 'triple'))
      : item;
    const iconImg = icons[iconKey] || (item ? icons[item] : null);
    if (iconImg) g.drawImage(iconImg, pad + (compact ? 22 : 29.5), iy + 5, 49, 49);
    else text(g, '+', pad + (compact ? 46 : 54), iy + 43, 30, '#b7c2af66', 300, 'center');
    const names = { bone: 'BONE BOOST', triple: 'BOOST × ' + p.itemCount, banana: 'BANANA' };
    text(g, p.rouletteT > 0 ? 'PICKING…' : names[p.item] || 'FIND AN ITEM', pad + (compact ? 46 : 54), iy + 68, 8, item ? C.orange : C.muted, 600, 'center');
    text(g, touch ? 'TAP ITEM TO USE' : '[ SPACE ]', pad + (compact ? 46 : 54), iy + 83, 7, C.muted, 500, 'center');
    const mapSize = h < 480 ? 85 : compact ? 106 : 151;
    map(g, race, w - mapSize - pad, pad + 64, mapSize);
    // Compact speed readout moves above the touch pedals.
    const sx = touch ? pad + (compact ? 106 : 123) : w - pad - (compact ? 120 : 161);
    const sy = touch ? iy : h - 122;
    panel(g, sx, sy, compact ? 120 : 161, 94);
    text(g, String(Math.round(Math.abs(p.v) * .32)).padStart(3, '0'), sx + 13, sy + 53, compact ? 35 : 45, C.cream, 600);
    text(g, 'KM/H', sx + (compact ? 85 : 120), sy + 53, 8, C.muted, 600);
    g.fillStyle = '#a9ba952b'; g.fillRect(sx + 14, sy + 69, compact ? 92 : 132, 3);
    g.fillStyle = p.boostT > 0 ? C.orange : '#b5c996';
    g.fillRect(sx + 14, sy + 69, (compact ? 92 : 132) * Math.min(1, Math.abs(p.v) / (PHYS.MAX_SPEED * p.speedMul * 1.42)), 3);
    text(g, p.boostT > 0 ? 'BOOST ACTIVE' : p.surface === TRACK.GRASS ? 'OFF ROAD' : 'BEAR / NO. 01', sx + 14, sy + 85, 7, p.boostT > 0 ? C.orange : C.muted, 600);
    if (!touch && !compact) text(g, 'WASD / DRIVE     SHIFT / DRIFT     SPACE / ITEM     R / RECOVER', pad, h - 25, 9, C.muted, 500);
    if (p.drifting) {
      const x = w / 2 - 95, y = h - (touch ? 205 : 69);
      panel(g, x, y, 190, 45);
      const tier = p.driftCharge >= PHYS.MINI_T2 ? 2 : p.driftCharge >= PHYS.MINI_T1 ? 1 : 0;
      const color = tier === 2 ? C.orange : tier === 1 ? '#74c9e0' : C.muted;
      text(g, tier ? 'RELEASE FOR ' + (tier === 2 ? 'SUPER BOOST' : 'BOOST') : 'BUILDING DRIFT', w / 2, y + 18, 8, color, 700, 'center');
      g.fillStyle = '#f4f1e82b'; g.fillRect(x + 13, y + 28, 164, 4);
      g.fillStyle = color; g.fillRect(x + 13, y + 28, 164 * Math.min(1, p.driftCharge / PHYS.MINI_T2), 4);
    }
    const m = [...race.msgs].reverse().find(m => time - m.t0 >= 0 && time - m.t0 < m.dur);
    const warning = p.wrongWay ? 'WRONG WAY · TURN AROUND' : null;
    const message = warning || (m && m.text);
    if (message) {
      const width = Math.min(w - 30, 360), y = h * .31;
      g.globalAlpha = warning || Game.reducedMotion ? 1 : Math.min(1, (m.dur - (time - m.t0)) * 3);
      panel(g, (w - width) / 2, y, width, 45);
      text(g, message, w / 2, y + 29, compact ? 15 : 20, warning ? '#ffac7c' : C.cream, 700, 'center');
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
  return { draw, fmtTime, buildIcons };
})();
