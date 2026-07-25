import { initScene, render, getScene, mpToWorld, updateCamera } from './scene.js';
import { initHands, detectHands, setOnGesture, getHandGrowingState, getHandInfo } from './hands.js';
import * as hands from './hands.js';
import { initStarfield, updateStarfield, crushImpulse, rotateImpulse } from './starfield.js';
import { createThread, updateThreads, activeThreads, crushThreads, createPreviewThread, updatePreviewThread, removePreviewThread, findClosestEndpoint, getEndpointPos, setEndpointPos, flashWeld, checkAndFlashTriangle } from './threads.js';
// import { initSolly, updateSolly, energizeSolly, setOnSollyTouch } from './solly.js';
import { initAudio, resumeAudio, playGestureSound } from './audio.js';
import { initNebula, updateNebula, crushShards } from './nebula.js';
import { initHud, setGestureHint, updateThreadCount, drawSkeleton } from './hud.js';

const videoEl = document.getElementById('webcam');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const errorMsg = document.getElementById('error-msg');

// Boot scene + stars immediately so the page feels alive before camera starts
initScene();
const scene = getScene();
initStarfield(scene);
initNebula(scene);
initHud();
requestAnimationFrame(_preLoop);

function _preLoop(time) {
  if (!_preLoop.running) return;
  requestAnimationFrame(_preLoop);
  updateStarfield(time, []);
  updateNebula();
  render();
}
_preLoop.running = true;

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startBtn.textContent = 'loading…';
  try {
    await _start();
  } catch (err) {
    console.error(err);
    errorMsg.textContent = `Error: ${err.message}`;
    errorMsg.style.display = 'flex';
    startOverlay.style.display = 'none';
  }
});

async function _start() {
  initAudio();
  resumeAudio();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
  });
  videoEl.srcObject = stream;
  await new Promise(res => { videoEl.onloadedmetadata = res; });
  videoEl.play();

  await initHands();
  setOnGesture(_handleGesture);

  _preLoop.running = false;
  startOverlay.style.display = 'none';
  requestAnimationFrame(_loop);
}

function _handleGesture(evt) {
  playGestureSound(evt.type);

  if (evt.type === 'rotate') {
    setGestureHint('rotate', 'rotate');
    rotateImpulse(evt.originPoint, evt.direction);
  } else {
    // Clear preview before committing permanent thread
    if (previewLines[evt.handIndex]) {
      removePreviewThread(previewLines[evt.handIndex], scene);
      previewLines[evt.handIndex] = null;
    }
    setGestureHint(evt.type, 'confirmed');
    createThread(evt.type, evt.originPoint, evt.targetPoint, scene, evt.separationSpeed ?? null);
  }
}

const previewLines = [null, null];
const grabs = [null, null]; // { thread, which: 'start'|'end', line }

const GRAB_RADIUS = 1.3;
const GRAB_PINCH  = 0.28;
const GRAB_OPEN   = 0.45;
const WELD_RADIUS = 0.65;

function _startGrab(hi, hit, thumbWorld) {
  const { thread, which } = hit;
  thread.mesh.visible = false;
  const fixedPos = getEndpointPos(thread, which === 'start' ? 'end' : 'start');
  const line = createPreviewThread(scene);
  line.material.opacity = 1.0;
  updatePreviewThread(line, fixedPos, thumbWorld);
  grabs[hi] = { thread, which, line };
}

function _updateGrab(hi, thumbWorld) {
  const { thread, which, line } = grabs[hi];
  const fixedPos = getEndpointPos(thread, which === 'start' ? 'end' : 'start');
  updatePreviewThread(line, fixedPos, thumbWorld);
}

function _releaseGrab(hi, thumbWorld) {
  const { thread, which, line } = grabs[hi];
  grabs[hi] = null;
  removePreviewThread(line, scene);
  thread.mesh.visible = true;

  if (!thumbWorld) { thread.rebuildMesh(); return; }

  const snap = findClosestEndpoint(thumbWorld, WELD_RADIUS, thread);
  if (snap) {
    const snapPos = getEndpointPos(snap.thread, snap.which).clone();
    setEndpointPos(thread, which, snapPos);
    thread[which === 'start' ? 'startWelded' : 'endWelded'] = true;
    snap.thread[snap.which === 'start' ? 'startWelded' : 'endWelded'] = true;
    thread.rebuildMesh();
    snap.thread.rebuildMesh();
    flashWeld(snapPos, scene);
    const triangle = checkAndFlashTriangle(scene);
    if (triangle) playGestureSound('gravity');
  } else {
    setEndpointPos(thread, which, thumbWorld);
    thread.rebuildMesh();
  }
}

let lastHint = null;

function _loop(time) {
  requestAnimationFrame(_loop);
  detectHands(videoEl);

  const growing0 = getHandGrowingState(0);
  const growing1 = getHandGrowingState(1);
  const hint = growing0 || growing1 || null;
  if (hint !== lastHint) {
    lastHint = hint;
    if (hint && hint !== 'crush') setGestureHint(hint, 'growing');
  }

  // Grab management + live preview + index fingertip positions
  const indexTips = [];
  for (const hi of [0, 1]) {
    const info = getHandInfo(hi);

    if (!info.present || info.orienting) {
      if (grabs[hi]) _releaseGrab(hi, null);
      if (previewLines[hi]) { removePreviewThread(previewLines[hi], scene); previewLines[hi] = null; }
      continue;
    }

    indexTips.push(mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y));
    const thumbWorld = mpToWorld(info.thumbMp.x, info.thumbMp.y);
    const pinching   = info.ratios[0] < GRAB_PINCH;

    if (grabs[hi]) {
      if (info.ratios[0] > GRAB_OPEN) _releaseGrab(hi, thumbWorld);
      else _updateGrab(hi, thumbWorld);
    } else if (pinching) {
      const hit = findClosestEndpoint(thumbWorld, GRAB_RADIUS);
      if (hit) {
        // Kill any active preview before starting grab
        if (previewLines[hi]) { removePreviewThread(previewLines[hi], scene); previewLines[hi] = null; }
        _startGrab(hi, hit, thumbWorld);
      }
    }

    // Draw preview only when not in grab mode and fingers are separating
    if (!grabs[hi]) {
      if (info.ratios[0] > 0.28) {
        const idx = mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y);
        if (!previewLines[hi]) previewLines[hi] = createPreviewThread(scene);
        updatePreviewThread(previewLines[hi], thumbWorld, idx);
      } else if (previewLines[hi]) {
        removePreviewThread(previewLines[hi], scene);
        previewLines[hi] = null;
      }
    }
  }

  // Camera follows first visible hand — creates 3D parallax feel
  const lms0 = hands.latestResult?.landmarks?.[0];
  if (lms0) updateCamera(lms0[0].x, lms0[0].y);

  updateStarfield(time, activeThreads, indexTips);
  updateNebula(time, indexTips);
  updateThreads(time);
  updateThreadCount(activeThreads.length);

  const handInfos = [getHandInfo(0), getHandInfo(1)];
  drawSkeleton(hands.latestResult, handInfos, time);

  render();
}
