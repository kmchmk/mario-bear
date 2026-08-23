'use strict';
/* ============================================================
   track.js — circuit spline, Mode-7 world texture, surface map
   ============================================================ */
const TRACK = (() => {

  const WORLD = 2048;          // world size (square)
  const ROAD_W = 112;          // road width in world units
  const HALF = ROAD_W / 2;

  /* ---------- control points of the circuit (travel order) ----------
     start/finish sits mid-bottom-straight -> right sweepers -> S-chicane -> left side */
  const CTRL = [
    [1050, 1790], [1560, 1710],
    [1840, 1350], [1860, 930],
    [1620, 610], [1230, 545],
    [1010, 745],
    [760, 550],
    [480, 620], [300, 950], [350, 1420],
    [520, 1700]
  ];

  /* ---------- closed Catmull-Rom spline ---------- */
  function cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    };
  }

  // raw dense samples along spline
  const raw = [];
  const N = CTRL.length;
  const P = i => CTRL[(i % N + N) % N];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < 24; j++) {
      raw.push(cr(P(i - 1), P(i), P(i + 1), P(i + 2), j / 24));
    }
  }

  // resample uniformly every STEP world units
  const STEP = 6;
  const samples = [];
  {
    let carry = 0;
    let ax = raw[0].x, ay = raw[0].y;
    samples.push({ x: ax, y: ay });
    for (let i = 1; i <= raw.length; i++) {
      const p = raw[i % raw.length];
      let segLen = Math.hypot(p.x - ax, p.y - ay);
      if (segLen < 1e-6) continue;
      while (carry + segLen >= STEP) {
        const t = (STEP - carry) / segLen;
        ax += (p.x - ax) * t;
        ay += (p.y - ay) * t;
        samples.push({ x: ax, y: ay });
        segLen -= (STEP - carry);
        carry = 0;
      }
      carry += segLen;
      ax = p.x; ay = p.y;
    }
    // drop last point if too close to first (wrap)
    const f = samples[samples.length - 1], s0 = samples[0];
    if (Math.hypot(f.x - s0.x, f.y - s0.y) < STEP * 0.55) samples.pop();
  }

  const NS = samples.length;
  const LENGTH = NS * STEP;

  // tangent angles
  for (let i = 0; i < NS; i++) {
    const a = samples[(i - 1 + NS) % NS], b = samples[(i + 1) % NS];
    samples[i].a = Math.atan2(b.y - a.y, b.x - a.x);
  }

  /* ---------- pose lookup by arc distance ---------- */
  function poseAt(s) {
    s = ((s % LENGTH) + LENGTH) % LENGTH;
    const fi = s / STEP;
    const i0 = Math.floor(fi) % NS, i1 = (i0 + 1) % NS;
    const f = fi - Math.floor(fi);
    const A = samples[i0], B = samples[i1];
    let da = B.a - A.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, a: A.a + da * f };
  }

  /* ---------- nearest centerline sample (with hint window) ---------- */
  function nearestIdx(x, y, hint) {
    let best = -1, bd = Infinity;
    if (hint == null) {
      for (let i = 0; i < NS; i++) {
        const d = (samples[i].x - x) ** 2 + (samples[i].y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      const W = 90;
      for (let k = -W; k <= W; k++) {
        const i = ((hint + k) % NS + NS) % NS;
        const d = (samples[i].x - x) ** 2 + (samples[i].y - y) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      // occasional global check to recover from big jumps
      if (bd > 260 * 260) return nearestIdx(x, y, null);
    }
    return best;
  }

  /* ---------- surface types ---------- */
  const GRASS = 0, ROAD = 1, BOOST = 2;
  let surfData = null;

  function surfaceAt(x, y) {
    if (!surfData || x < 0 || y < 0 || x >= WORLD || y >= WORLD) return GRASS;
    const ix = (x >> 2), iy = (y >> 2);           // 512x512 map
    const o = (iy * 512 + ix) * 4;
    const g = surfData[o + 1];
    if (g > 128 && surfData[o] > 128) return BOOST;
    if (surfData[o] > 128) return ROAD;
    return GRASS;
  }

  /* ---------- item boxes & boost pads placement ---------- */
  const itemSpots = [];
  for (const fr of [0.16, 0.50, 0.84]) {
    const s = poseAt(fr * LENGTH);
    const nx = Math.cos(s.a + Math.PI / 2), ny = Math.sin(s.a + Math.PI / 2);
    for (const off of [-34, 0, 34]) {
      itemSpots.push({ x: s.x + nx * off, y: s.y + ny * off });
    }
  }
  const boosts = [];
  for (const fr of [0.09, 0.37, 0.63, 0.90]) {
    const s = poseAt(fr * LENGTH);
    boosts.push({ x: s.x, y: s.y, a: s.a });
  }

  function gridPose(slot) {                       // slot 0..3, behind start line
    const back = 78 + Math.floor(slot / 2) * 66;
    const lat = (slot % 2 === 0 ? -34 : 34);
    const s = poseAt(LENGTH - back);
    const nx = Math.cos(s.a + Math.PI / 2), ny = Math.sin(s.a + Math.PI / 2);
    return { x: s.x + nx * lat, y: s.y + ny * lat, a: s.a };
  }

  /* ---------- helpers ---------- */
  function distToTrack(x, y) {
    let m = Infinity;
    for (let i = 0; i < NS; i += 3) {
      const d = (samples[i].x - x) ** 2 + (samples[i].y - y) ** 2;
      if (d < m) m = d;
    }
    return Math.sqrt(m);
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawTree(g, x, y, sc) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse(9 * sc, 11 * sc, 26 * sc, 13 * sc, 0, 0, 7); g.fill();
    g.fillStyle = '#8d5a2b';
    g.beginPath(); g.arc(0, 4 * sc, 6 * sc, 0, 7); g.fill();
    g.fillStyle = '#2e7d32';
    g.beginPath(); g.arc(0, 0, 24 * sc, 0, 7); g.fill();
    g.fillStyle = '#388e3c';
    g.beginPath(); g.arc(-5 * sc, -5 * sc, 17 * sc, 0, 7); g.fill();
    g.fillStyle = '#4caf50';
    g.beginPath(); g.arc(-10 * sc, -10 * sc, 9 * sc, 0, 7); g.fill();
    g.restore();
  }

  function drawBoneDeco(g, x, y, ang) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.strokeStyle = '#f2ede4'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-15, 0); g.lineTo(15, 0); g.stroke();
    g.fillStyle = '#f2ede4';
    for (const ex of [-15, 15]) for (const ey of [-6, 6]) {
      g.beginPath(); g.arc(ex, ey, 6.5, 0, 7); g.fill();
    }
    g.restore();
  }

  function drawPaw(g, x, y, ang, alpha) {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.globalAlpha = alpha;
    g.fillStyle = '#4e342e';
    g.beginPath(); g.ellipse(0, 3, 6.5, 8, 0, 0, 7); g.fill();
    for (let i = -1; i <= 1; i++) {
      const a = -Math.PI / 2 + i * 0.62;
      g.beginPath(); g.arc(Math.cos(a) * 10, Math.sin(a) * 10 + 1, 3.1, 0, 7); g.fill();
    }
    g.restore();
  }

  function drawHydrant(g, x, y) {
    g.save(); g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.beginPath(); g.ellipse(4, 6, 14, 7, 0, 0, 7); g.fill();
    g.fillStyle = '#d32f2f';
    rr(g, -9, -12, 18, 24, 6); g.fill();
    g.fillStyle = '#b71c1c';
    rr(g, -13, -4, 26, 8, 4); g.fill();
    g.fillStyle = '#ef5350';
    g.beginPath(); g.arc(0, -12, 8, Math.PI, 0); g.fill();
    g.restore();
  }

  /* ---------- build the big world texture ---------- */
  const worldCv = document.createElement('canvas');
  worldCv.width = worldCv.height = WORLD;

  function buildWorld() {
    const g = worldCv.getContext('2d');

    // grass base + stripes + speckles
    g.fillStyle = '#57a83c'; g.fillRect(0, 0, WORLD, WORLD);
    for (let y = 0; y < WORLD; y += 96) {
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(0, y, WORLD, 48);
    }
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * WORLD, y = Math.random() * WORLD;
      g.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.07)';
      g.fillRect(x, y, 3, 3);
    }

    // road path
    const path = new Path2D();
    path.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < NS; i++) path.lineTo(samples[i].x, samples[i].y);
    path.closePath();

    g.lineJoin = 'round'; g.lineCap = 'round';

    // curbs (red / white dashes peeking out both sides)
    g.setLineDash([30, 30]);
    g.lineWidth = ROAD_W + 34;
    g.strokeStyle = '#e53935';
    g.stroke(path);
    g.lineDashOffset = -30;
    g.strokeStyle = '#f6f3ec';
    g.stroke(path);
    g.setLineDash([]);
    g.lineDashOffset = 0;

    // white edge lines
    g.lineWidth = ROAD_W + 10;
    g.strokeStyle = '#eceff1';
    g.stroke(path);

    // asphalt
    g.lineWidth = ROAD_W;
    g.strokeStyle = '#585d65';
    g.stroke(path);

    // subtle centre wear
    g.lineWidth = ROAD_W - 44;
    g.strokeStyle = 'rgba(0,0,0,.05)';
    g.stroke(path);

    // start / finish checker band at sample 0
    const s0 = samples[0];
    g.save();
    g.translate(s0.x, s0.y); g.rotate(s0.a);
    const cell = 20;
    for (let rx = 0; rx < 2; rx++)
      for (let cy = -Math.ceil(HALF / cell); cy < Math.ceil(HALF / cell); cy++) {
        g.fillStyle = ((rx + cy) & 1) ? '#16181d' : '#fafafa';
        g.fillRect(-cell + rx * cell, cy * cell, cell, cell);
      }
    g.restore();

    // boost pads
    for (const b of boosts) {
      g.save(); g.translate(b.x, b.y); g.rotate(b.a);
      const w = 104, h = ROAD_W * 0.82;
      const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      grd.addColorStop(0, '#ffb300'); grd.addColorStop(1, '#ff7b00');
      g.fillStyle = grd;
      rr(g, -w / 2, -h / 2, w, h, 12); g.fill();
      g.strokeStyle = '#c65100'; g.lineWidth = 4; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.92)';
      for (let c = -1; c <= 1; c++) {
        g.beginPath();
        g.moveTo(c * 28 - 10, -h / 2 + 12);
        g.lineTo(c * 28 + 10, 0);
        g.lineTo(c * 28 - 10, h / 2 - 12);
        g.lineTo(c * 28 - 2, 0);
        g.closePath(); g.fill();
      }
      g.restore();
    }

    // paw prints stamped along road centre
    for (let s = 60; s < LENGTH; s += 96) {
      const p = poseAt(s);
      const side = (Math.floor(s / 96) % 2 === 0 ? -1 : 1);
      const nx = Math.cos(p.a + Math.PI / 2), ny = Math.sin(p.a + Math.PI / 2);
      drawPaw(g, p.x + nx * side * 22, p.y + ny * side * 22, p.a, .22);
    }

    // trees
    let placed = 0, tries = 0;
    while (placed < 95 && tries < 5000) {
      tries++;
      const x = 50 + Math.random() * (WORLD - 100);
      const y = 50 + Math.random() * (WORLD - 100);
      const d = distToTrack(x, y);
      if (d > 150 && d < 700) {
        drawTree(g, x, y, .75 + Math.random() * .8);
        placed++;
      }
    }
    // bones & flowers on grass
    placed = 0; tries = 0;
    while (placed < 26 && tries < 3000) {
      tries++;
      const x = 40 + Math.random() * (WORLD - 80), y = 40 + Math.random() * (WORLD - 80);
      if (distToTrack(x, y) > 135) { drawBoneDeco(g, x, y, Math.random() * Math.PI); placed++; }
    }
    const petalCols = ['#ffd93d', '#ff7043', '#7ec8ff', '#f48fb1', '#fff'];
    for (let i = 0; i < 130; i++) {
      const x = 40 + Math.random() * (WORLD - 80), y = 40 + Math.random() * (WORLD - 80);
      if (distToTrack(x, y) > 120) {
        g.fillStyle = petalCols[(Math.random() * petalCols.length) | 0];
        g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      }
    }
    // hydrants near the grid
    {
      const hg = poseAt(LENGTH - 150);
      const nx = Math.cos(hg.a + Math.PI / 2), ny = Math.sin(hg.a + Math.PI / 2);
      drawHydrant(g, hg.x + nx * 105, hg.y + ny * 105);
      drawHydrant(g, hg.x - nx * 105, hg.y - ny * 105);
    }

    // vignette-ish darkening outside world edge
    g.fillStyle = '#2e6323';
    g.fillRect(0, 0, WORLD, 26); g.fillRect(0, WORLD - 26, WORLD, 26);
    g.fillRect(0, 0, 26, WORLD); g.fillRect(WORLD - 26, 0, 26, WORLD);
  }

  /* ---------- low-res surface map ---------- */
  const surfCv = document.createElement('canvas');
  surfCv.width = surfCv.height = 512;

  function buildSurf() {
    const sg = surfCv.getContext('2d');
    sg.setTransform(512 / WORLD, 0, 0, 512 / WORLD, 0, 0);
    sg.fillStyle = '#000'; sg.fillRect(0, 0, WORLD, WORLD);
    sg.lineJoin = 'round'; sg.lineCap = 'round';
    const path = new Path2D();
    path.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < NS; i++) path.lineTo(samples[i].x, samples[i].y);
    path.closePath();
    sg.lineWidth = ROAD_W; sg.strokeStyle = '#f00'; sg.stroke(path);
    for (const b of boosts) {
      sg.save(); sg.translate(b.x, b.y); sg.rotate(b.a);
      sg.fillStyle = '#ff0';
      sg.fillRect(-52, -ROAD_W * 0.41, 104, ROAD_W * 0.82);
      sg.restore();
    }
    surfData = sg.getImageData(0, 0, 512, 512).data;
  }

  /* ---------- minimap polyline ---------- */
  const minimapPath = [];
  for (let i = 0; i < NS; i += 6) minimapPath.push(samples[i]);

  let bounds = null;
  function getBounds() {
    if (bounds) return bounds;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of minimapPath) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    bounds = { x0, y0, x1, y1 };
    return bounds;
  }

  buildWorld();
  buildSurf();

  return {
    WORLD, ROAD_W, HALF,
    samples, NS, LENGTH, STEP,
    poseAt, nearestIdx, surfaceAt,
    itemSpots, boosts, gridPose,
    minimapPath, getBounds,
    canvas: worldCv,
    GRASS, ROAD, BOOST
  };
})();
