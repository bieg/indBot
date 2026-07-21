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

// 9 driehoeken die de volledige palm bedekken
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

// Palm fill: barycentrische scatter — vult het volledige palmoppervlak
const _PALM_PARTS = PALM_TRIS.map((tri, ti) => {
  const N = 130;
  return Array.from({ length: N }, (_, p) => {
    let u = ((ti * 37 + p * 13 + 3) % 97) / 97;
    let v = ((ti * 41 + p * 71 + 11) % 97) / 97;
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    // 70% basis-wolk, 20% midden, 10% sparkle
    const tier = (ti * 7 + p * 17) % 10;
    return {
      u, v,
      sz: tier >= 9 ? 1.6 + ((ti * 3 + p) % 6) / 3
        : tier >= 7 ? 0.8 + ((ti * 5 + p) % 7) / 8
        :             0.3 + ((ti * 7 + p * 11) % 7) / 14,
      al: tier >= 9 ? 0.75 + ((ti + p * 3) % 18) / 100
        : tier >= 7 ? 0.38 + ((ti * 3 + p) % 28) / 100
        :             0.10 + ((ti * 3 + p * 7) % 26) / 100,
      gold: (ti * 13 + p * 23) % 6 === 0,
    };
  });
});

// Vinger-tubes: breed scatter proportioneel aan segmentlengte
const _BONE_PARTS = HAND_CONNECTIONS.map(([a, b], bi) => {
  const N = 55;
  return Array.from({ length: N }, (_, p) => {
    const t    = ((bi * 37 + p * 13 + 3) % 97) / 97;
    // perp = fractie van segmentlengte → schaalt mee met afstand camera
    const perp = (((bi * 31 + p * 19 + 11) % 97) / 97 * 2 - 1) * 0.20;
    const tier = (bi * 7 + p * 17) % 10;
    return {
      t, perp,
      sz: tier >= 9 ? 1.4 + ((bi * 3 + p) % 6) / 3
        : tier >= 7 ? 0.7 + ((bi * 5 + p) % 7) / 8
        :             0.3 + ((bi * 7 + p * 11) % 7) / 14,
      al: tier >= 9 ? 0.70 + ((bi + p * 3) % 20) / 100
        : tier >= 7 ? 0.35 + ((bi * 3 + p) % 28) / 100
        :             0.08 + ((bi * 3 + p * 7) % 26) / 100,
      gold: (bi * 13 + p * 23) % 6 === 0,
    };
  });
});

// Gewrichtsclusters — helder op elk knooppunt
const _JOINT_PARTS = Array.from({ length: 21 }, (_, li) => {
  const ft = FINGERTIPS.includes(li);
  const N  = ft ? 20 : 9;
  const R  = ft ? 10 :  6;
  return Array.from({ length: N }, (_, p) => {
    const ang  = ((li * 41 + p * 17) % 317) / 317 * Math.PI * 2;
    const frac = ((li * 23 + p * 37 + 7) % 97) / 97;
    const tier = (li * 7 + p * 17) % 10;
    return {
      dx: Math.cos(ang) * R * frac,
      dy: Math.sin(ang) * R * frac,
      sz: tier >= 8 ? 1.3 + ((li + p) % 5) / 3
                    : 0.4 + ((li * 7 + p * 13) % 8) / 10,
      al: tier >= 8 ? 0.72 + ((li * 3 + p) % 20) / 100
                    : 0.28 + ((li * 3 + p * 7) % 32) / 100,
    };
  });
});

function _drawHand(ctx, landmarks, w, h, opacity = 1) {
  const X = lm => (1 - lm.x) * w;
  const Y = lm => lm.y * h;

  // 1. Palm oppervlak — vul elke driehoek met stippelwolk
  for (let ti = 0; ti < PALM_TRIS.length; ti++) {
    const [i0, i1, i2] = PALM_TRIS[ti];
    const ax = X(landmarks[i0]), ay = Y(landmarks[i0]);
    const bx = X(landmarks[i1]), by = Y(landmarks[i1]);
    const cx = X(landmarks[i2]), cy = Y(landmarks[i2]);
    for (const p of _PALM_PARTS[ti]) {
      const ww = 1 - p.u - p.v;
      const px = ax * p.u + bx * p.v + cx * ww;
      const py = ay * p.u + by * p.v + cy * ww;
      const a = p.al * opacity;
      ctx.fillStyle = p.gold ? `rgba(255,210,90,${a})` : `rgba(255,252,235,${a})`;
      ctx.beginPath();
      ctx.arc(px, py, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Vingertube fill — breed scatter langs elk segment
  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [la, lb] = HAND_CONNECTIONS[bi];
    const ax = X(landmarks[la]), ay = Y(landmarks[la]);
    const bx = X(landmarks[lb]), by = Y(landmarks[lb]);
    const edx = bx - ax, edy = by - ay;
    const len = Math.sqrt(edx * edx + edy * edy) || 1;
    const nx = -edy / len, ny = edx / len;
    for (const p of _BONE_PARTS[bi]) {
      const perpPx = p.perp * len;
      const px = ax + edx * p.t + nx * perpPx;
      const py = ay + edy * p.t + ny * perpPx;
      const a = p.al * opacity;
      ctx.fillStyle = p.gold ? `rgba(255,210,90,${a})` : `rgba(255,252,235,${a})`;
      ctx.beginPath();
      ctx.arc(px, py, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Gewrichtsclusters
  for (let li = 0; li < 21; li++) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    for (const p of _JOINT_PARTS[li]) {
      ctx.fillStyle = `rgba(255,255,245,${p.al * opacity})`;
      ctx.beginPath();
      ctx.arc(cx + p.dx, cy + p.dy, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Vingertoppen-halo — warme goudglow
  for (const li of FINGERTIPS) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    g.addColorStop(0,   `rgba(255,245,200,${0.55 * opacity})`);
    g.addColorStop(0.5, `rgba(255,225,130,${0.15 * opacity})`);
    g.addColorStop(1,   'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
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
