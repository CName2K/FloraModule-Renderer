/* ASCII blue bouquet: bloom, then a slow 3D spin.
 * Port of bouquet3d.py. Every glyph drawn is plain ASCII.
 * Tap / click / press Space to replay the bloom. */
(() => {
  "use strict";

  // ---------------------------------------------------------------- config
  const FPS = 60;
  const SPIN_SPEED = 0.14;      // rad/s, the slow resting spin (was 0.6, then 0.22)
  const PETAL_SPIN = 0.35;      // how fast petals twist relative to the bouquet
  const SPIN_BOOST = 1.2;       // extra radians spent during the opening (eases out)
  const SPIN_BOOST_TAU = 2.0;   // seconds for the boost to fade
  const TILT = 0.30;
  const CAM_DIST = 4.0;
  const PIVOT_Y = 0.2;
  // ---- TEXT ON SCREEN -------------------------------------------------------
  // Add, remove or edit entries. Each one:
  //   text   plain ASCII only. Use "\n" for a second line (keep lines under ~40 chars)
  //   place  "under"  = right below the cat (follows the bouquet)   -> uses gap
  //          "screen" = fixed spot on the screen                    -> uses y
  //   gap    (under)  blank rows between the cat's feet and the text (default 2)
  //   y      (screen) 0 = very top, 1 = very bottom
  //   start  seconds after the page opens before it begins typing
  //   speed  characters typed per second
  //   color  "shimmer" (animated blues) or any hex like "#ffd1e8"
  const TEXTS = [
    { text: "A little something for ya :3", place: "under", gap: 2, start: 3.8, speed: 10, color: "shimmer" },
    // { text: "happy birthday!", place: "screen", y: 0.05, start: 5.5, speed: 12, color: "#ffd1e8" },
  ];
  const CAT_START = 0.5;        // seconds before the kaomoji cat starts popping in
  const BG = "#060a14";
  // JetBrains Mono ships in /fonts and is loaded before the first frame, so
  // every phone draws the same glyph shapes. The rest is only a fallback.
  const FONT_FAMILY = '"JetBrains Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const FONT_WEIGHT = 500;
  const COLS_PORTRAIT = 104;     // character columns on a phone held upright
  const ROWS_LANDSCAPE = 68;    // character rows when the screen is wider than tall
  const LINE = 1.2;             // cell height as a multiple of font size
  const BLOOM_END = 8.0;        // seconds until the bloom is fully done

  // ------------------------------------------------------ palettes (dark -> light)
  const ICE      = ["#8fb8d8", "#b5d4ea", "#d4e8f5", "#e8f3fb", "#f4faff", "#ffffff"];
  const PALE     = ["#5f8fb8", "#7eaed4", "#9cc6e6", "#b8d9f2", "#d0e8fa", "#e6f4ff"];
  const SKY      = ["#2f7fc0", "#4a9be0", "#6db4ee", "#8fcbf6", "#a9dbfb", "#c4e8ff"];
  const ROYAL    = ["#0f2a8a", "#1a3fb8", "#2557e0", "#3d75f5", "#6a95ff", "#93b3ff"];
  const PERI     = ["#0f5f86", "#1a7fae", "#2a9bc9", "#4fb6de", "#7fd0ee", "#b0e6f8"];
  const CORN     = ["#2a4a9a", "#3f63c4", "#5b82e0", "#6495ed", "#86aef5", "#a8c7fb"];
  const NAVY     = ["#16286e", "#20389a", "#2c4cc0", "#3f63e0", "#5a85ee", "#7ea4fa"];
  const GOLD_CENTER = ["#8a6a1a", "#b8902a", "#e0b440", "#f2cc5a", "#ffe08a"];
  const DARK_CENTER = ["#3b2a1a", "#5a3f22", "#7a5530", "#9a6f40", "#b88a55"];
  const GREENS = ["#0f3d1e", "#165c2c", "#1f7a38", "#2a9445", "#3fae5a", "#6cc984", "#9be0ae"];
  const PAPER  = ["#3d2a1a", "#5e4129", "#85603c", "#a67c52", "#c49a6c", "#dcb98a"];
  const RIBBON = ["#1a3a8a", "#2457c9", "#3d75f5", "#5b94ff", "#8cb6ff", "#c4dcff"];
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

  // ---------------------------------------------------------- kaomoji cat
  // Flat ASCII line art, drawn on top of the 3D scene, gripping the stems.
  // 29 x 12 characters; column 14 is the centre. Edit the strings in
  // catRows() to redraw it. Poses change 3 times a second.
  const CAT_W = 29, CAT_H = 12;
  const CAT_SHIM = ["#ffd1e8", "#ffe6f2", "#ffffff", "#d4ecff", "#a9dbfb", "#8fcbf6", "#a9dbfb", "#d4ecff", "#ffffff", "#ffe6f2"];

  function catRows(t) {
    const beat = Math.floor(t * 3) % 3;
    const blink = t % 3.4 > 3.25;
    const e = blink ? "*" : "o";
    const g = Array.from({ length: CAT_H }, () => Array(CAT_W).fill(" "));
    const put = (r, c, str) => {
      for (let i = 0; i < str.length; i++) if (c + i >= 0 && c + i < CAT_W) g[r][c + i] = str[i];
    };
    put(0, 13, "(|)");                                        // paws gripping the stems
    put(1, 10, ".-'");  put(1, 16, "'-.");                    // rounded arms: curve out from the paws,
    put(2, 8, ".'");    put(2, 19, "'.");
    put(3, 7, "(");     put(3, 21, ")");                      // bulge round the sides,
    put(4, 6, "(");     put(4, 22, ")");
    put(5, 6, "(");     put(5, 22, ")");
    put(6, 7, "(");     put(6, 21, ")");
    put(7, 8, "'.");    put(7, 19, ".'");                     // and tuck into the shoulders
    put(4, 11, "/\\___/\\");                                   // ears
    put(5, 10, "(  " + e + "w" + e + "  )");                  // face: owo
    put(6, 11, "\\_____/");
    put(8, 10, "("); put(8, 18, ")"); put(9, 10, "("); put(9, 18, ")");  // body
    put(9, 13, "<3");
    put(10, 11, "\\_____/");
    const f = [[11, 15], [10, 16], [12, 14]][beat];           // feet shuffle
    put(11, f[0], "(_)"); put(11, f[1], "(_)");
    put(9, 19, ["~~", "--", "~'"][beat]);                     // tail
    if (beat === 1) { put(5, 2, "(("); put(5, 25, "))"); }    // wiggle marks
    if (beat === 2) { put(5, 3, "(");  put(5, 25, ")"); }
    return g.map((r) => r.join(""));
  }

  function catColor(r, c, ch, t) {
    if (r === 0) return ch === "|" ? "#6cc984" : "#ffb3d1";
    if (r === 5 && c >= 13 && c <= 15) return ch === "w" ? "#ff9ec4" : "#ffd27a";
    if (r === 9 && c >= 13 && c <= 14) return "#ff8fb8";
    if (r === 9 && c >= 19) return "#ffd1e8";
    if (r >= 4 && r <= 6 && (c <= 4 || c >= 24)) return "#8fcbf6";
    const n = CAT_SHIM.length;
    return CAT_SHIM[(((c + r * 2 - Math.floor(t * 8)) % n) + n) % n];
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

  // ------------------------------------------------------------- particles
  // Floating decorations that drift up behind the bouquet: hearts in three
  // sizes, stars, bubbles, little flowers and petals. Edit PARTICLE_KINDS to
  // add, remove or resize kinds:
  //   n       how many of this kind
  //   art     rows of ASCII (spaces are transparent)
  //   colors  palette it picks from
  //   speed   [min, max] screen heights per second, rising
  //   sway    sideways wobble, as a fraction of the screen width
  //   twinkle true = cycles through its colours
  const PINKS = ["#ff8fb8", "#ffa6c9", "#ffc2dc", "#ffd9e8"];
  const GOLDS = ["#ffd27a", "#ffe08a", "#fff0b8", "#ffffff"];
  const CYANS = ["#8fcbf6", "#a9dbfb", "#c4e8ff", "#ffffff"];
  const BIG_HEART = [" _   _ ", "( \\ / )", " \\   / ", "  \\ /  ", "   v   "];
  const MID_HEART = ["/\\/\\", "\\  /", " \\/ "];
  const BURST = [" + ", "+*+", " + "];
  const PARTICLE_KINDS = [
    { n: 3,  art: BIG_HEART, colors: PINKS, speed: [0.022, 0.034], sway: 0.020 },
    { n: 5,  art: MID_HEART, colors: PINKS.concat(HEART_COLORS), speed: [0.028, 0.045], sway: 0.016 },
    { n: 10, art: ["<3"], colors: HEART_COLORS.concat(PINKS), speed: [0.030, 0.070], sway: 0.012 },
    { n: 4,  art: BURST, colors: GOLDS, speed: [0.020, 0.040], sway: 0.010, twinkle: true },
    { n: 9,  art: ["*"], colors: GOLDS, speed: [0.020, 0.050], sway: 0.010, twinkle: true },
    { n: 7,  art: ["+"], colors: CYANS, speed: [0.025, 0.055], sway: 0.012, twinkle: true },
    { n: 5,  art: ["x"], colors: PINKS, speed: [0.025, 0.050], sway: 0.012, twinkle: true },
    { n: 8,  art: ["o"], colors: CYANS, speed: [0.030, 0.060], sway: 0.020 },
    { n: 4,  art: ["O"], colors: CYANS, speed: [0.025, 0.045], sway: 0.022 },
    { n: 5,  art: ["(@)"], colors: PINKS, speed: [0.025, 0.045], sway: 0.018 },
    { n: 8,  art: ["~"], colors: ["#ffd9e8", "#c4e8ff", "#ffffff"], speed: [0.035, 0.065], sway: 0.030 },
    { n: 6,  art: ["."], colors: GOLDS.concat(CYANS), speed: [0.020, 0.060], sway: 0.010 },
  ];

  let particles = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function resetParticles() {
    particles = [];
    for (const k of PARTICLE_KINDS) {
      for (let i = 0; i < k.n; i++) {
        particles.push({
          k, x: Math.random(), y: rnd(0, 1.15), sp: rnd(k.speed[0], k.speed[1]),
          phase: rnd(0, 6.28), ci: (Math.random() * k.colors.length) | 0,
          appear: rnd(3.0, 9.0), // they fade in over a few seconds, after the bloom starts
        });
      }
    }
  }
  function updateParticles(dt) {
    for (const p of particles) {
      p.y -= p.sp * dt;
      if (p.y < -0.12) {
        p.y = 1.1 + Math.random() * 0.1;
        p.x = Math.random();
        p.ci = (Math.random() * p.k.colors.length) | 0;
      }
    }
  }
  resetParticles();

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
    // (the third limit keeps room below the bouquet for the cat and the text)
    const scale = Math.max(1.0, Math.min((viewRows - 3) / 1.45, (cols - 4) / (1.45 * aspect),
      (viewRows - 2 - CAT_H - 3) / 1.35));
    const stack = 1.35 * scale + CAT_H + 3;           // bouquet + cat + text, in rows
    const top = Math.max(1, (viewRows - stack) / 2);  // centre the whole stack
    const cyv = top + 0.78 * scale;

    L = {
      W, H, cols, rows, viewRows, cellW, cellH, fs, scale,
      sx: scale * aspect,
      cx: cols / 2,
      cy: cyv,
      handRow: Math.round(cyv + 0.56 * scale),         // where the stems end: the cat grips here
      handCol: Math.round(cols / 2),
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

    // floating particles (drawn behind everything else)
    for (const p of particles) {
      if (t < p.appear) continue;
      const art = p.k.art, colN = p.k.colors.length;
      const ci = p.k.twinkle
        ? Math.min(colN - 1, Math.floor((Math.sin(t * 3 + p.phase) * 0.5 + 0.5) * colN))
        : p.ci;
      const c0 = Math.floor((p.x + p.k.sway * Math.sin(t * 0.9 + p.phase)) * cols - art[0].length / 2);
      const r0 = Math.floor(p.y * viewRows - art.length / 2);
      for (let r = 0; r < art.length; r++) {
        for (let c = 0; c < art[r].length; c++) {
          if (art[r][c] !== " ") plot(c0 + c, r0 + r, -50, art[r][c], p.k.colors[ci]);
        }
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

    // kaomoji cat: pops in row by row, interior cleared so the bouquet doesn't show through
    {
      const sp = catRows(t);
      const left = L.handCol - 14, topRow = L.handRow;
      for (let r = 0; r < CAT_H; r++) {
        if (t < CAT_START + r * 0.08) continue;
        const line = sp[r];
        const first = line.search(/\S/), lastc = line.search(/\S\s*$/);
        if (first < 0) continue;
        const row = topRow + r;
        if (row < 0 || row >= rows) continue;
        for (let c = first; c <= lastc; c++) {
          const col = left + c;
          if (col < 0 || col >= cols) continue;
          const idx = row * cols + col;
          const ch = line[c];
          chars[idx] = ch;
          colors[idx] = ch === " " ? null : catColor(r, c, ch, t);
        }
      }
      // sparkles orbiting the cat (only on empty cells): mixed glyphs and colours
      if (t > 3) {
        const FAM = [["*", "+", "."], ["x", "+", "'"], ["o", "*", "."], ["+", ".", "'"]];
        const SPC = ["#ffe08a", "#ffd1e8", "#c4e8ff", "#ffffff"];
        const ccx = left + 14, ccy = topRow + 6;
        for (let i = 0; i < 16; i++) {
          const a2 = i * 0.3927 + t * (0.45 + (i % 3) * 0.12);
          const rx = 17 + (i % 3) * 3;
          const col = Math.round(ccx + rx * Math.cos(a2)), row = Math.round(ccy + (rx / 2) * Math.sin(a2));
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
          const idx = row * cols + col;
          if (chars[idx] !== " ") continue;
          const tw = Math.sin(t * 3 + i * 1.7);
          chars[idx] = FAM[i % 4][tw > 0.5 ? 0 : tw > -0.2 ? 1 : 2];
          colors[idx] = SPC[i % 4];
        }
      }
    }

    // on-screen text (typewriter)
    {
      const shift = Math.floor(t * 6);
      for (const tx of TEXTS) {
        const lines = tx.text.split("\n");
        let budget = Math.max(0, Math.floor((t - tx.start) * (tx.speed || 10)));
        const baseRow = tx.place === "screen"
          ? Math.round(clamp(tx.y === undefined ? 0.5 : tx.y, 0, 1) * (rows - 1)) - Math.floor((lines.length - 1) / 2)
          : L.handRow + CAT_H + (tx.gap === undefined ? 2 : tx.gap);
        for (let li = 0; li < lines.length && budget > 0; li++) {
          const line = lines[li];
          const row = baseRow + li;
          if (row < 0 || row >= rows) { budget -= line.length; continue; }
          const start = Math.max(0, Math.floor((cols - line.length) / 2));
          const shown = Math.min(line.length, budget);
          budget -= line.length;
          for (let i = 0; i < shown; i++) {
            if (start + i >= cols) break;
            const idx = row * cols + start + i;
            chars[idx] = line[i];
            colors[idx] = tx.color === "shimmer" || !tx.color
              ? MSG_COLORS[(i + shift) % MSG_COLORS.length] : tx.color;
          }
        }
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
    updateParticles(dt);
    render(t);
  }

  function replay() { t = 0; resetParticles(); }

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