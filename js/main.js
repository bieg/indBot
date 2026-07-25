import { initScene, render, getScene, mpToWorld, updateCamera } from './scene.js';
import { initHands, detectHands, setOnGesture, getHandGrowingState, getHandInfo } from './hands.js';
import * as hands from './hands.js';
import { initStarfield, updateStarfield, crushImpulse, rotateImpulse } from './starfield.js';
import { createThread, updateThreads, activeThreads, crushThreads, createPreviewThread, updatePreviewThread, removePreviewThread } from './threads.js';
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

  if (evt.type === 'crush') {
    setGestureHint('crush', 'crush');
    crushThreads(evt.originPoint);
    crushShards(evt.originPoint);
  } else if (evt.type === 'rotate') {
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

  // Live structure preview + index fingertip positions
  const indexTips = [];
  for (const hi of [0, 1]) {
    const info = getHandInfo(hi);
    if (info.present && !info.orienting) {
      indexTips.push(mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y));

      // Show a live preview line between thumb and index when separating
      if (info.ratios[0] > 0.28) {
        const thumb = mpToWorld(info.thumbMp.x, info.thumbMp.y);
        const idx   = mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y);
        if (!previewLines[hi]) previewLines[hi] = createPreviewThread(scene);
        updatePreviewThread(previewLines[hi], thumb, idx);
      } else if (previewLines[hi]) {
        removePreviewThread(previewLines[hi], scene);
        previewLines[hi] = null;
      }
    } else if (previewLines[hi]) {
      removePreviewThread(previewLines[hi], scene);
      previewLines[hi] = null;
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
