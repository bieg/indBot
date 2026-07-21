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

const _BONE_PARTS = HAND_CONNECTIONS.map(([a, b], bi) => {
  const N = 90;
  return Array.from({ length: N }, (_, p) => {
    const t   = ((bi * 37 + p * 13 + 3) % 97) / 97;
    const ang = ((bi * 41 + p * 71 + 13) % 317) / 317 * Math.PI * 2;
    const r   = ((bi * 31 + p * 19 + 11) % 97) / 97 * 5;
    return {
      t,
      dx: Math.cos(ang) * r,
      dy: Math.sin(ang) * r,
      sz: 0.4 + ((bi * 7 + p * 11) % 14) / 8,
      al: 0.50 + ((bi * 3 + p * 7) % 38) / 100,
    };
  });
});

const _JOINT_PARTS = Array.from({ length: 21 }, (_, li) => {
  const ft = FINGERTIPS.includes(li);
  const N  = ft ? 24 : 10;
  const R  = ft ?  7 :  3;
  return Array.from({ length: N }, (_, p) => {
    const ang  = ((li * 41 + p * 17) % 317) / 317 * Math.PI * 2;
    const frac = ((li * 23 + p * 37 + 7) % 97) / 97;
    const dist = R * frac;
    return {
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist,
      sz: ft ? 0.6 + ((li * 7 + p * 13) % 12) / 8
             : 0.4 + ((li * 7 + p * 13) % 8)  / 8,
      al: ft ? 0.60 + ((li * 3 + p * 7) % 32) / 100
             : 0.45 + ((li * 3 + p * 7) % 30) / 100,
    };
  });
});

function _drawHand(ctx, landmarks, w, h, opacity = 1) {
  const X = lm => (1 - lm.x) * w;
  const Y = lm => lm.y * h;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${0.18 * opacity})`;
  ctx.lineWidth = 0.6;
  ctx.lineCap = 'round';
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(X(landmarks[a]), Y(landmarks[a]));
    ctx.lineTo(X(landmarks[b]), Y(landmarks[b]));
    ctx.stroke();
  }
  ctx.restore();

  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [a, b] = HAND_CONNECTIONS[bi];
    const ax = X(landmarks[a]), ay = Y(landmarks[a]);
    const bx = X(landmarks[b]), by = Y(landmarks[b]);
    const edx = bx - ax, edy = by - ay;
    const len = Math.sqrt(edx * edx + edy * edy) || 1;
    const nx = -edy / len, ny = edx / len;
    for (const p of _BONE_PARTS[bi]) {
      ctx.fillStyle = `rgba(255,252,240,${p.al * opacity})`;
      ctx.beginPath();
      ctx.arc(
        ax + edx * p.t + nx * p.dx + (edx / len) * p.dy,
        ay + edy * p.t + ny * p.dx + (edy / len) * p.dy,
        p.sz, 0, Math.PI * 2,
      );
      ctx.fill();
    }
  }

  for (let li = 0; li < 21; li++) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    for (const p of _JOINT_PARTS[li]) {
      ctx.fillStyle = `rgba(255,255,245,${p.al * opacity})`;
      ctx.beginPath();
      ctx.arc(cx + p.dx, cy + p.dy, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const li of FINGERTIPS) {
    const cx = X(landmarks[li]), cy = Y(landmarks[li]);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    g.addColorStop(0,   `rgba(255,255,230,${0.45 * opacity})`);
    g.addColorStop(0.5, `rgba(255,245,180,${0.12 * opacity})`);
    g.addColorStop(1,   'rgba(255,220,100,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
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
