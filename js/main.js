import { initScene, render, getScene, mpToWorld } from './scene.js';
import { initHands, detectHands, setOnGesture, getHandGrowingState, getHandInfo } from './hands.js';
import * as hands from './hands.js';
import { initStarfield, updateStarfield, crushImpulse, rotateImpulse, darkMoodBurst, lightMoodDrift } from './starfield.js';
import { createThread, updateThreads, activeThreads, crushThreads } from './threads.js';
import { initSolly, updateSolly, energizeSolly, setOnSollyTouch } from './solly.js';
import { initAudio, resumeAudio, playGestureSound } from './audio.js';
import { initHud, setGestureHint, updateThreadCount, drawSkeleton } from './hud.js';
import { initSpeech, setOnMood } from './speech.js';
import { initMood, triggerDark, triggerLight, updateMood, setMicActive } from './mood.js';

const videoEl = document.getElementById('webcam');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const errorMsg = document.getElementById('error-msg');

// Boot scene + stars immediately so the page feels alive before camera starts
initScene();
const scene = getScene();
initStarfield(scene);
initSolly(scene);
initHud();
initMood();
setOnSollyTouch(() => playGestureSound('solly-touch'));
requestAnimationFrame(_preLoop);

function _preLoop(time) {
  if (!_preLoop.running) return;
  requestAnimationFrame(_preLoop);
  updateStarfield(time, []);
  updateSolly(time, [], [], []);
  updateMood();
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

  setOnMood(_handleMood);
  const micOn = initSpeech();
  setMicActive(micOn);

  _preLoop.running = false;
  startOverlay.style.display = 'none';
  requestAnimationFrame(_loop);
}

function _handleGesture(evt) {
  playGestureSound(evt.type);

  if (evt.type === 'crush') {
    setGestureHint('crush', 'crush');
    crushThreads(evt.originPoint);
    crushImpulse(evt.originPoint);
    energizeSolly(1.5);
  } else if (evt.type === 'rotate') {
    setGestureHint('rotate', 'rotate');
    rotateImpulse(evt.originPoint, evt.direction);
  } else {
    setGestureHint(evt.type, 'confirmed');
    createThread(evt.type, evt.originPoint, evt.targetPoint, scene);
  }
}

function _handleMood({ mood, word }) {
  if (mood === 'dark') {
    triggerDark(word);
    darkMoodBurst();
    energizeSolly(2.0);
    playGestureSound('crush');
  } else {
    triggerLight(word);
    lightMoodDrift();
    energizeSolly(0.8);
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

  // collect finger tip + palm positions for Solly proximity and attraction
  const fingerPositions = [];
  const palmPositions   = [];
  for (const hi of [0, 1]) {
    const info = getHandInfo(hi);
    if (info.present && !info.orienting) {
      fingerPositions.push(mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y));
      if (info.palmMp) palmPositions.push(mpToWorld(info.palmMp.x, info.palmMp.y));
    }
  }

  updateStarfield(time, activeThreads);
  updateThreads(time);
  updateSolly(time, activeThreads, fingerPositions, palmPositions);
  updateMood();
  updateThreadCount(activeThreads.length);

  const handInfos = [getHandInfo(0), getHandInfo(1)];
  drawSkeleton(hands.latestResult, handInfos);

  render();
}
