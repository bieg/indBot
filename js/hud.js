const THREAD_COLORS = {
  structure: '#ffffff',
  energy: '#3aa0ff',
  gravity: '#ffcc33',
  ghost: 'rgba(255,255,255,0.4)',
};

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

const TRAIL_DEPTH = 20;   // frames of history
const SCATTER_N   = 30;   // particles per landmark per trail frame

// Per-hand ring buffers: each slot holds an array of 21 landmarks | null
const _trail = [
  Array.from({ length: TRAIL_DEPTH }, () => null),
  Array.from({ length: TRAIL_DEPTH }, () => null),
];
const _trailHead = [0, 0];       // ring buffer write pointer
const _prevLms   = [null, null]; // previous frame landmarks for velocity

// Pre-baked deterministic scatter offsets per landmark
// (angle, normalized radius fraction, base size, base alpha)
const _SCATTER = Array.from({ length: 21 }, (_, li) =>
  Array.from({ length: SCATTER_N }, (_, k) => ({
    ang:   ((li * 41 + k * 17) % 317) / 317 * Math.PI * 2,
    rfrac: 0.18 + ((li * 23 + k * 37 + 7) % 82) / 100,  // 0.18 – 1.00
    sz:    0.45 + ((li * 7  + k * 13 + 3) % 10) / 7,     // 0.45 – 1.88
    al:    0.40 + ((li * 13 + k * 7)      % 42) / 100,   // 0.40 – 0.82
  }))
);

// Cloud radius per landmark (fraction of hand scale = wrist–MCP9 distance)
const _LM_R = [
  0.13,                           // 0  wrist
  0.07, 0.07, 0.06, 0.10,         // 1-4  thumb
  0.08, 0.07, 0.06, 0.10,         // 5-8  index
  0.08, 0.07, 0.06, 0.10,         // 9-12 middle
  0.08, 0.07, 0.06, 0.10,         // 13-16 ring
  0.07, 0.06, 0.05, 0.09,         // 17-20 pinky
];

const FINGERTIPS = [4, 8, 12, 16, 20];

// Membrane blob radius per landmark (fraction of hand scale).
// Blobs are large enough so adjacent landmarks overlap → continuous film/vlies.
const _MEMBRANE_R = [
  0.30,                               // 0  wrist
  0.14, 0.13, 0.12, 0.11,            // 1-4  thumb
  0.15, 0.13, 0.12, 0.12,            // 5-8  index
  0.15, 0.13, 0.12, 0.12,            // 9-12 middle
  0.15, 0.13, 0.12, 0.12,            // 13-16 ring
  0.13, 0.11, 0.10, 0.10,            // 17-20 pinky
];

// Soft overlapping blobs at each landmark of the current frame.
// Creates a subtle translucent skin (vlies) that fills gaps between particles.
function _renderMembrane(ctx, landmarks, scale, masterOpacity) {
  const w = skeletonCanvas.width, h = skeletonCanvas.height;
  for (let li = 0; li < 21; li++) {
    const lm = landmarks[li];
    const cx = (1 - lm.x) * w;   // mirror-corrected
    const cy = lm.y * h;
    const r  = _MEMBRANE_R[li] * scale;
    const bA = 0.058 * masterOpacity;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0,    `rgba(220,235,255,${bA})`);
    g.addColorStop(0.6,  `rgba(200,225,255,${bA * 0.45})`);
    g.addColorStop(1,    'rgba(180,215,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
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

  // Membrane / vlies — soft skin layer under the particles
  _renderMembrane(ctx, newest, scale, masterOpacity);

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

  const velSpread = 1 + velFactor * 2.2;   // 1× still → 3.2× fast
  const N = frames.length;

  // Render oldest → newest so newest sits on top
  for (let fi = N - 1; fi >= 0; fi--) {
    const lms = frames[fi];
    // trailT: 0 = oldest, 1 = newest
    const trailT = 1 - fi / Math.max(N - 1, 1);
    // Quadratic fade: old frames very faint, newest frame full
    const frameAlpha = trailT * trailT * masterOpacity;

    for (let li = 0; li < 21; li++) {
      const lm  = lms[li];
      const cx  = (1 - lm.x) * w;   // mirror-corrected: matches CSS scaleX(-1) on webcam
      const cy  = lm.y * h;
      const baseR = _LM_R[li] * scale * velSpread;
      const shimmer = 1 + Math.sin(time * 0.0022 + li * 0.47 + fi * 0.31) * 0.14;

      for (const off of _SCATTER[li]) {
        const r  = baseR * off.rfrac;
        const px = cx + Math.cos(off.ang) * r;
        const py = cy + Math.sin(off.ang) * r;
        const a  = Math.min(1, off.al * frameAlpha * shimmer);
        if (a < 0.01) continue;

        // Color temperature: slightly warm at fingertips on recent frames,
        // cool blue-white elsewhere — all very close to white.
        const isTip = FINGERTIPS.includes(li);
        let color;
        if (isTip && trailT > 0.6) {
          // bright warm white at fingertip newest frames
          color = `rgba(255,248,230,${a})`;
        } else if (trailT > 0.75) {
          // brightest newest particles: pure white
          color = `rgba(255,255,255,${a})`;
        } else {
          // trail fades to cool pale blue-white
          color = `rgba(200,225,255,${a})`;
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, off.sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Soft fingertip halo on the current (newest) frame only
  for (const li of FINGERTIPS) {
    const lm = newest[li];
    const cx = (1 - lm.x) * w;   // mirror-corrected
    const cy = lm.y * h;
    const r  = _LM_R[li] * scale * 2.2;
    const g  = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0,   `rgba(210,240,255,${0.22 * masterOpacity})`);
    g.addColorStop(0.5, `rgba(160,210,255,${0.07 * masterOpacity})`);
    g.addColorStop(1,   'rgba(120,180,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
