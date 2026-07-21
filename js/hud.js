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
let _blurCanvas = null;
let _blurCtx    = null;

// per-hand first-seen timestamp for fade
const handFirstSeen = [null, null];

export function initHud() {
  gestureEl = document.getElementById('gesture-indicator');
  threadCountEl = document.getElementById('thread-count');
  skeletonCanvas = document.getElementById('skeleton-canvas');
  skeletonCtx = skeletonCanvas.getContext('2d');

  // inject hand indicator dots into the HUD
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

// Palm triangles: 9 triangles die de hele palm + ruimte tussen vingers vullen
const PALM_TRIS = [
  // Onderste palm (pols naar knokkels)
  [0, 1, 5],
  [0, 5, 9],
  [0, 9, 13],
  [0, 13, 17],
  // Bovenste palm (tussen knokkels en eerste vingerlid)
  [5, 6, 9],
  [9, 10, 13],
  [13, 14, 17],
  // Midden palm
  [5, 9, 13],
  [9, 13, 17],
];

// Sparkle particles: small texture dots scattered around each bone (not the base shape)
const _SPARKLES = HAND_CONNECTIONS.map(([a, b], bi) => {
  const N = 45;
  return Array.from({ length: N }, (_, p) => {
    const t   = ((bi * 37 + p * 13 + 3) % 97) / 97;
    const ang = ((bi * 41 + p * 71 + 13) % 317) / 317 * Math.PI * 2;
    const r   = ((bi * 31 + p * 19 + 11) % 97) / 97 * 12; // max 12px scatter
    return {
      t,
      dx: Math.cos(ang) * r,
      dy: Math.sin(ang) * r,
      sz: 0.3 + ((bi * 7 + p * 11) % 16) / 16,  // 0.3–1.3px
      al: 0.35 + ((bi * 3 + p * 7) % 40) / 100,
    };
  });
});

function _drawHand(ctx, landmarks, w, h, opacity = 1) {
  const X = lm => (1 - lm.x) * w;
  const Y = lm => lm.y * h;

  // ── 1. Soft glowing tubes on offscreen canvas, then blur-composite ────────
  if (!_blurCanvas) {
    _blurCanvas = document.createElement('canvas');
    _blurCtx    = _blurCanvas.getContext('2d');
  }
  if (_blurCanvas.width !== w || _blurCanvas.height !== h) {
    _blurCanvas.width  = w;
    _blurCanvas.height = h;
  }
  const bc = _blurCtx;
  bc.clearRect(0, 0, w, h);
  bc.lineCap  = 'round';
  bc.lineJoin = 'round';

  // Palm fill — warm area
  for (const [ia, ib, ic] of PALM_TRIS) {
    bc.fillStyle = `rgba(255,235,190,${0.18 * opacity})`;
    bc.beginPath();
    bc.moveTo(X(landmarks[ia]), Y(landmarks[ia]));
    bc.lineTo(X(landmarks[ib]), Y(landmarks[ib]));
    bc.lineTo(X(landmarks[ic]), Y(landmarks[ic]));
    bc.closePath();
    bc.fill();
  }

  // Outer halo — soft glow around each bone
  for (const [a, b] of HAND_CONNECTIONS) {
    bc.strokeStyle = `rgba(255,228,160,${0.20 * opacity})`;
    bc.lineWidth = 10;
    bc.beginPath();
    bc.moveTo(X(landmarks[a]), Y(landmarks[a]));
    bc.lineTo(X(landmarks[b]), Y(landmarks[b]));
    bc.stroke();
  }

  // Bright core
  for (const [a, b] of HAND_CONNECTIONS) {
    bc.strokeStyle = `rgba(255,252,228,${0.70 * opacity})`;
    bc.lineWidth = 3;
    bc.beginPath();
    bc.moveTo(X(landmarks[a]), Y(landmarks[a]));
    bc.lineTo(X(landmarks[b]), Y(landmarks[b]));
    bc.stroke();
  }

  // Joint dots
  for (let li = 0; li < 21; li++) {
    bc.fillStyle = `rgba(255,255,240,${0.85 * opacity})`;
    bc.beginPath();
    bc.arc(X(landmarks[li]), Y(landmarks[li]), FINGERTIPS.includes(li) ? 4 : 2.5, 0, Math.PI * 2);
    bc.fill();
  }

  // Blur pass — 6px geeft zachte randen zonder overdreven dikte
  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.drawImage(_blurCanvas, 0, 0);
  ctx.filter = 'none';
  ctx.restore();

  // ── 2. Sparkle overlay — tiny bright dots for texture/depth ───────────────
  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [a, b] = HAND_CONNECTIONS[bi];
    const ax = X(landmarks[a]), ay = Y(landmarks[a]);
    const bx = X(landmarks[b]), by = Y(landmarks[b]);
    const edx = bx - ax, edy = by - ay;
    const len = Math.sqrt(edx * edx + edy * edy) || 1;
    const nx = -edy / len, ny = edx / len;
    for (const p of _SPARKLES[bi]) {
      ctx.fillStyle = `rgba(255,253,235,${p.al * opacity})`;
      ctx.beginPath();
      ctx.arc(
        ax + edx * p.t + nx * p.dx + (edx / len) * p.dy,
        ay + edy * p.t + ny * p.dx + (edy / len) * p.dy,
        p.sz, 0, Math.PI * 2,
      );
      ctx.fill();
    }
  }

  // ── 3. Fingertip halos — soft radial gradient ─────────────────────────────
  for (const li of FINGERTIPS) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    g.addColorStop(0,   `rgba(255,255,220,${0.60 * opacity})`);
    g.addColorStop(0.4, `rgba(255,240,155,${0.22 * opacity})`);
    g.addColorStop(1,   'rgba(255,215,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
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

    // hand indicator dot — pulse white during orientation, gold after
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

    // orientation hold then fade
    if (handFirstSeen[hi] === null) handFirstSeen[hi] = now;
    const elapsed = now - handFirstSeen[hi];
    let opacity;
    if (elapsed < ORIENTATION_MS) {
      // hold at 20% during orientation window (fade in over first 300ms)
      opacity = OPACITY_HOLD * Math.min(elapsed / 300, 1);
    } else {
      // fade from 20% to dim over FADE_DURATION
      const t = Math.min((elapsed - ORIENTATION_MS) / FADE_DURATION, 1);
      opacity = OPACITY_HOLD + (OPACITY_END - OPACITY_HOLD) * t;
    }

    _drawHand(skeletonCtx, landmarks, w, h, opacity);

    // draw progress arcs for growing gestures
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

        // outer dim ring
        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, 0, Math.PI * 2);
        skeletonCtx.strokeStyle = 'rgba(255,255,255,0.12)';
        skeletonCtx.lineWidth = 2;
        skeletonCtx.stroke();

        // progress arc (filled clockwise from top)
        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        skeletonCtx.strokeStyle = color;
        skeletonCtx.lineWidth = 2.5;
        skeletonCtx.stroke();
      }
    }
  }
}
