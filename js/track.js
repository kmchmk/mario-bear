'use strict';
/* ============================================================
   track.js — circuit spline, Mode-7 world texture, surface map
   ============================================================ */
const TRACK = (() => {

  const WORLD = 2048;          // world size (square)
  const ROAD_W = 132;          // road width in world units
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

  /* ---------- build the big world texture ---------- */
  const worldCv = document.createElement('canvas');
  worldCv.width = worldCv.height = WORLD;

  function buildWorld() {
    const g = worldCv.getContext('2d');

    // grass base + stripes + speckles
    g.fillStyle = '#5f683f'; g.fillRect(0, 0, WORLD, WORLD);
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

    // Gravel shoulders separate asphalt from the forest floor.
    g.lineWidth = ROAD_W + 54; g.strokeStyle = '#999478'; g.stroke(path);
    // curbs (red / white dashes peeking out both sides)
    g.setLineDash([30, 30]);
    g.lineWidth = ROAD_W + 34;
    g.strokeStyle = '#b75638';
    g.stroke(path);
    g.lineDashOffset = -30;
    g.strokeStyle = '#f6f3ec';
    g.stroke(path);
    g.setLineDash([]);
    g.lineDashOffset = 0;

    // white edge lines
    g.lineWidth = ROAD_W + 10;
    g.strokeStyle = '#c9c5a7';
    g.stroke(path);

    // asphalt
    g.lineWidth = ROAD_W;
    g.strokeStyle = '#535750';
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

    // Restrained markings and roadside texture, with upright trees rendered separately.
    g.setLineDash([18, 30]); g.lineWidth = 1.5; g.strokeStyle = '#dcd7bb35'; g.stroke(path); g.setLineDash([]);
    for (let i = 0; i < 1900; i++) {
      const x = Math.random() * WORLD, y = Math.random() * WORLD;
      if (distToTrack(x, y) > HALF + 32) {
        g.fillStyle = i % 3 ? '#3e593b44' : '#bbaa6744';
        g.fillRect(x, y, 2 + Math.random() * 7, 2 + Math.random() * 5);
      }
    }

    // vignette-ish darkening outside world edge
    g.fillStyle = '#435735';
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
