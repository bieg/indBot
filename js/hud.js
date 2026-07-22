const THREAD_COLORS = {
  structure: '#ffffff',
  energy: '#3aa0ff',
  gravity: '#ffcc33',
  ghost: 'rgba(255,255,255,0.4)',
};

// 20 finger-bone segments + 3 knuckle-row connectors + 1 thumb-index web
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
  [2,5],  // bi=23: thumb MCP → index MCP — closes the hand contour
];

const ORIENTATION_MS = 1000;
const FADE_DURATION  = 400;
const OPACITY_HOLD   = 1.0;
const OPACITY_END    = 0.95;

let gestureEl     = null;
let threadCountEl = null;
let hand0dot      = null;
let hand1dot      = null;
let skeletonCanvas = null;
let skeletonCtx   = null;
let flashTimeout  = null;
let lastCount     = -1;

const handFirstSeen = [null, null];

export function initHud() {
  gestureEl     = document.getElementById('gesture-indicator');
  threadCountEl = document.getElementById('thread-count');
  skeletonCanvas = document.getElementById('skeleton-canvas');
  skeletonCtx   = skeletonCanvas.getContext('2d');

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
  skeletonCanvas.width  = window.innerWidth;
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
    flashTimeout = setTimeout(() => { if (gestureEl) gestureEl.style.opacity = '0'; }, 600);
  } else if (state === 'crush') {
    gestureEl.style.color = '#ff6633';
    gestureEl.textContent = '✦ CRUSH';
    gestureEl.style.opacity = '1';
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => { if (gestureEl) gestureEl.style.opacity = '0'; }, 400);
  } else if (state === 'rotate') {
    gestureEl.style.color = '#cc88ff';
    gestureEl.textContent = '↻ ROTATE';
    gestureEl.style.opacity = '1';
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => { if (gestureEl) gestureEl.style.opacity = '0'; }, 500);
  } else {
    gestureEl.style.opacity = '0';
  }
}

export function updateThreadCount(count) {
  if (!threadCountEl || count === lastCount) return;
  lastCount = count;
  threadCountEl.textContent = `Threads: ${count}`;
}

// ─── Motion-Trail Point Cloud ─────────────────────────────────────────────────
// Maintains a ring buffer of past landmark frames per hand.
// Each frame's 21 landmarks emit a scatter cloud of particles.
// Oldest frames are nearly transparent → newest are bright.
// Result: moving hand leaves organic particle trails, still hand = tight cloud.

const TRAIL_DEPTH = 14;   // frames of history
const SCATTER_N   = 30;   // particles per landmark per trail frame

// Per-hand ring buffers: each slot holds an array of 21 landmarks | null
const _trail = [
  Array.from({ length: TRAIL_DEPTH }, () => null),
  Array.from({ length: TRAIL_DEPTH }, () => null),
];
const _trailHead = [0, 0];       // ring buffer write pointer
const _prevLms   = [null, null]; // previous frame landmarks for velocity

// Pre-baked deterministic scatter offsets per landmark (30 particles)
const _SCATTER = Array.from({ length: 21 }, (_, li) =>
  Array.from({ length: SCATTER_N }, (_, k) => ({
    ang:   ((li * 41 + k * 17) % 317) / 317 * Math.PI * 2,
    rfrac: 0.44 + ((li * 23 + k * 37 + 7) % 50) / 100,  // min 0.44 — always outside skeleton line
    sz:    0.45 + ((li * 7  + k * 13 + 3) % 10) / 7,
    al:    0.40 + ((li * 13 + k * 7)      % 42) / 100,
  }))
);

// Pre-baked scatter for bone midpoints — 24 bones × 2 t-values = 48 sample positions
// Fewer particles per point (12), slightly smaller spread, fills the gaps between joints.
const BONE_SCATTER_N = 12;
const _BONE_SCATTER = Array.from({ length: 24 * 2 }, (_, bi) =>
  Array.from({ length: BONE_SCATTER_N }, (_, k) => ({
    ang:   ((bi * 53 + k * 23 + 11) % 317) / 317 * Math.PI * 2,
    rfrac: 0.42 + ((bi * 31 + k * 41 + 7) % 48) / 100,  // 0.42 – 0.90 — outside skeleton
    sz:    0.38 + ((bi * 11 + k * 17 + 3) % 9)  / 8,     // 0.38 – 1.50
    al:    0.32 + ((bi * 17 + k * 11)      % 38) / 100,   // 0.32 – 0.70
  }))
);

// Cloud radius per landmark — larger so the particle ring floats visibly
// outside the hairline skeleton outline.
const _LM_R = [
  0.22,                           // 0  wrist
  0.14, 0.13, 0.11, 0.17,         // 1-4  thumb
  0.16, 0.13, 0.11, 0.17,         // 5-8  index
  0.16, 0.13, 0.11, 0.17,         // 9-12 middle
  0.15, 0.12, 0.11, 0.16,         // 13-16 ring
  0.13, 0.11, 0.09, 0.15,         // 17-20 pinky
];

const FINGERTIPS = [4, 8, 12, 16, 20];

// Bone diameter as fraction of hand scale — drives the dark skin + neon glow width
const BONE_WIDTHS = [
  0.19, 0.17, 0.14, 0.12,  // thumb
  0.20, 0.18, 0.15, 0.12,  // index
  0.21, 0.19, 0.15, 0.13,  // middle
  0.20, 0.18, 0.15, 0.12,  // ring
  0.17, 0.14, 0.12, 0.09,  // pinky
  0.19, 0.19, 0.19,          // knuckle row
];

// Pinch flash state per hand (decays each frame)
const _pinchFlash = [0, 0];

// Solid hand silhouette — variable-width strokes so palm and knuckle row
// fill in as a continuous mass while finger shafts stay distinct.
//
// HAND_CONNECTIONS layout (by index bi):
//   0-3   thumb shaft
//   4-7   index shaft  (bi 4 = wrist→index MCP)
//   8-11  middle shaft (bi 8 = wrist→middle MCP)
//  12-15  ring shaft   (bi 12 = wrist→ring MCP)
//  16-19  pinky shaft  (bi 16 = wrist→pinky MCP)
//  20-22  knuckle row [5,9],[9,13],[13,17]
//
// Three width zones:
//   Knuckle row (20-22, 23): 0.50× scale — bridges gaps between finger bases + thumb-index web
//   Palm roots  (0,4,8,12,16): 0.40× — fills lower palm between wrist and MCPs
//   Finger shafts (rest): 0.30× — tubular, fingers stay legible
const _MEM_KNUCKLE = new Set([20, 21, 22, 23]);
const _MEM_PALMROOT = new Set([0, 4, 8, 12, 16]);

function _renderMembrane(ctx, landmarks, scale, masterOpacity) {
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  ctx.save();
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = `rgba(8,3,30,${0.48 * masterOpacity})`;

  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    const [a, b] = HAND_CONNECTIONS[bi];
    ctx.lineWidth = scale * (
      _MEM_KNUCKLE.has(bi)  ? 0.50 :
      _MEM_PALMROOT.has(bi) ? 0.40 : 0.30
    );
    ctx.beginPath();
    ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
    ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
    ctx.stroke();
  }
  ctx.restore();
}

// Thin hairline neon outline — outer boundary + knuckles + finger shafts.
// Middle/ring/index wrist spokes (bi 4,8,12) stay hidden: the outer boundary
// (thumb side bi=0, pinky side bi=16, web bi=23) closes the contour instead.
const _SKIN_SKIP = new Set([4, 8, 12]);

function _renderSkin(ctx, landmarks, scale, masterOpacity) {
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  ctx.save();
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowColor = 'rgba(0,195,245,0.50)';
  ctx.shadowBlur  = 24;
  ctx.strokeStyle = `rgba(0,175,230,${0.12 * masterOpacity})`;
  ctx.lineWidth   = Math.max(1, scale * 0.016);

  for (let bi = 0; bi < HAND_CONNECTIONS.length; bi++) {
    if (_SKIN_SKIP.has(bi)) continue;   // skip palm spokes
    const [a, b] = HAND_CONNECTIONS[bi];
    ctx.beginPath();
    ctx.moveTo((1 - landmarks[a].x) * w, landmarks[a].y * h);
    ctx.lineTo((1 - landmarks[b].x) * w, landmarks[b].y * h);
    ctx.stroke();
  }
  ctx.restore();
}

// Arcane joint accent dots — bright node at each joint, gold at fingertips
function _renderJoints(ctx, landmarks, scale, masterOpacity, time = 0) {
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  ctx.save();
  for (let li = 0; li < 21; li++) {
    const lm  = landmarks[li];
    const cx  = (1 - lm.x) * w;
    const cy  = lm.y * h;
    const tip = FINGERTIPS.includes(li);
    const r   = (tip ? 0.055 : 0.032) * scale;

    if (tip) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.003 + li * 1.31);

      // Pulsing outer ring
      const ringR = r * (1.9 + pulse * 0.9);
      ctx.shadowColor = 'rgba(255,200,60,0.35)';
      ctx.shadowBlur  = 10;
      ctx.strokeStyle = `rgba(255,220,90,${(0.20 + pulse * 0.22) * masterOpacity})`;
      ctx.lineWidth   = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      // Outer glow dot
      ctx.shadowColor = 'rgba(255,200,60,0.75)';
      ctx.shadowBlur  = 20;
      ctx.fillStyle   = `rgba(255,215,80,${0.60 * masterOpacity})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Bright white-gold core
      ctx.shadowColor = 'rgba(255,255,200,1.0)';
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = `rgba(255,248,200,${(0.80 + pulse * 0.15) * masterOpacity})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = 'rgba(0,200,255,0.5)';
      ctx.shadowBlur  = 14;
      ctx.fillStyle   = `rgba(0,210,255,${0.30 * masterOpacity})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Thumb (lm4) ↔ index-tip (lm8) pinch proximity arc + burst
function _renderPinch(ctx, landmarks, scale, masterOpacity, hi, time) {
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  const tx = (1 - landmarks[4].x) * w, ty = landmarks[4].y * h;
  const ix = (1 - landmarks[8].x) * w, iy = landmarks[8].y * h;
  const dist = Math.hypot(tx - ix, ty - iy);
  const ratio = dist / scale;

  // Decay existing flash
  _pinchFlash[hi] *= 0.88;

  if (ratio < 0.30) {
    const strength = Math.max(0, 1 - ratio / 0.30);

    // Trigger new flash burst on close pinch
    if (ratio < 0.10 && _pinchFlash[hi] < 0.3) _pinchFlash[hi] = 1.0;

    // Energy arc between thumb tip and index tip
    const mx = (tx + ix) * 0.5 + (iy - ty) * 0.15;
    const my = (ty + iy) * 0.5 + (tx - ix) * 0.15;
    ctx.save();
    ctx.shadowColor = 'rgba(255,200,40,0.95)';
    ctx.shadowBlur  = 14;
    ctx.strokeStyle = `rgba(255,215,80,${strength * 0.85 * masterOpacity})`;
    ctx.lineWidth   = 1.4 + strength * 1.8;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx, my, ix, iy);
    ctx.stroke();
    ctx.restore();

    // Burst particles radiating from midpoint on pinch contact
    if (_pinchFlash[hi] > 0.05) {
      const bmx = (tx + ix) * 0.5, bmy = (ty + iy) * 0.5;
      const pf  = _pinchFlash[hi];
      ctx.save();
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2 + time * 0.003;
        const rad = scale * 0.15 * pf;
        const px  = bmx + Math.cos(ang) * rad;
        const py  = bmy + Math.sin(ang) * rad;
        const a   = pf * 0.75 * masterOpacity;
        ctx.fillStyle = k % 3 === 0
          ? `rgba(255,255,200,${a})`
          : `rgba(255,185,40,${a})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + pf * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function _renderTrail(ctx, hi, masterOpacity, time) {
  const ring = _trail[hi];
  const head = _trailHead[hi];

  // Collect non-null frames in age order: index 0 = newest, index N-1 = oldest
  const frames = [];
  for (let d = 0; d < TRAIL_DEPTH; d++) {
    const idx = (head - 1 - d + TRAIL_DEPTH) % TRAIL_DEPTH;
    if (ring[idx] !== null) frames.push(ring[idx]);
  }
  if (frames.length === 0) return;

  const newest = frames[0];
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  // Scale: wrist–MCP9 distance. X differences cancel the mirror, so no flip needed here.
  const scale  = Math.hypot(
    (newest[9].x - newest[0].x) * w,
    (newest[9].y - newest[0].y) * h
  ) || 80;

  // Layer 1 — opaque membrane silhouette (30% transparent dark blob)
  _renderMembrane(ctx, newest, scale, masterOpacity);
  // Layer 2 — neon outline + purple tint on top of membrane
  _renderSkin(ctx, newest, scale, masterOpacity);

  // Velocity: compare newest frame to frame behind it
  let velFactor = 0;
  if (frames.length >= 2) {
    const prev = frames[1];
    let sumD = 0;
    const keyLms = [0, 4, 8, 12, 16, 20];
    for (const li of keyLms) {
      const dx = (newest[li].x - prev[li].x) * skeletonCanvas.width;
      const dy = (newest[li].y - prev[li].y) * skeletonCanvas.height;
      sumD += Math.sqrt(dx * dx + dy * dy);
    }
    velFactor = Math.min(sumD / keyLms.length / 12, 1); // 12px/frame = max
  }

  const velSpread = 1 + velFactor * 1.8;   // 1× still → 2.8× fast
  const N = frames.length;

  // Helper: emit a particle cloud at (cx, cy) using pre-baked offsets
  function _emitCloud(cx, cy, baseR, offsets, frameAlpha, shimmer, warm) {
    for (const off of offsets) {
      const a = Math.min(1, off.al * frameAlpha * shimmer);
      if (a < 0.012) continue;
      const px = cx + Math.cos(off.ang) * baseR * off.rfrac;
      const py = cy + Math.sin(off.ang) * baseR * off.rfrac;
      ctx.fillStyle = warm
        ? `rgba(255,200,60,${a})`      // gold at fingertips
        : frameAlpha > 0.65
          ? `rgba(180,240,255,${a})`   // cyan-white (newest frames)
          : frameAlpha > 0.35
            ? `rgba(0,190,220,${a})`   // teal (mid trail)
            : `rgba(80,30,170,${a})`;  // deep purple (oldest trail)
      ctx.beginPath();
      ctx.arc(px, py, off.sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Render oldest → newest so newest sits on top
  for (let fi = N - 1; fi >= 0; fi--) {
    const lms    = frames[fi];
    const trailT = 1 - fi / Math.max(N - 1, 1);
    const frameAlpha = trailT * masterOpacity * 0.55;

    // --- Joint landmark clouds (21 points) ---
    for (let li = 0; li < 21; li++) {
      const lm    = lms[li];
      const cx    = (1 - lm.x) * w;
      const cy    = lm.y * h;
      const baseR = _LM_R[li] * scale * velSpread;
      const shimmer = 1 + Math.sin(time * 0.0022 + li * 0.47 + fi * 0.31) * 0.14;
      const warm  = FINGERTIPS.includes(li) && trailT > 0.55;
      _emitCloud(cx, cy, baseR, _SCATTER[li], frameAlpha, shimmer, warm);
    }

    // --- Bone segment fill — 2 interpolated points per bone ---
    let bsi = 0;
    for (const [a, b] of HAND_CONNECTIONS) {
      for (const t of [0.33, 0.67]) {
        const lmA = lms[a], lmB = lms[b];
        const cx    = ((1 - lmA.x) * (1 - t) + (1 - lmB.x) * t) * w;
        const cy    = (lmA.y * (1 - t) + lmB.y * t) * h;
        const baseR = (_LM_R[a] * (1 - t) + _LM_R[b] * t) * scale * velSpread * 0.88;
        const shimmer = 1 + Math.sin(time * 0.0022 + bsi * 0.53 + fi * 0.28) * 0.11;
        _emitCloud(cx, cy, baseR, _BONE_SCATTER[bsi], frameAlpha, shimmer, false);
        bsi++;
      }
    }
  }

  // Layered gold fingertip halo on the current (newest) frame only
  for (const li of FINGERTIPS) {
    const lm    = newest[li];
    const cx    = (1 - lm.x) * w;
    const cy    = lm.y * h;
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.003 + li * 1.31);

    // Inner tight bloom
    const r1 = _LM_R[li] * scale * 1.1;
    const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
    g1.addColorStop(0,   `rgba(255,245,180,${(0.38 + pulse * 0.12) * masterOpacity})`);
    g1.addColorStop(0.5, `rgba(255,200,60,${0.18 * masterOpacity})`);
    g1.addColorStop(1,   'rgba(255,140,20,0)');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.fill();

    // Outer pulsing ambient halo
    const r2 = _LM_R[li] * scale * (2.6 + pulse * 1.0);
    const g2 = ctx.createRadialGradient(cx, cy, r1 * 0.4, cx, cy, r2);
    g2.addColorStop(0,   `rgba(255,180,40,${(0.10 + pulse * 0.07) * masterOpacity})`);
    g2.addColorStop(0.6, `rgba(255,100,20,${0.03 * masterOpacity})`);
    g2.addColorStop(1,   'rgba(180,40,0,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arcane joint dots + pinch arc on top of everything
  _renderJoints(ctx, newest, scale, masterOpacity, time);
  _renderPinch(ctx, newest, scale, masterOpacity, hi, time);
}

export function drawSkeleton(handsResults, handInfos, time = 0) {
  if (!skeletonCtx) return;
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skeletonCtx.clearRect(0, 0, w, h);

  const now = performance.now();

  for (let hi = 0; hi < 2; hi++) {
    const dot       = hi === 0 ? hand0dot : hand1dot;
    const landmarks = handsResults?.landmarks?.[hi] ?? null;
    const info      = handInfos?.[hi] ?? null;

    if (!landmarks) {
      // Clear history when hand disappears
      _trail[hi].fill(null);
      handFirstSeen[hi] = null;
      if (dot) {
        dot.style.background = 'rgba(255,255,255,0.15)';
        dot.style.boxShadow  = 'none';
      }
      continue;
    }

    // Update HUD dot
    if (dot) {
      const orienting = info?.orienting;
      if (orienting) {
        dot.style.background = 'rgba(255,255,255,0.9)';
        dot.style.boxShadow  = '0 0 8px 3px rgba(255,255,255,0.5)';
      } else {
        dot.style.background = '#ffcc33';
        dot.style.boxShadow  = '0 0 6px 2px rgba(255,204,51,0.6)';
      }
    }

    // Push current landmarks into ring buffer
    const head = _trailHead[hi];
    _trail[hi][head] = landmarks;
    _trailHead[hi]   = (head + 1) % TRAIL_DEPTH;

    // Opacity fade-in
    if (handFirstSeen[hi] === null) handFirstSeen[hi] = now;
    const elapsed = now - handFirstSeen[hi];
    let opacity;
    if (elapsed < ORIENTATION_MS) {
      opacity = OPACITY_HOLD * Math.min(elapsed / 300, 1);
    } else {
      const t = Math.min((elapsed - ORIENTATION_MS) / FADE_DURATION, 1);
      opacity = OPACITY_HOLD + (OPACITY_END - OPACITY_HOLD) * t;
    }

    _renderTrail(skeletonCtx, hi, opacity, time);

    // Gesture progress arcs (thumb tracker)
    if (info?.present) {
      const FINGERS = ['structure', 'energy', 'gravity', 'ghost'];
      for (let fi = 0; fi < 4; fi++) {
        if (info.fingerStates[fi] !== 'growing') continue;
        const ratio    = info.ratios[fi];
        const armT     = info.armThresholds[fi];
        const relT     = info.releaseThresholds[fi];
        const progress = Math.max(0, Math.min(1, (ratio - relT) / (armT - relT)));
        if (progress <= 0) continue;

        const tx    = (1 - info.thumbMp.x) * w;
        const ty    = info.thumbMp.y * h;
        const color = THREAD_COLORS[FINGERS[fi]];

        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, 0, Math.PI * 2);
        skeletonCtx.strokeStyle = 'rgba(255,255,255,0.12)';
        skeletonCtx.lineWidth   = 2;
        skeletonCtx.stroke();

        skeletonCtx.beginPath();
        skeletonCtx.arc(tx, ty, 14, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        skeletonCtx.strokeStyle = color;
        skeletonCtx.lineWidth   = 2.5;
        skeletonCtx.stroke();
      }
    }
  }
}
