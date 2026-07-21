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

// Palm: barycentrische point cloud met Z-diepte voor 3D volume
const _PALM_PARTS = PALM_TRIS.map((tri, ti) => {
  const N = 180;
  return Array.from({ length: N }, (_, p) => {
    let u = ((ti * 37 + p * 13 + 3) % 97) / 97;
    let v = ((ti * 41 + p * 71 + 11) % 97) / 97;
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    // dz = Z-offset voor palmdikte (±0.05 in MP-ruimte)
    const dz = (((ti * 43 + p * 31 + 7) % 97) / 97 * 2 - 1) * 0.05;
    const tier = (ti * 7 + p * 17) % 10;
    const isStar = tier === 9 && ((ti * 11 + p * 7) % 3 === 0);
    return {
      u, v, dz,
      sz: tier >= 9 ? 1.9 + ((ti * 3 + p) % 6) / 3
        : tier >= 7 ? 0.9 + ((ti * 5 + p) % 7) / 8
        :             0.3 + ((ti * 7 + p * 11) % 7) / 14,
      al: tier >= 9 ? 0.82 + ((ti + p * 3) % 18) / 100
        : tier >= 7 ? 0.44 + ((ti * 3 + p) % 28) / 100
        :             0.12 + ((ti * 3 + p * 7) % 26) / 100,
      gold: (ti * 13 + p * 23) % 5 === 0,
      star: isStar,
    };
  });
});

// Vinger-tubes: cosinusprofiel + Z-cilinder voor echte 3D diepte
// bi 0-17 = vingerbotten, bi 18-20 = palmverbindingen
const _BONE_PARTS = HAND_CONNECTIONS.map(([a, b], bi) => {
  const isFinger = bi < 18;
  const N      = isFinger ? 150 : 40;
  const SPREAD = isFinger ? 0.40 : 0.10;
  return Array.from({ length: N }, (_, p) => {
    const t  = ((bi * 37 + p * 13 + 3) % 97) / 97;
    const r1 = ((bi * 31 + p * 19 + 11) % 97) / 97;
    const r2 = ((bi * 53 + p * 29 + 7)  % 97) / 97;
    const perp    = (r1 + r2 - 1) * SPREAD;
    const absFrac = Math.abs(r1 + r2 - 1);
    const cosF    = Math.cos(absFrac * Math.PI * 0.5); // cilindrisch lichtprofiel
    const isCore  = absFrac < 0.20;
    // Z-component van de cilindrische doorsnede: sin() van hetzelfde hoek
    const sinF = Math.sqrt(Math.max(0, 1 - (r1 + r2 - 1) * (r1 + r2 - 1)));
    const dz   = sinF * SPREAD * 0.30 * (((bi * 41 + p * 31 + 13) % 2) ? 1 : -1);
    const tier = (bi * 7 + p * 17) % 10;
    const isStar = isCore && tier === 9 && ((bi * 7 + p * 11) % 4 === 0);
    const baseSz = tier >= 9 ? 1.8 + ((bi * 3 + p) % 6) / 3
                 : tier >= 7 ? 0.9 + ((bi * 5 + p) % 7) / 8
                 :             0.35 + ((bi * 7 + p * 11) % 7) / 14;
    const baseAl = tier >= 9 ? 0.78 + ((bi + p * 3) % 20) / 100
                 : tier >= 7 ? 0.45 + ((bi * 3 + p) % 28) / 100
                 :             0.14 + ((bi * 3 + p * 7) % 26) / 100;
    return {
      t, perp, dz,
      sz: baseSz * (0.50 + cosF * 0.70) * (isCore ? 1.30 : 1.0),
      al: baseAl * cosF * cosF * (isCore ? 1.40 : 1.0),
      gold: (bi * 13 + p * 23) % 7 === 0,
      star: isStar,
    };
  });
});

// Gewrichtsclusters — helder bolletje op elk knooppunt
const _JOINT_PARTS = Array.from({ length: 21 }, (_, li) => {
  const ft = FINGERTIPS.includes(li);
  const N  = ft ? 30 : 14;
  const R  = ft ? 13 :  8;
  return Array.from({ length: N }, (_, p) => {
    const ang  = ((li * 41 + p * 17) % 317) / 317 * Math.PI * 2;
    const frac = ((li * 23 + p * 37 + 7) % 97) / 97;
    const dz   = (((li * 31 + p * 43 + 11) % 97) / 97 * 2 - 1) * 0.04;
    const tier = (li * 7 + p * 17) % 10;
    const isStar = ft && tier >= 8 && ((li * 5 + p * 7) % 4 === 0);
    return {
      dx: Math.cos(ang) * R * frac,
      dy: Math.sin(ang) * R * frac,
      dz,
      sz: tier >= 8 ? 1.5 + ((li + p) % 5) / 3
                    : 0.4 + ((li * 7 + p * 13) % 8) / 10,
      al: tier >= 8 ? 0.82 + ((li * 3 + p) % 20) / 100
                    : 0.30 + ((li * 3 + p * 7) % 32) / 100,
      star: isStar,
    };
  });
});

// 4-puntige ster voor sparkle-particles
function _fillStar(ctx, cx, cy, r) {
  const inner = r * 0.28;
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

function _drawHand(ctx, landmarks, w, h, opacity = 1) {
  const X  = lm => (1 - lm.x) * w;
  const Y  = lm => lm.y * h;
  const LZ = lm => (lm.z || 0); // MediaPipe Z: negatief = dichter bij camera

  // Hoe sterk Z de grootte/helderheid beïnvloedt
  const DEPTH = 7;

  // 1. Palm — barycentrische point cloud
  for (let ti = 0; ti < PALM_TRIS.length; ti++) {
    const [i0, i1, i2] = PALM_TRIS[ti];
    const ax = X(landmarks[i0]), ay = Y(landmarks[i0]), az = LZ(landmarks[i0]);
    const bx = X(landmarks[i1]), by = Y(landmarks[i1]), bz = LZ(landmarks[i1]);
    const cx = X(landmarks[i2]), cy = Y(landmarks[i2]), cz = LZ(landmarks[i2]);
    for (const p of _PALM_PARTS[ti]) {
      const ww = 1 - p.u - p.v;
      const px = ax * p.u + bx * p.v + cx * ww;
      const py = ay * p.u + by * p.v + cy * ww;
      const pz = az * p.u + bz * p.v + cz * ww + p.dz;
      const df = Math.max(0.4, 1 + (-pz) * DEPTH);
      const a  = Math.min(1, p.al * opacity * df);
      const sz = p.sz * Math.max(0.5, df);
      ctx.fillStyle = p.gold ? `rgba(255,210,90,${a})` : `rgba(255,252,235,${a})`;
      if (p.star && sz > 1.8) { _fillStar(ctx, px, py, sz); }
      else { ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // 2. Vingerbotten — cilindrische point cloud met Z-diepte
  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [la, lb] = HAND_CONNECTIONS[bi];
    const ax = X(landmarks[la]), ay = Y(landmarks[la]), az = LZ(landmarks[la]);
    const bx = X(landmarks[lb]), by = Y(landmarks[lb]), bz = LZ(landmarks[lb]);
    const edx = bx - ax, edy = by - ay;
    const len = Math.sqrt(edx * edx + edy * edy) || 1;
    const nx = -edy / len, ny = edx / len;
    for (const p of _BONE_PARTS[bi]) {
      const perpPx = p.perp * len;
      const px = ax + edx * p.t + nx * perpPx;
      const py = ay + edy * p.t + ny * perpPx;
      const pz = az * (1 - p.t) + bz * p.t + p.dz;
      const df = Math.max(0.4, 1 + (-pz) * DEPTH);
      const a  = Math.min(1, p.al * opacity * df);
      const sz = p.sz * Math.max(0.5, df);
      ctx.fillStyle = p.gold ? `rgba(255,210,90,${a})` : `rgba(255,252,235,${a})`;
      if (p.star && sz > 1.8) { _fillStar(ctx, px, py, sz); }
      else { ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // 3. Gewrichtsclusters — bollen op de knooppunten
  for (let li = 0; li < 21; li++) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]), cz = LZ(landmarks[li]);
    for (const p of _JOINT_PARTS[li]) {
      const pz = cz + p.dz;
      const df = Math.max(0.4, 1 + (-pz) * DEPTH);
      const a  = Math.min(1, p.al * opacity * df);
      const sz = p.sz * Math.max(0.5, df);
      ctx.fillStyle = `rgba(255,255,245,${a})`;
      if (p.star && sz > 1.8) { _fillStar(ctx, cx + p.dx, cy + p.dy, sz); }
      else { ctx.beginPath(); ctx.arc(cx + p.dx, cy + p.dy, sz, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // 4. Vingertop-halos
  for (const li of FINGERTIPS) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    g.addColorStop(0,   `rgba(255,245,200,${0.62 * opacity})`);
    g.addColorStop(0.5, `rgba(255,225,130,${0.18 * opacity})`);
    g.addColorStop(1,   'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSkeleton(handsResults, handInfos) {
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

    _drawHand(skeletonCtx, landmarks, w, h, opacity);

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
