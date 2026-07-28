import { HandLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
import { mpToWorld } from './scene.js';

const FINGERS = ['structure', 'energy', 'gravity', 'ghost'];
const TIPS    = [8, 12, 16, 20];

const ARM_THRESHOLDS     = [0.65, 1.5, 1.8, 2.1];
const RELEASE_THRESHOLDS = [0.40, 1.1, 1.4, 1.7];
const FIST_ARM     = 0.50;
const FIST_RELEASE = 0.70;
const FRAMES_REQUIRED = 2;
const COOLDOWN_MS = 400;
const ALPHA = 0.3;
const ROTATE_THRESHOLD = 1.1;   // ~63° of wrist rotation
const ROTATE_WINDOW_MS = 600;
const ROTATE_COOLDOWN_MS = 800;

let handLandmarker = null;
let lastVideoTime = -1;

const handStates = [{}, {}];

let onGesture = null;
export let latestResult = null;

export function setOnGesture(fn) { onGesture = fn; }

export async function initHands() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

function _dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z - b.z) * 0.5;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const ORIENTATION_WINDOW_MS = 2000;

function _initHandState() {
  return {
    smoothed: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
    seenBefore: false,
    entryTime: null,
    fingers: FINGERS.map(() => ({ state: 'idle', frames: 0, lastFire: 0 })),
    fist: { state: 'idle', frames: 0, lastFire: 0 },
    rollHistory: [],
    rotateGesture: { lastFire: 0 },
    strokeVelBuf: [],   // rolling ratio-delta buffer for structure gesture speed
  };
}

export function detectHands(videoEl) {
  if (!handLandmarker || videoEl.currentTime === lastVideoTime) return;
  lastVideoTime = videoEl.currentTime;
  const result = handLandmarker.detectForVideo(videoEl, performance.now());
  latestResult = result;

  for (let hi = 0; hi < 2; hi++) {
    const lms = result.landmarks[hi];
    if (!lms) {
      handStates[hi] = _initHandState();
      continue;
    }
    const hs = handStates[hi] && handStates[hi].seenBefore !== undefined
      ? handStates[hi]
      : _initHandState();
    handStates[hi] = hs;

    const now = performance.now();

    if (!hs.seenBefore) {
      for (let j = 0; j < 21; j++) {
        hs.smoothed[j].x = lms[j].x;
        hs.smoothed[j].y = lms[j].y;
        hs.smoothed[j].z = lms[j].z;
      }
      hs.seenBefore = true;
      hs.entryTime = now;
    } else {
      for (let j = 0; j < 21; j++) {
        hs.smoothed[j].x = hs.smoothed[j].x * (1 - ALPHA) + lms[j].x * ALPHA;
        hs.smoothed[j].y = hs.smoothed[j].y * (1 - ALPHA) + lms[j].y * ALPHA;
        hs.smoothed[j].z = hs.smoothed[j].z * (1 - ALPHA) + lms[j].z * ALPHA;
      }
    }

    // orientation window — show hand, block all gesture events
    if (now - hs.entryTime < ORIENTATION_WINDOW_MS) {
      hs.fingers.forEach(f => { f.state = 'idle'; f.frames = 0; });
      hs.fist.state = 'idle'; hs.fist.frames = 0;
      hs.rollHistory = [];
      continue;
    }

    const sm = hs.smoothed;
    const ref = _dist(sm[0], sm[9]);

    for (let fi = 0; fi < FINGERS.length; fi++) {
      const ratio = _dist(sm[4], sm[TIPS[fi]]) / Math.max(ref, 0.01);

      // Accumulate separation velocity for the structure gesture (thumb-index)
      if (fi === 0) {
        const prev  = hs.fingers[0]._prevRatio ?? ratio;
        const delta = ratio - prev;
        if (delta > 0 && ratio > 0.5) {
          hs.strokeVelBuf.push(delta);
          if (hs.strokeVelBuf.length > 30) hs.strokeVelBuf.shift();
        }
        hs.fingers[0]._prevRatio = ratio;
      }

      _updateFingerState(hs.fingers[fi], ratio, ARM_THRESHOLDS[fi], RELEASE_THRESHOLDS[fi], () => {
        if (!onGesture) return;
        const origin = mpToWorld(sm[4].x, sm[4].y);
        const tip    = mpToWorld(sm[TIPS[fi]].x, sm[TIPS[fi]].y);
        const evt    = { type: FINGERS[fi], handIndex: hi, originPoint: origin, targetPoint: tip };
        if (fi === 0) {
          evt.separationSpeed = hs.strokeVelBuf.length
            ? hs.strokeVelBuf.reduce((a, b) => a + b, 0) / hs.strokeVelBuf.length
            : 0.04;
          hs.strokeVelBuf = [];
        }
        onGesture(evt);
      });
    }

    _updateWristRotation(hs, sm, hi);
  }
}

function _updateWristRotation(hs, sm, hi) {
  const now = performance.now();
  if (now - hs.rotateGesture.lastFire < ROTATE_COOLDOWN_MS) return;

  const roll = Math.atan2(sm[17].y - sm[5].y, sm[17].x - sm[5].x);
  hs.rollHistory.push({ roll, time: now });
  while (hs.rollHistory.length > 0 && now - hs.rollHistory[0].time > ROTATE_WINDOW_MS) {
    hs.rollHistory.shift();
  }
  if (hs.rollHistory.length < 6) return;

  let totalRot = 0;
  for (let i = 1; i < hs.rollHistory.length; i++) {
    let diff = hs.rollHistory[i].roll - hs.rollHistory[i - 1].roll;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    totalRot += diff;
  }

  if (Math.abs(totalRot) > ROTATE_THRESHOLD) {
    hs.rotateGesture.lastFire = now;
    hs.rollHistory = [];
    if (onGesture) {
      const palm = mpToWorld(sm[0].x, sm[0].y);
      onGesture({ type: 'rotate', handIndex: hi, originPoint: palm, targetPoint: palm, direction: Math.sign(totalRot) });
    }
  }
}

function _updateFingerState(st, ratio, armT, releaseT, fire) {
  // Release always takes priority — hand must close before next fire
  if (ratio < releaseT) {
    st.state = 'idle';
    st.frames = 0;
    return;
  }
  // 'armed' persists until hand closes; prevents repeated firing on a held pose
  if (st.state === 'armed') return;

  if (ratio > armT) {
    if (st.state === 'idle') { st.state = 'growing'; st.frames = 0; }
    if (st.state === 'growing') {
      st.frames++;
      if (st.frames >= FRAMES_REQUIRED) {
        st.state = 'armed';
        st.frames = 0;
        fire();
      }
    }
  }
}

function _updateFistState(st, avgRatio, fire) {
  const now = performance.now();
  if (now - st.lastFire < COOLDOWN_MS) { st.state = 'cooldown'; st.frames = 0; return; }
  if (st.state === 'cooldown') { st.state = 'idle'; st.frames = 0; }

  if (avgRatio < FIST_ARM) {
    if (st.state === 'idle') st.state = 'growing';
    if (st.state === 'growing') {
      st.frames++;
      if (st.frames >= FRAMES_REQUIRED) {
        st.state = 'armed';
        st.frames = 0;
        st.lastFire = now;
        fire();
      }
    }
  } else if (avgRatio > FIST_RELEASE) {
    if (st.state !== 'idle') { st.state = 'idle'; st.frames = 0; }
  }
}

export function getHandGrowingState(handIndex) {
  const hs = handStates[handIndex];
  if (!hs || !hs.fingers) return null;
  for (let fi = 0; fi < FINGERS.length; fi++) {
    if (hs.fingers[fi] && hs.fingers[fi].state === 'growing') return FINGERS[fi];
  }
  if (hs.fist && hs.fist.state === 'growing') return 'crush';
  return null;
}

export function getHandInfo(handIndex) {
  const hs = handStates[handIndex];
  const present = !!(hs && hs.seenBefore && latestResult && latestResult.landmarks[handIndex]);
  if (!present) return { present: false };
  const sm = hs.smoothed;
  const ref = Math.max(_dist(sm[0], sm[9]), 0.01);
  const orienting = (performance.now() - hs.entryTime) < ORIENTATION_WINDOW_MS;
  return {
    present: true,
    orienting,
    entryTime: hs.entryTime,
    ratios: TIPS.map(tip => _dist(sm[4], sm[tip]) / ref),
    indexMiddleRatio: _dist(sm[8], sm[12]) / ref,
    armThresholds: ARM_THRESHOLDS,
    releaseThresholds: RELEASE_THRESHOLDS,
    fingerStates: hs.fingers.map(f => f.state),
    thumbMp: { x: sm[4].x, y: sm[4].y },
    tipsMp: TIPS.map(tip => ({ x: sm[tip].x, y: sm[tip].y })),
    palmMp: { x: sm[0].x, y: sm[0].y },
    rawIndexTip: latestResult.landmarks[handIndex]?.[8] ?? { x: sm[8].x, y: sm[8].y },
  };
}
