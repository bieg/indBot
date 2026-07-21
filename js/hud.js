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

// Capsule-based solid hand renderer — fills each finger bone with an opaque pill shape,
// then overlays a neon cyan/purple glow outline (Arcane aesthetic).
// This makes the hand look solid (from the outside) rather than a see-through wireframe.

// Capsule radii as fraction of wrist→middle-MCP hand scale
const _RSCALE = [
  0.090, 0.082, 0.072, 0.058,  // thumb
  0.095, 0.085, 0.072, 0.058,  // index
  0.100, 0.090, 0.076, 0.062,  // middle
  0.095, 0.085, 0.072, 0.058,  // ring
  0.082, 0.070, 0.058, 0.046,  // pinky
  0.075, 0.075, 0.075,          // palm knuckle connectors
];

// Builds a capsule (pill) path between (ax,ay) and (bx,by) with radius r
function _capsule(ctx, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) { ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2); return; }
  const nx = -dy / len, ny = dx / len;
  const ang = Math.atan2(ny, nx);
  ctx.beginPath();
  ctx.arc(bx, by, r, ang, ang + Math.PI);
  ctx.arc(ax, ay, r, ang + Math.PI, ang + Math.PI * 2);
  ctx.closePath();
}

function _drawHand(ctx, landmarks, w, h, opacity = 1, time = 0) {
  const pts = landmarks.map(lm => ({ x: lm.x * w, y: lm.y * h, z: lm.z || 0 }));

  // Hand scale: wrist (0) → middle MCP (9)
  const scale = Math.hypot(pts[9].x - pts[0].x, pts[9].y - pts[0].y) || 80;

  const palmRing = [0, 1, 5, 9, 13, 17];
  const fillC = `rgba(8,4,22,${0.92 * opacity})`;

  // === PASS 1: dark solid fill builds opaque silhouette ===
  ctx.save();
  ctx.fillStyle = fillC;

  ctx.beginPath();
  ctx.moveTo(pts[palmRing[0]].x, pts[palmRing[0]].y);
  for (let i = 1; i < palmRing.length; i++) ctx.lineTo(pts[palmRing[i]].x, pts[palmRing[i]].y);
  ctx.closePath();
  ctx.fill();

  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [la, lb] = HAND_CONNECTIONS[bi];
    _capsule(ctx, pts[la].x, pts[la].y, pts[lb].x, pts[lb].y, _RSCALE[bi] * scale);
    ctx.fillStyle = fillC;
    ctx.fill();
  }

  ctx.restore();

  // === PASS 2: neon glow outlines ===
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.shadowColor = 'rgba(0,200,255,0.9)';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = `rgba(0,185,255,${0.68 * opacity})`;
  ctx.lineWidth = 1.6;
  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [la, lb] = HAND_CONNECTIONS[bi];
    _capsule(ctx, pts[la].x, pts[la].y, pts[lb].x, pts[lb].y, _RSCALE[bi] * scale);
    ctx.stroke();
  }

  ctx.shadowColor = 'rgba(110,30,220,0.75)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = `rgba(100,40,210,${0.50 * opacity})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(pts[palmRing[0]].x, pts[palmRing[0]].y);
  for (let i = 1; i < palmRing.length; i++) ctx.lineTo(pts[palmRing[i]].x, pts[palmRing[i]].y);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();

  // === PASS 3: fingertip halos + joint sparkles ===
  const tipR  = scale * 0.10;
  const jointR = scale * 0.055;

  for (const li of [0, 4, 5, 8, 9, 12, 13, 16, 17, 20]) {
    const p = pts[li];
    const isTip = FINGERTIPS.includes(li);
    const R = isTip ? tipR : jointR;

    if (isTip) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 1.4);
      g.addColorStop(0,    `rgba(90,220,255,${0.50 * opacity})`);
      g.addColorStop(0.55, `rgba(60,130,255,${0.15 * opacity})`);
      g.addColorStop(1,    'rgba(80,50,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const N = isTip ? 8 : 5;
    const shimmer = 1 + Math.sin(time * 0.003 + li * 0.73) * 0.22;
    for (let k = 0; k < N; k++) {
      const ang  = ((li * 41 + k * 17) % 317) / 317 * Math.PI * 2;
      const frac = 0.3 + ((li * 23 + k * 37 + 7) % 70) / 100;
      const cr   = (li * 17 + k * 29) % 12;
      const a    = Math.min(1, 0.70 * opacity * shimmer);
      ctx.fillStyle = cr < 3  ? `rgba(255,215,0,${a})`
                    : cr < 7  ? `rgba(0,210,255,${a})`
                    : cr < 10 ? `rgba(145,50,255,${a})`
                    :            `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(ang) * R * frac, p.y + Math.sin(ang) * R * frac,
              isTip ? 1.8 : 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
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
