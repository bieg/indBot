const THREAD_COLORS = {
  structure: '#ffffff',
  energy: '#3aa0ff',
  gravity: '#ffcc33',
  ghost: 'rgba(255,255,255,0.4)',
};

const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

const ORIENTATION_MS  = 1000;
const FADE_DURATION   = 400;
const OPACITY_HOLD    = 1.0;
const OPACITY_END     = 0.95;

let gestureEl = null;
let threadCountEl = null;
let hand0dot = null;
let hand1dot = null;
let skeletonCanvas = null;
let skeletonCtx = null;
let flashTimeout = null;
let lastCount = -1;

const handFirstSeen = [null, null];

export function initHud() {
  gestureEl = document.getElementById('gesture-indicator');
  threadCountEl = document.getElementById('thread-count');
  skeletonCanvas = document.getElementById('skeleton-canvas');
  skeletonCtx = skeletonCanvas.getContext('2d');

  const hud = document.getElementById('hud');
  const indicators = document.createElement('div');
  indicators.id = 'hand-indicators';
  indicators.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
  hand0dot = _makeDot();
  hand1dot = _makeDot();
  indicators.appendChild(hand0dot);
  indicators.appendChild(hand1dot);
  hud.insertBefore(indicators, hud.firstChild);

  _resizeSkeleton();
  window.addEventListener('resize', _resizeSkeleton);
}

function _makeDot() {
  const d = document.createElement('div');
  d.style.cssText = `
    width:8px;height:8px;border-radius:50%;
    background:rgba(255,255,255,0.15);
    transition:background 0.3s,box-shadow 0.3s;
  `;
  return d;
}

function _resizeSkeleton() {
  skeletonCanvas.width = window.innerWidth;
  skeletonCanvas.height = window.innerHeight;
}

export function setGestureHint(type, state) {
  if (!gestureEl) return;
  if (state === 'growing') {
    const color = THREAD_COLORS[type] || '#fff';
    gestureEl.style.color = color;
    gestureEl.textContent = `● ${type} thread forming…`;
    gestureEl.style.opacity = '0.6';
    clearTimeout(flashTimeout);
  } else if (state === 'confirmed') {
    const color = THREAD_COLORS[type] || '#fff';
    gestureEl.style.color = color;
    gestureEl.textContent = `✦ ${type.toUpperCase()} THREAD`;
    gestureEl.style.opacity = '1';
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      if (gestureEl) gestureEl.style.opacity = '0';
    }, 600);
  } else if (state === 'crush') {
    gestureEl.style.color = '#ff6633';
    gestureEl.textContent = '✦ CRUSH';
    gestureEl.style.opacity = '1';
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      if (gestureEl) gestureEl.style.opacity = '0';
    }, 400);
  } else if (state === 'rotate') {
    gestureEl.style.color = '#cc88ff';
    gestureEl.textContent = '↻ ROTATE';
    gestureEl.style.opacity = '1';
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => {
      if (gestureEl) gestureEl.style.opacity = '0';
    }, 500);
  } else {
    gestureEl.style.opacity = '0';
  }
}

export function updateThreadCount(count) {
  if (!threadCountEl || count === lastCount) return;
  lastCount = count;
  threadCountEl.textContent = `Threads: ${count}`;
}

const FINGERTIPS = [4, 8, 12, 16, 20];
const KNUCKLE_SET = new Set([5, 6, 9, 10, 13, 14, 17, 18]);

const PALM_TRIS = [
  [0, 1, 5],
  [0, 5, 9],
  [0, 9, 13],
  [0, 13, 17],
  [5, 6, 9],
  [9, 10, 13],
  [13, 14, 17],
  [5, 9, 13],
  [9, 13, 17],
];

// Arcane / Spider-Verse kleurpalet
// cr 0-1  (17%) → goud       #ffd700
// cr 2-4  (25%) → elektrisch cyaan  #00ccff
// cr 5-7  (25%) → blauw-wit  #aaddff
// cr 8-9  (17%) → levendig paars  #8833ff
// cr 10   ( 8%) → magenta spark  #ff22cc
// cr 11   ( 8%) → helder wit  #ffffff
function _color(p, a) {
  if (p.gold)    return `rgba(255,215,0,${a})`;
  if (p.cyan)    return `rgba(0,200,255,${a})`;
  if (p.purple)  return `rgba(140,50,255,${a})`;
  if (p.magenta) return `rgba(255,30,190,${a})`;
  if (p.white)   return `rgba(255,255,255,${a})`;
  return             `rgba(170,215,255,${a})`; // blauwig basis
}

function _cr(a, b, p) { return (a * 17 + b * 29 + p * 7) % 12; }
function _crFlags(cr) {
  return {
    gold:    cr < 2,
    cyan:    cr >= 2 && cr < 5,
    purple:  cr >= 8 && cr < 10,
    magenta: cr === 10,
    white:   cr === 11,
  };
}

// Per-bot breedte — 30% kleiner dan vorige versie + tapering
const _BONE_SPREAD = [
  0.25, 0.21, 0.17, 0.11, // duim
  0.28, 0.23, 0.18, 0.12, // wijsvinger
  0.29, 0.25, 0.19, 0.13, // middelvinger
  0.28, 0.23, 0.18, 0.12, // ringvinger
  0.23, 0.19, 0.14, 0.09, // pink
  0.06, 0.06, 0.06,        // palmverbindingen
];

const _BONE_N = [
  180, 155, 128, 95,
  200, 170, 140, 105,
  210, 178, 148, 112,
  200, 170, 140, 105,
  165, 138, 110, 82,
  55, 55, 55,
];

// Doorlopende kleine puntjes — geen grote blobs, wel sparkles op top-tier
function _sz(ti_bi, p, tier) {
  return tier >= 9 ? 1.4 + ((ti_bi * 3 + p) % 5) / 4   // 1.4–2.6px max sparkle
       : tier >= 7 ? 0.7 + ((ti_bi * 5 + p) % 6) / 8    // 0.7–1.45px medium
       :             0.3 + ((ti_bi * 7 + p * 11) % 6) / 14; // 0.3–0.73px micro
}
function _al(tier, tier9b, tier7b, baseB) {
  return tier >= 9 ? tier9b : tier >= 7 ? tier7b : baseB;
}

// Palm: barycentrische point cloud — Arcane-stijl
const _PALM_PARTS = PALM_TRIS.map((tri, ti) => {
  const N = 190;
  return Array.from({ length: N }, (_, p) => {
    let u = ((ti * 37 + p * 13 + 3) % 97) / 97;
    let v = ((ti * 41 + p * 71 + 11) % 97) / 97;
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const dz  = (((ti * 43 + p * 31 + 7) % 97) / 97 * 2 - 1) * 0.04;
    const ph  = ((ti * 31 + p * 41) % 97) / 97 * Math.PI * 2;
    const tier = (ti * 7 + p * 17) % 10;
    const cr   = _cr(ti, 0, p);
    const big  = tier >= 8;
    const isHex  = tier === 7 && ((ti * 13 + p * 11) % 3 === 0);
    const isStar = tier === 9 && ((ti * 11 + p * 7) % 2 === 0);
    return {
      u, v, dz, ph,
      sz: _sz(ti, p, tier),
      al: _al(tier,
        0.90 + ((ti + p * 3) % 14) / 100,
        0.55 + ((ti * 3 + p) % 28) / 100,
        0.15 + ((ti * 3 + p * 7) % 22) / 100),
      ..._crFlags(cr),
      hex: isHex,
      star: isStar,
    };
  });
});

// Vinger-tubes: cosinusprofiel + Z-cilinder + Arcane-kleur
const _BONE_PARTS = HAND_CONNECTIONS.map(([a, b], bi) => {
  const N      = _BONE_N[bi];
  const SPREAD = _BONE_SPREAD[bi];
  return Array.from({ length: N }, (_, p) => {
    const t  = ((bi * 37 + p * 13 + 3) % 97) / 97;
    const r1 = ((bi * 31 + p * 19 + 11) % 97) / 97;
    const r2 = ((bi * 53 + p * 29 + 7)  % 97) / 97;
    const raw     = r1 + r2 - 1;
    const perp    = raw * SPREAD;
    const absFrac = Math.abs(raw);
    // Cel-shaded contrast: steilere curve dan cosinus
    const cosF    = Math.pow(Math.max(0, Math.cos(absFrac * Math.PI * 0.5)), 1.4);
    const isCore  = absFrac < 0.22;
    const sinF    = Math.sqrt(Math.max(0, 1 - raw * raw));
    const dz      = sinF * SPREAD * 0.28 * (((bi * 41 + p * 31 + 13) % 2) ? 1 : -1);
    const ph      = ((bi * 31 + p * 41) % 97) / 97 * Math.PI * 2;
    const tier    = (bi * 7 + p * 17) % 10;
    const cr      = _cr(bi, 0, p);
    const isHex   = tier === 7 && ((bi * 13 + p * 11) % 3 === 0) && !isCore;
    const isStar  = isCore && tier === 9 && ((bi * 7 + p * 11) % 3 === 0);
    const baseSz  = _sz(bi, p, tier);
    const baseAl  = _al(tier,
      0.85 + ((bi + p * 3) % 16) / 100,
      0.50 + ((bi * 3 + p) % 26) / 100,
      0.16 + ((bi * 3 + p * 7) % 22) / 100);
    return {
      t, perp, dz, ph,
      sz: baseSz * (0.45 + cosF * 0.75) * (isCore ? 1.35 : 1.0),
      al: baseAl * cosF * cosF * (isCore ? 1.45 : 1.0),
      ..._crFlags(cr),
      hex: isHex,
      star: isStar,
    };
  });
});

// Gewrichtsbollen — knokkelaccent prominent
const _JOINT_PARTS = Array.from({ length: 21 }, (_, li) => {
  const ft      = FINGERTIPS.includes(li);
  const knuckle = KNUCKLE_SET.has(li);
  const N = ft ? 30 : knuckle ? 18 : 11;
  const R = ft ? 10 : knuckle ? 8 : 5; // 30% kleiner
  return Array.from({ length: N }, (_, p) => {
    const ang  = ((li * 41 + p * 17) % 317) / 317 * Math.PI * 2;
    const frac = ((li * 23 + p * 37 + 7) % 97) / 97;
    const dz   = (((li * 31 + p * 43 + 11) % 97) / 97 * 2 - 1) * 0.03;
    const ph   = ((li * 29 + p * 53) % 97) / 97 * Math.PI * 2;
    const tier = (li * 7 + p * 17) % 10;
    const cr   = _cr(li, 0, p);
    const big  = tier >= 8;
    const isStar = (ft || knuckle) && tier >= 8 && ((li * 5 + p * 7) % 3 === 0);
    return {
      dx: Math.cos(ang) * R * frac,
      dy: Math.sin(ang) * R * frac,
      dz, ph,
      sz: big ? 2.0 + ((li + p) % 4) / 2 : 0.4 + ((li * 7 + p * 13) % 6) / 12,
      al: _al(tier,
        0.88 + ((li * 3 + p) % 14) / 100,
        0.55 + ((li * 3 + p) % 26) / 100,
        0.28 + ((li * 3 + p * 7) % 28) / 100),
      ..._crFlags(cr),
      star: isStar,
    };
  });
});

// 4-puntige ster (Spider-Verse pop-art sparkle)
function _fillStar(ctx, cx, cy, r) {
  const inner = r * 0.22;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 - Math.PI / 4;
    const rad = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// Hexagon (Arcane hextech kristal)
function _fillHex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 - Math.PI / 6;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function _drawHand(ctx, landmarks, w, h, opacity = 1, time = 0) {
  const X  = lm => lm.x * w;   // geen extra flip — webcam CSS doet scaleX(-1)
  const Y  = lm => lm.y * h;
  const LZ = lm => (lm.z || 0);
  const DEPTH = 6; // alleen alpha, grootte nauwelijks

  function _put(px, py, pz, p) {
    const df  = Math.max(0.5, 1 + (-pz) * DEPTH);
    const sh  = 1 + Math.sin(time * 0.004 + p.ph) * 0.10;
    const a   = Math.min(1, p.al * opacity * df * sh);
    // grootte slechts licht beïnvloed door diepte — geen enorme blobs
    const sz  = p.sz * Math.max(0.85, 1 + (-pz) * 1.2);
    ctx.fillStyle = _color(p, a);
    if      (p.star && sz > 1.6) _fillStar(ctx, px, py, sz);
    else if (p.hex  && sz > 1.2) _fillHex(ctx, px, py, sz);
    else { ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill(); }
  }

  // 1. Palm
  for (let ti = 0; ti < PALM_TRIS.length; ti++) {
    const [i0, i1, i2] = PALM_TRIS[ti];
    const ax = X(landmarks[i0]), ay = Y(landmarks[i0]), az = LZ(landmarks[i0]);
    const bx = X(landmarks[i1]), by = Y(landmarks[i1]), bz = LZ(landmarks[i1]);
    const cx = X(landmarks[i2]), cy = Y(landmarks[i2]), cz = LZ(landmarks[i2]);
    for (const p of _PALM_PARTS[ti]) {
      const ww = 1 - p.u - p.v;
      _put(
        ax * p.u + bx * p.v + cx * ww,
        ay * p.u + by * p.v + cy * ww,
        az * p.u + bz * p.v + cz * ww + p.dz,
        p);
    }
  }

  // 2. Vingerbotten
  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [la, lb] = HAND_CONNECTIONS[bi];
    const ax = X(landmarks[la]), ay = Y(landmarks[la]), az = LZ(landmarks[la]);
    const bx = X(landmarks[lb]), by = Y(landmarks[lb]), bz = LZ(landmarks[lb]);
    const edx = bx - ax, edy = by - ay;
    const len = Math.sqrt(edx * edx + edy * edy) || 1;
    const nx = -edy / len, ny = edx / len;
    for (const p of _BONE_PARTS[bi]) {
      const perpPx = p.perp * len;
      _put(
        ax + edx * p.t + nx * perpPx,
        ay + edy * p.t + ny * perpPx,
        az * (1 - p.t) + bz * p.t + p.dz,
        p);
    }
  }

  // 3. Gewrichtsbollen
  for (let li = 0; li < 21; li++) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]), cz = LZ(landmarks[li]);
    for (const p of _JOINT_PARTS[li]) {
      const df  = Math.max(0.5, 1 + (-(cz + p.dz)) * DEPTH);
      const sh  = 1 + Math.sin(time * 0.004 + p.ph) * 0.10;
      const a   = Math.min(1, p.al * opacity * df * sh);
      const sz  = p.sz * Math.max(0.85, 1 + (-(cz + p.dz)) * 1.2);
      ctx.fillStyle = _color(p, a);
      if (p.star && sz > 1.6) _fillHex(ctx, cx + p.dx, cy + p.dy, sz);
      else { ctx.beginPath(); ctx.arc(cx + p.dx, cy + p.dy, sz, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // 4. Vingertop-halos — neon elektrisch cyaan (Arcane)
  for (const li of FINGERTIPS) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 15);
    g.addColorStop(0,   `rgba(120,240,255,${0.65 * opacity})`);
    g.addColorStop(0.5, `rgba(60,160,255,${0.20 * opacity})`);
    g.addColorStop(1,   'rgba(100,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSkeleton(handsResults, handInfos, time = 0) {
  if (!skeletonCtx) return;
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skeletonCtx.clearRect(0, 0, w, h);

  const now = performance.now();

  for (let hi = 0; hi < 2; hi++) {
    const dot = hi === 0 ? hand0dot : hand1dot;
    const landmarks = handsResults && handsResults.landmarks ? handsResults.landmarks[hi] : null;
    const info = handInfos ? handInfos[hi] : null;

    if (!landmarks) {
      handFirstSeen[hi] = null;
      if (dot) {
        dot.style.background = 'rgba(255,255,255,0.15)';
        dot.style.boxShadow = 'none';
      }
      continue;
    }

    if (dot) {
      const orienting = info && info.orienting;
      if (orienting) {
        dot.style.background = 'rgba(255,255,255,0.9)';
        dot.style.boxShadow = '0 0 8px 3px rgba(255,255,255,0.5)';
      } else {
        dot.style.background = '#ffcc33';
        dot.style.boxShadow = '0 0 6px 2px rgba(255,204,51,0.6)';
      }
    }

    if (handFirstSeen[hi] === null) handFirstSeen[hi] = now;
    const elapsed = now - handFirstSeen[hi];
    let opacity;
    if (elapsed < ORIENTATION_MS) {
      opacity = OPACITY_HOLD * Math.min(elapsed / 300, 1);
    } else {
      const t = Math.min((elapsed - ORIENTATION_MS) / FADE_DURATION, 1);
      opacity = OPACITY_HOLD + (OPACITY_END - OPACITY_HOLD) * t;
    }

    _drawHand(skeletonCtx, landmarks, w, h, opacity, time);

    if (info && info.present) {
      const FINGERS = ['structure', 'energy', 'gravity', 'ghost'];
      for (let fi = 0; fi < 4; fi++) {
        if (info.fingerStates[fi] !== 'growing') continue;
        const ratio = info.ratios[fi];
        const armT = info.armThresholds[fi];
        const relT = info.releaseThresholds[fi];
        const progress = Math.max(0, Math.min(1, (ratio - relT) / (armT - relT)));
        if (progress <= 0) continue;

        const tx = (1 - info.thumbMp.x) * w;
        const ty = info.thumbMp.y * h;
        const color = THREAD_COLORS[FINGERS[fi]];

        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, 0, Math.PI * 2);
        skeletonCtx.strokeStyle = 'rgba(255,255,255,0.12)';
        skeletonCtx.lineWidth = 2;
        skeletonCtx.stroke();

        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        skeletonCtx.strokeStyle = color;
        skeletonCtx.lineWidth = 2.5;
        skeletonCtx.stroke();
      }
    }
  }
}
