'use strict';
// Cached billboard artwork: world-space placement, screen-space verticals.
const Scenery = (() => {
  const objects = [];
  let seed = 81;
  const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d')];
  }
  function pine(tone) {
    const [c, g] = canvas(160, 290);
    g.fillStyle = '#514431'; g.fillRect(74, 205, 13, 83);
    const shades = tone ? ['#344c37', '#425d3b', '#576d43'] : ['#243e32', '#30503b', '#476345'];
    for (let layer = 0; layer < 6; layer++) {
      const top = 8 + layer * 29, wide = 28 + layer * 10;
      g.fillStyle = shades[layer % 3];
      g.beginPath(); g.moveTo(80, top);
      for (let i = 1; i < 6; i++) g.lineTo(80 + wide * i / 5 + (i % 2 ? 4 : -4), top + i * 17);
      g.lineTo(80 - wide, top + 85);
      for (let i = 5; i > 0; i--) g.lineTo(80 - wide * i / 5 + (i % 2 ? 4 : -4), top + i * 17);
      g.closePath(); g.fill();
      g.fillStyle = '#d0b86b16'; g.beginPath(); g.moveTo(80, top); g.lineTo(80 + wide, top + 85); g.lineTo(85, top + 70); g.fill();
    }
    return c;
  }
  function board(text) {
    const [c, g] = canvas(256, 130);
    g.fillStyle = '#575846'; g.fillRect(22, 55, 7, 75); g.fillRect(227, 55, 7, 75);
    g.fillStyle = '#192d25'; g.fillRect(0, 0, 256, 76);
    g.strokeStyle = '#8d9d75'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 72);
    g.fillStyle = '#f4f1e8'; g.textAlign = 'center'; g.font = 'bold 23px Arial'; g.fillText(text, 128, 35);
    g.font = '9px Arial'; g.fillStyle = '#ed985c'; g.fillText('BEAR KART  /  PINEWOOD', 128, 57);
    return c;
  }
  const trees = [pine(0), pine(1)];
  const signs = [board('PINEWOOD'), board('CHASE THE LINE'), board('› › ›'), board('GOOD BOY GP')];
  for (let s = 0; s < TRACK.LENGTH; s += 80) {
    const p = TRACK.poseAt(s);
    for (const side of [-1, 1]) {
      const offset = TRACK.HALF + 60 + random() * 210;
      const x = p.x - Math.sin(p.a) * side * offset;
      const y = p.y + Math.cos(p.a) * side * offset;
      const near = TRACK.samples[TRACK.nearestIdx(x, y)];
      if (Math.hypot(x - near.x, y - near.y) < TRACK.HALF + 45) continue;
      objects.push({ x, y, sprite: trees[random() > .5 ? 1 : 0], height: 95 + random() * 95 });
    }
  }
  const signCount = 10;
  const startS = 320, endS = TRACK.LENGTH - 420;
  const stepS = (endS - startS) / (signCount - 1);
  for (let i = 0; i < signCount; i++) {
    const s = startS + i * stepS;
    const p = TRACK.poseAt(s);
    const side = (i % 2 === 0) ? 1 : -1;
    objects.push({
      x: p.x - Math.sin(p.a) * side * (TRACK.HALF + 30),
      y: p.y + Math.cos(p.a) * side * (TRACK.HALF + 30),
      sprite: signs[i % signs.length],
      height: 37
    });
  }
  function rivalKart(ch) {
    const [c, g] = canvas(256, 260);
    g.fillStyle = '#121a18';
    for (const x of [17, 189]) {
      g.beginPath(); g.roundRect(x, 153, 50, 83, 15); g.fill();
      g.fillStyle = '#323d39'; g.fillRect(x + 7, 160, 5, 64); g.fillStyle = '#121a18';
    }
    g.fillStyle = '#a4aaa1'; g.fillRect(39, 191, 177, 9);
    const shell = g.createLinearGradient(50, 0, 207, 0);
    shell.addColorStop(0, '#28382e'); shell.addColorStop(.35, ch.color); shell.addColorStop(.7, ch.color); shell.addColorStop(1, '#1b2a22');
    g.fillStyle = shell; g.beginPath(); g.roundRect(53, 140, 151, 86, [32,32,13,13]); g.fill();
    g.fillStyle = ch.accent; g.fillRect(119, 141, 18, 83);
    g.fillStyle = '#ed6946'; for (const x of [74, 169]) { g.beginPath(); g.arc(x, 199, 7, 0, 7); g.fill(); }
    // Silhouettes are seen from behind, so animal faces do not face the camera.
    g.fillStyle = ch.id === 'bear' ? '#ad7745' : ch.id === 'cat' ? '#92968a' : '#d8d9c9';
    g.beginPath(); g.ellipse(128, 111, 47, 56, 0, 0, 7); g.fill();
    for (const side of [-1,1]) {
      if (ch.id === 'bunny') { g.beginPath(); g.ellipse(128 + side * 23, 35, 13, 36, side * .12, 0, 7); g.fill(); }
      else if (ch.id === 'cat' || ch.id === 'bear') { g.beginPath(); g.moveTo(128 + side * 45, 87); g.lineTo(128 + side * 43, 20); g.lineTo(128 + side * 9, 70); g.fill(); }
      else { g.fillStyle = '#222c29'; g.beginPath(); g.arc(128 + side * 35, 56, 20, 0, 7); g.fill(); }
    }
    g.fillStyle = '#16201d'; g.beginPath(); g.roundRect(78, 139, 100, 36, 14); g.fill();
    g.strokeStyle = '#677464'; g.lineWidth = 2; g.stroke();
    return c;
  }
  return { objects, rivalKart };
})();
