/* ASCII blue bouquet: bloom, then a slow 3D spin.
 * Port of bouquet3d.py. Every glyph drawn is plain ASCII.
 * Tap / click / press Space to replay the bloom. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- config
  const FPS = 30;
  const SPIN_SPEED = 0.22;      // rad/s, the slow resting spin (was 0.6)
  const PETAL_SPIN = 0.35;      // how fast petals twist relative to the bouquet
  const SPIN_BOOST = 1.2;       // extra radians spent during the opening (eases out)
  const SPIN_BOOST_TAU = 2.0;   // seconds for the boost to fade
  const TILT = 0.30;
  const CAM_DIST = 4.0;
  const PIVOT_Y = 0.2;
  const NUM_HEARTS = 18;
  const MESSAGE = "Hi Poohla :3";
  const BG = "#060a14";
  // JetBrains Mono ships in /fonts and is loaded before the first frame, so
  // every phone draws the same glyph shapes. The rest is only a fallback.
  const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const FONT_WEIGHT = 500;
  const COLS_PORTRAIT = 84;     // character columns on a phone held upright
  const ROWS_LANDSCAPE = 48;    // character rows when the screen is wider than tall
  const LINE = 1.2;             // cell height as a multiple of font size
  const BLOOM_END = 6.0;        // seconds until the bloom is fully done

  // ------------------------------------------------------ palettes (dark -> light)
  const ICE      = ["#8fb8d8", "#b5d4ea", "#d4e8f5", "#e8f3fb", "#f4faff", "#ffffff"];
  const PALE     = ["#5f8fb8", "#7eaed4", "#9cc6e6", "#b8d9f2", "#d0e8fa", "#e6f4ff"];
  const SKY      = ["#2f7fc0", "#4a9be0", "#6db4ee", "#8fcbf6", "#a9dbfb", "#c4e8ff"];
  const ROYAL    = ["#0f2a8a", "#1a3fb8", "#2557e0", "#3d75f5", "#6a95ff", "#93b3ff"];
  const PERI     = ["#4b3fa0", "#6a5ad0", "#8578ec", "#9d94f5", "#b6b0fb", "#cfcaff"];
  const CORN     = ["#2a4a9a", "#3f63c4", "#5b82e0", "#6495ed", "#86aef5", "#a8c7fb"];
  const NAVY     = ["#16286e", "#20389a", "#2c4cc0", "#3f63e0", "#5a85ee", "#7ea4fa"];
  const GOLD_CENTER = ["#8a6a1a", "#b8902a", "#e0b440", "#f2cc5a", "#ffe08a"];
  const DARK_CENTER = ["#3b2a1a", "#5a3f22", "#7a5530", "#9a6f40", "#b88a55"];
  const GREENS = ["#0f3d1e", "#165c2c", "#1f7a38", "#2a9445", "#3fae5a", "#6cc984", "#9be0ae"];
  const PAPER  = ["#6b6558", "#9a937f", "#c9c2ac", "#e4ddc8", "#f3eedc", "#fffaf0"];
  const RIBBON = ["#5a6370", "#808a98", "#a8b2c0", "#c8d0dc", "#e2e8f0", "#ffffff"];
  const HEART_COLORS = ["#4a9be0", "#6db4ee", "#8fcbf6", "#a9dbfb", "#c4e8ff", "#ffffff"];
  const MSG_COLORS = ["#4a9be0", "#6db4ee", "#8fcbf6", "#c4e8ff", "#ffffff", "#c4e8ff", "#8fcbf6", "#6db4ee"];
  const BABY_BRIGHT = "#ffffff", BABY_DIM = "#c4d4ea";

  const SHADE = ".:-=+*%@";
  const PETAL_SHADE = "+*#%";

  const _L = [-0.45, 0.6, 0.66];
  const _n = Math.hypot(_L[0], _L[1], _L[2]);
  const LX = _L[0] / _n, LY = _L[1] / _n, LZ = _L[2] / _n;

  // [petal palette, center palette, petal count]
  const DISC_TYPES = [
    [ICE, GOLD_CENTER, 13],
    [SKY, GOLD_CENTER, 8],
    [ROYAL, DARK_CENTER, 6],
    [PERI, GOLD_CENTER, 7],
    [CORN, DARK_CENTER, 12],
    [NAVY, GOLD_CENTER, 9],
  ];
  const TULIP_COLORS = [PALE, ROYAL];

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutBack = (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function norm(v) {
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function add(p, d, k) {
    return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
  }

  // ------------------------------------------------------------ scene build
  // Every solid point belongs to a "group". A group has a start time and a
  // duration; its growth value (0..1) scales the point from its origin.
  function buildScene() {
    const R = mulberry32(21);
    const uniform = (a, b) => a + (b - a) * R();

    const pts = [];
    const groups = []; // {start, dur}
    const newGroup = (start, dur) => { groups.push({ start, dur }); return groups.length - 1; };
    const P = (x, y, z, n, pal, tone, two, ov, o, g) =>
      pts.push({ x, y, z, nx: n[0], ny: n[1], nz: n[2], pal, tone, two, ov, ox: o[0], oy: o[1], oz: o[2], g });

    const neck = [0.0, -0.12, 0.0];
    const C = [0.0, 0.12, 0.0], D = 0.64;
    const N = 10;
    const golden = Math.PI * (3 - Math.sqrt(5));

    const heads = [];
    for (let i = 0; i < N; i++) {
      const el = ((88 - 60 * Math.sqrt(i / (N - 1))) * Math.PI) / 180;
      const az = i * golden;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      heads.push({ pos: add(C, d, D * uniform(0.92, 1.05)), axis: norm(d) });
    }

    // timing
    const cone = newGroup(0.0, 1.2);
    const ribbon = newGroup(1.0, 0.8);
    const stemGroups = [], leafGroups = [];
    for (let i = 0; i < N; i++) stemGroups.push(newGroup(0.3 + 0.07 * i, 1.3));
    for (let i = 0; i < 8; i++) leafGroups.push(newGroup(0.8 + 0.1 * i, 1.4));

    // stems + flower heads
    const tulipSlots = new Set([3, 8]);
    const flowers = [];
    let discI = 0;
    heads.forEach(({ pos, axis }, idx) => {
      const base = add(pos, axis, -0.03);
      for (let j = 0; j < 120; j++) {
        const t = j / 119;
        const p = [base[0] + (neck[0] - base[0]) * t, base[1] + (neck[1] - base[1]) * t, base[2] + (neck[2] - base[2]) * t];
        P(p[0], p[1], p[2], [axis[0], 0, axis[2]], GREENS, -0.15, true, null, neck, stemGroups[idx]);
      }
      const start = 1.6 + 0.25 * idx;
      if (tulipSlots.has(idx)) {
        let nT = 0;
        tulipSlots.forEach((k) => { if (k < idx) nT++; });
        flowers.push({ pos, kind: "tulip", pal: TULIP_COLORS[nT % TULIP_COLORS.length], cpal: null, nPet: 0, R: 0.11, seed: uniform(0, 6.28), idx, start });
      } else {
        const [pal, cpal, nPet] = DISC_TYPES[discI % DISC_TYPES.length];
        discI++;
        flowers.push({ pos, kind: "disc", pal, cpal, nPet, R: uniform(0.12, 0.14), seed: uniform(0, 6.28), idx, start });
      }
    });

    // leaves
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.4) / 8) * 2 * Math.PI;
      const c = Math.cos(a), s = Math.sin(a);
      const base = [0.26 * c, 0.30, 0.26 * s];
      const d = norm([c, 0.15, s]);
      const side = [-s, 0.0, c];
      const n = norm(cross(side, d));
      const L = 0.30, W = 0.07;
      for (let ti = 0; ti < 52; ti++) {
        const t = ti / 51;
        for (let wi = -8; wi <= 8; wi++) {
          const w = wi / 8;
          const curl = 0.025 * w * w;
          const sw = W * Math.sin(Math.PI * t) * w;
          P(
            base[0] + d[0] * L * t + side[0] * sw + n[0] * curl,
            base[1] + d[1] * L * t - 0.10 * t * t + n[1] * curl,
            base[2] + d[2] * L * t + side[2] * sw + n[2] * curl,
            n, GREENS, wi === 0 ? -0.25 : 0.0, true, null, base, leafGroups[i]
          );
        }
      }
    }

    // paper cone
    const y0 = -0.20, y1 = 0.30, r0 = 0.06, r1 = 0.36;
    const k = (r1 - r0) / (y1 - y0);
    const coneOrigin = [0, y0, 0];
    const rings = 95;
    for (let i = 0; i < rings; i++) {
      const t = i / (rings - 1);
      const r = r0 + (r1 - r0) * t;
      const count = Math.max(8, Math.floor(360 * r));
      for (let j = 0; j < count; j++) {
        const ph = ((j + R()) / count) * 2 * Math.PI;
        const c = Math.cos(ph), s = Math.sin(ph);
        let y = y0 + (y1 - y0) * t;
        if (t > 0.9) y += 0.03 * Math.sin(9 * ph);
        const fold = 0.3 * (Math.abs(Math.sin(5 * ph)) - 0.6);
        P(r * c, y, r * s, norm([c, -k, s]), PAPER, fold, false, null, coneOrigin, cone);
      }
    }

    // little stems poking out below the cone
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 2 * Math.PI;
      const sx = 0.025 * Math.cos(a), sz = 0.025 * Math.sin(a);
      for (let j = 0; j < 70; j++) {
        const t = j / 69;
        P(sx * (1 + 1.2 * t), -0.20 - 0.30 * t, sz * (1 + 1.2 * t),
          [Math.cos(a), 0, Math.sin(a)], GREENS, -0.1, true, null, coneOrigin, cone);
      }
    }

    // ribbon band, bow, tails, knot
    const by = -0.12;
    const br = r0 + k * (by - y0) + 0.01;
    const ribOrigin = [0, by, 0];
    for (let j = 0; j < 170; j++) {
      const ph = (j / 170) * 2 * Math.PI;
      for (const dy of [-0.012, 0.0, 0.012]) {
        P(br * Math.cos(ph), by + dy, br * Math.sin(ph), [Math.cos(ph), 0, Math.sin(ph)], RIBBON, 0.0, false, null, ribOrigin, ribbon);
      }
    }
    const knot = [0.0, by, br + 0.01];
    for (const side of [-1, 1]) {
      for (let j = 0; j < 120; j++) {
        const a = (j / 120) * 2 * Math.PI;
        const lx = side * (0.07 + 0.07 * Math.cos(a));
        const ly = 0.04 * Math.sin(a) + (0.02 * (0.07 + 0.07 * Math.cos(a))) / 0.14;
        for (const fill of [1.0, 0.7]) {
          P(knot[0] + lx * fill, knot[1] + ly * fill, knot[2] + 0.01, [side * 0.3, 0.2, 0.93], RIBBON, 0.1, true, null, ribOrigin, ribbon);
        }
      }
      for (let j = 0; j < 50; j++) {
        const t = j / 49;
        P(knot[0] + side * 0.06 * t, knot[1] - 0.15 * t, knot[2] + 0.015,
          [side * 0.2, 0.0, 0.98], RIBBON, -0.05 + 0.05 * Math.sin(t * 9), true, null, ribOrigin, ribbon);
      }
    }
    for (const dx of [-0.01, 0.0, 0.01]) {
      P(dx, by, knot[2] + 0.02, [0, 0, 1], RIBBON, 0.2, true, "@", ribOrigin, ribbon);
    }

    // baby's breath + sparkles (fade in by rank)
    const babies = [];
    const NB = 150;
    for (let i = 0; i < NB; i++) {
      const a = R() * 2 * Math.PI;
      const el = uniform(0.3, 1.4);
      const rr = uniform(0.40, 0.58);
      babies.push({
        x: rr * Math.cos(a) * Math.cos(el),
        y: C[1] + rr * Math.sin(el),
        z: rr * Math.sin(a) * Math.cos(el),
        phase: uniform(0, 6.28),
        rank: i / NB,
      });
    }
    const sparkles = [];
    const NS = 40;
    for (let i = 0; i < NS; i++) {
      const a = R() * 2 * Math.PI;
      const rr = uniform(0.75, 0.95);
      sparkles.push({
        x: rr * Math.cos(a), y: uniform(-0.3, 1.0), z: rr * Math.sin(a),
        phase: uniform(0, 6.28), speed: uniform(1.5, 4.0), rank: i / NS,
      });
    }

    return { pts, groups, flowers, babies, sparkles, neck, stemGroups };
  }

  // --------------------------------------------------------------- hearts
  let hearts = [];
  function updateHearts(dt) {
    while (hearts.length < NUM_HEARTS) {
      hearts.push({
        x: Math.random(), y: 1.0 + Math.random(), sp: 0.03 + Math.random() * 0.05,
        phase: Math.random() * 6.28, color: HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0],
      });
    }
    for (const h of hearts) {
      h.y -= h.sp * dt;
      if (h.y < 0) {
        h.x = Math.random(); h.y = 1.0;
        h.color = HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0];
      }
    }
  }

  // ------------------------------------------------------- canvas + layout
  const wrap = document.getElementById("wrap");
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scene = buildScene();
  const G = new Float32Array(scene.groups.length);

  let L = null; // layout
  let chars, colors, zbuf;

  const fontStr = (px) => FONT_WEIGHT + " " + px.toFixed(2) + "px " + FONT_FAMILY;

  function layout() {
    // Size comes from the wrapper, which CSS pins to the visible screen.
    const W = Math.max(1, wrap.clientWidth || window.innerWidth);
    const H = Math.max(1, wrap.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.font = fontStr(100);
    const ratio = ctx.measureText("M").width / 100 || 0.6; // glyph advance / font size

    // A cell is one glyph wide and LINE font-sizes tall.
    let cols, cellW;
    if (H >= W) {
      cols = COLS_PORTRAIT;               // phone upright
      cellW = W / cols;
    } else {
      const cellH0 = H / ROWS_LANDSCAPE;  // landscape: fix the row count instead
      cellW = (cellH0 * ratio) / LINE;
      cols = Math.max(20, Math.floor(W / cellW));
      cellW = W / cols;
    }
    const fs = cellW / ratio;
    const cellH = fs * LINE;
    const rows = Math.max(12, Math.floor(H / cellH));
    const viewRows = rows - 2;
    const aspect = cellH / cellW;

    // Fit the bouquet inside the grid with a small margin on every side.
    const scale = Math.max(1.0, Math.min((viewRows - 3) / 1.45, (cols - 4) / (1.45 * aspect)));
    const spare = Math.max(0, viewRows - 2 - 1.45 * scale);

    L = {
      W, H, cols, rows, viewRows, cellW, cellH, fs, scale,
      sx: scale * aspect,
      cx: cols / 2,
      cy: 1 + 0.78 * scale + spare / 2,
    };

    const n = cols * rows;
    chars = new Array(n).fill(" ");
    colors = new Array(n).fill(null);
    zbuf = new Float32Array(n);

    ctx.font = fontStr(fs);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  // ----------------------------------------------------------------- render
  function render(t) {
    const { cols, rows, viewRows, cellW, cellH, scale, sx, cx, cy } = L;
    chars.fill(" ");
    colors.fill(null);
    zbuf.fill(-1e9);

    // growth per group
    for (let i = 0; i < G.length; i++) {
      const g = scene.groups[i];
      G[i] = easeOutCubic(clamp((t - g.start) / g.dur));
    }

    const ang = t * SPIN_SPEED + SPIN_BOOST * (1 - Math.exp(-t / SPIN_BOOST_TAU));
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ct = Math.cos(TILT), st = Math.sin(TILT);

    let pc = 0, pr = 0, pz = 0, pf = 1;
    function proj(x, y, z) {
      const xr = x * ca - z * sa;
      const zr = x * sa + z * ca;
      const yp = y - PIVOT_Y;
      const yt = yp * ct - zr * st;
      pz = yp * st + zr * ct;
      pf = CAM_DIST / (CAM_DIST - pz);
      pc = cx + xr * pf * sx;
      pr = cy - yt * pf * scale;
    }
    function plot(col, row, z, ch, color) {
      if (row >= 0 && row < viewRows && col >= 0 && col < cols) {
        const i = row * cols + col;
        if (z > zbuf[i]) { zbuf[i] = z; chars[i] = ch; colors[i] = color; }
      }
    }

    // hearts (after the bloom)
    if (t > 3.5) {
      for (const h of hearts) {
        const col = Math.floor((h.x + 0.015 * Math.sin(t * 1.2 + h.phase)) * cols);
        const row = Math.floor(h.y * viewRows);
        plot(col, row, -50, "<", h.color);
        plot(col + 1, row, -50, "3", h.color);
      }
    }

    // solid points
    const pts = scene.pts;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const g = G[p.g];
      if (g <= 0.002) continue;
      proj(p.ox + (p.x - p.ox) * g, p.oy + (p.y - p.oy) * g, p.oz + (p.z - p.oz) * g);

      const nxr = p.nx * ca - p.nz * sa;
      const nzr = p.nx * sa + p.nz * ca;
      const nyt = p.ny * ct - nzr * st;
      const nzt = p.ny * st + nzr * ct;
      let dot = nxr * LX + nyt * LY + nzt * LZ;
      if (p.two && dot < 0) dot = -dot * 0.55;
      const b = clamp(0.25 + 0.75 * Math.max(0, dot) + p.tone, 0, 0.999);
      const ch = p.ov || SHADE[Math.floor(b * SHADE.length)];
      plot(Math.floor(pc), Math.floor(pr), pz, ch, p.pal[Math.floor(b * p.pal.length)]);
    }

    // flower billboards
    const neck = scene.neck;
    for (const f of scene.flowers) {
      const gs = G[scene.stemGroups[f.idx]];
      if (gs < 0.25) continue;
      const fp = [
        neck[0] + (f.pos[0] - neck[0]) * gs,
        neck[1] + (f.pos[1] - neck[1]) * gs,
        neck[2] + (f.pos[2] - neck[2]) * gs,
      ];
      proj(fp[0], fp[1], fp[2]);
      const fx = pc, fy = pr, zt = pz, ff = pf;

      const o = easeOutBack(clamp((t - f.start) / 1.3)); // 0 -> ~1.1 -> 1
      const om = Math.min(o, 1);
      const rf = 0.35 * easeOutCubic(clamp((gs - 0.25) / 0.75)) + 0.65 * o;
      if (rf < 0.02) continue;
      const rx = f.R * rf * ff * sx, ry = f.R * rf * ff * scale;
      if (rx < 0.3 || ry < 0.3) continue;

      const dim = -0.4 * (1 - clamp((zt + 0.6) / 1.2));
      const rot = f.seed + ang * PETAL_SPIN + (1 - om) * 1.6;

      for (let row = Math.floor(fy - ry) - 1; row <= Math.floor(fy + ry) + 1; row++) {
        const dy = (row + 0.5 - fy) / ry;
        for (let col = Math.floor(fx - rx) - 1; col <= Math.floor(fx + rx) + 1; col++) {
          const dx = (col + 0.5 - fx) / rx;

          if (f.kind === "disc") {
            const s = Math.sqrt(dx * dx + dy * dy);
            if (s > 1.0) continue;
            const cs = 0.3 * clamp((o - 0.35) / 0.4);
            if (s < cs) {
              const b = clamp(0.55 - 0.35 * dx - 0.35 * dy + dim, 0, 0.999);
              plot(col, row, zt + 0.06, s < cs * 0.57 ? "@" : "o", f.cpal[Math.floor(b * f.cpal.length)]);
              continue;
            }
            const ph = Math.atan2(dy, dx);
            const wave = Math.pow(Math.abs(Math.cos((f.nPet * (ph + rot)) / 2)), 0.7);
            const reach = 0.32 + 0.3 * (1 - om) + 0.68 * om * wave;
            if (s > reach) continue;
            const edge = s > reach - 0.14 ? -0.22 : 0.0;
            const b = clamp(0.62 - 0.22 * dx - 0.28 * dy + 0.12 * s + edge + dim, 0, 0.999);
            plot(col, row, zt + 0.04 * (1 - s), PETAL_SHADE[Math.floor(b * PETAL_SHADE.length)], f.pal[Math.floor(b * f.pal.length)]);
          } else {
            const v = (1 - dy) / 2;
            if (v < 0 || v > 1) continue;
            const hw = 0.62 * Math.sin(Math.PI * 0.5 * Math.min(1.0, v * 1.5 + 0.05)) * (0.55 + 0.45 * om);
            if (hw <= 0 || Math.abs(dx) > hw) continue;
            const xn = dx / hw;
            if (v > 0.72 + 0.28 * om * Math.pow(Math.cos(1.5 * Math.PI * xn), 2)) continue;
            const seam = Math.abs(Math.abs(xn) - 0.33) < 0.12 && v > 0.3 ? -0.25 : 0.0;
            const b = clamp(0.55 - 0.3 * xn + 0.1 * v + seam + dim, 0, 0.999);
            plot(col, row, zt + 0.03, PETAL_SHADE[Math.floor(b * PETAL_SHADE.length)], f.pal[Math.floor(b * f.pal.length)]);
          }
        }
      }
    }

    // baby's breath + sparkles
    const fade = clamp((t - 3.5) / 1.5);
    if (fade > 0) {
      for (const b of scene.babies) {
        if (b.rank > fade) continue;
        proj(b.x, b.y, b.z);
        const star = Math.sin(t * 2 + b.phase) > 0.6;
        plot(Math.floor(pc), Math.floor(pr), pz + 0.02, star ? "*" : ".", star ? BABY_BRIGHT : BABY_DIM);
      }
      for (const s of scene.sparkles) {
        if (s.rank > fade) continue;
        proj(s.x, s.y, s.z);
        const tw = Math.sin(t * s.speed + s.phase);
        const col = Math.floor(pc), row = Math.floor(pr);
        if (tw > 0.85) plot(col, row, pz, "*", "#ffffff");
        else if (tw > 0.4) plot(col, row, pz, "+", "#c4e8ff");
        else if (tw > 0.0) plot(col, row, pz, ".", "#8fcbf6");
      }
    }

    // message (typewriter)
    const shown = Math.min(MESSAGE.length, Math.max(0, Math.floor((t - 3.8) * 10)));
    const mStart = Math.max(0, Math.floor((cols - MESSAGE.length) / 2));
    const shift = Math.floor(t * 6);
    for (let i = 0; i < shown; i++) {
      if (mStart + i < cols) {
        const idx = (rows - 2) * cols + mStart + i;
        chars[idx] = MESSAGE[i];
        colors[idx] = MSG_COLORS[(i + shift) % MSG_COLORS.length];
      }
    }

    // paint
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, L.W, L.H);
    let last = null;
    for (let r = 0; r < rows; r++) {
      const y = r * cellH + cellH / 2;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const ch = chars[i];
        if (ch === " ") continue;
        const col = colors[i];
        if (col !== last) { ctx.fillStyle = col; last = col; }
        ctx.fillText(ch, c * cellW + cellW / 2, y);
      }
    }
  }

  // ------------------------------------------------------------------- loop
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let t = reduced ? BLOOM_END : 0;
  let lastNow = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = now - lastNow;
    if (dtMs < 1000 / FPS - 2) return;
    lastNow = now;
    const dt = Math.min(dtMs / 1000, 0.1); // clamps jumps after tab switches
    t += dt;
    if (t > 3.5) updateHearts(dt);
    render(t);
  }

  function replay() { t = 0; hearts = []; }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 60);
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(onResize).observe(wrap);
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
  wrap.addEventListener("pointerdown", replay);
  window.addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); replay(); } });

  // Wait for the bundled font so the grid is measured with the real glyph
  // width (never the fallback), then start. A 2.5 s cap keeps a slow network
  // from blocking the page.
  let started = false;
  function start() {
    if (started) return;
    started = true;
    layout();
    t = reduced ? BLOOM_END : 0;
    lastNow = performance.now();
    requestAnimationFrame(frame);
  }
  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load(fontStr(20), "M@*+.<3"),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(start, start);
  } else {
    start();
  }
})();
