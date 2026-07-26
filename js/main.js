import * as THREE from 'three';
import { initScene, render, getScene, getCamera, mpToWorld, updateCamera, BLOOM_LAYER } from './scene.js';
import { initHands, detectHands, setOnGesture, getHandGrowingState, getHandInfo } from './hands.js';
import * as hands from './hands.js';
import { initStarfield, updateStarfield, crushImpulse, rotateImpulse } from './starfield.js';
import { createThread, updateThreads, activeThreads, crushThreads, createPreviewThread, updatePreviewThread, removePreviewThread, findClosestEndpoint, getEndpointPos, setEndpointPos, flashWeld, checkAndFlashTriangle } from './threads.js';
// import { initSolly, updateSolly, energizeSolly, setOnSollyTouch } from './solly.js';
import { initAudio, resumeAudio, playGestureSound } from './audio.js';
import { initNebula, updateNebula, crushShards, panels, explodePanel, tapPanel } from './nebula.js';
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
const panelGrabs = [null, null]; // solid panel being dragged
const panelGrabReleaseFrames = [0, 0]; // debounce release
const marbles = [];
const marbleCharges = [null, null]; // { mesh, buf: Vector3[] }

const GRAB_RADIUS = 1.3;
const GRAB_PINCH  = 0.28;
const GRAB_OPEN   = 0.45;
const WELD_RADIUS = 0.65;
const IM_GRAB          = 0.35;  // index+middle together → panel drag start
const IM_OPEN          = 0.55;  // index+middle apart   → panel drag release
const IM_RELEASE_FRAMES = 8;    // consecutive frames needed to confirm release

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

function _mkMarble() {
  const geo = new THREE.SphereGeometry(0.11, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.layers.enable(BLOOM_LAYER);
  scene.add(mesh);
  return { geo, mat, mesh };
}

function _fireMarble(pos, vel) {
  const m = _mkMarble();
  m.mesh.position.copy(pos);
  marbles.push({ ...m, vel, born: performance.now() });
}

function _updateMarbles() {
  for (let i = marbles.length - 1; i >= 0; i--) {
    const m = marbles[i];
    if (performance.now() - m.born > 5000) {
      scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose();
      marbles.splice(i, 1); continue;
    }
    m.mesh.position.x += m.vel.x;
    m.mesh.position.y += m.vel.y;
    m.mesh.position.z += m.vel.z;
    for (let p = panels.length - 1; p >= 0; p--) {
      if (m.mesh.position.distanceTo(panels[p].position) < 2.8) {
        explodePanel(panels[p], scene);
        playGestureSound('energy');
        scene.remove(m.mesh); m.geo.dispose(); m.mat.dispose();
        marbles.splice(i, 1);
        break;
      }
    }
  }
}

// ── Screen-space panel tap ─────────────────────────────────────────────────────
// Project each panel's world centre to NDC and compare to fingertip NDC.
// Robust regardless of panel rotation (raycasting fails on edge-on panels).
const _prevRayHit = new Set();
const _projV = new THREE.Vector3();
const _dragRay = new THREE.Raycaster();
const TAP_NDC_RADIUS = 0.42; // large enough to cover panel edges, not just centre

function _updatePanelTaps(handInfos) {
  const camera = getCamera();
  const nowHit = new Set();

  for (let i = 0; i < handInfos.length; i++) {
    const info = handInfos[i];
    if (!info.present || info.orienting) continue;
    if (panelGrabs[i] !== null) continue; // actively dragging — skip tap
    // Use raw (unsmoothed) landmark for tap — no lag
    const ndcX = (1 - info.rawIndexTip.x) * 2 - 1;
    const ndcY = -(info.rawIndexTip.y * 2 - 1);

    for (const g of panels) {
      _projV.copy(g.position).project(camera);
      const dx = _projV.x - ndcX;
      const dy = _projV.y - ndcY;
      if (dx * dx + dy * dy < TAP_NDC_RADIUS * TAP_NDC_RADIUS) {
        nowHit.add(g);
        if (!_prevRayHit.has(g)) tapPanel(g);
      }
    }
  }

  _prevRayHit.clear();
  nowHit.forEach(p => _prevRayHit.add(p));
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
      if (panelGrabs[hi]) { panelGrabs[hi] = null; panelGrabReleaseFrames[hi] = 0; }
      if (previewLines[hi]) { removePreviewThread(previewLines[hi], scene); previewLines[hi] = null; }
      continue;
    }

    indexTips.push(mpToWorld(info.tipsMp[0].x, info.tipsMp[0].y));
    const thumbWorld = mpToWorld(info.thumbMp.x, info.thumbMp.y);
    const pinching   = info.ratios[0] < GRAB_PINCH;
    // Index+middle midpoint — used for panel drag
    const imMidX = (info.tipsMp[0].x + info.tipsMp[1].x) * 0.5;
    const imMidY = (info.tipsMp[0].y + info.tipsMp[1].y) * 0.5;
    const imMidWorld = mpToWorld(imMidX, imMidY);
    const imClose = info.indexMiddleRatio < IM_GRAB;
    // Thumb-index midpoint — used for marble charge
    const midX = (info.thumbMp.x + info.tipsMp[0].x) * 0.5;
    const midY = (info.thumbMp.y + info.tipsMp[0].y) * 0.5;
    const midWorld = mpToWorld(midX, midY);

    // ── Panel drag with index+middle (takes priority over everything) ──
    if (panelGrabs[hi]) {
      if (info.indexMiddleRatio > IM_OPEN) {
        panelGrabReleaseFrames[hi]++;
        if (panelGrabReleaseFrames[hi] >= IM_RELEASE_FRAMES) {
          panelGrabs[hi] = null;
          panelGrabReleaseFrames[hi] = 0;
        }
      } else {
        panelGrabReleaseFrames[hi] = 0;
        // Cast ray through finger midpoint and intersect with panel's Z plane
        const ndcX = (1 - imMidX) * 2 - 1;
        const ndcY = -(imMidY * 2 - 1);
        const cam = getCamera();
        _dragRay.setFromCamera({ x: ndcX, y: ndcY }, cam);
        const pz = panelGrabs[hi].position.z;
        const t  = (pz - _dragRay.ray.origin.z) / _dragRay.ray.direction.z;
        panelGrabs[hi].position.x = _dragRay.ray.origin.x + t * _dragRay.ray.direction.x;
        panelGrabs[hi].position.y = _dragRay.ray.origin.y + t * _dragRay.ray.direction.y;
        panelGrabs[hi].userData.vel.set(0, 0, 0);
      }
    } else if (imClose) {
      // Try to start panel drag on nearest solid panel
      const ndcMidX = (1 - imMidX) * 2 - 1;
      const ndcMidY = -(imMidY * 2 - 1);
      const camera = getCamera();
      let nearPanel = null, nearDist2 = 0.22 * 0.22;
      for (const g of panels) {
        if (g.userData.tapState !== 2) continue;
        _projV.copy(g.position).project(camera);
        const dx = _projV.x - ndcMidX, dy = _projV.y - ndcMidY;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearDist2) { nearDist2 = d2; nearPanel = g; }
      }
      if (nearPanel) panelGrabs[hi] = nearPanel;
    } else if (grabs[hi]) {
      // Thread endpoint drag
      if (info.ratios[0] > GRAB_OPEN) _releaseGrab(hi, thumbWorld);
      else _updateGrab(hi, thumbWorld);
    } else if (pinching) {
      // Try thread endpoint grab, then marble
      const hit = findClosestEndpoint(thumbWorld, GRAB_RADIUS);
      if (hit) {
        if (marbleCharges[hi]) {
          const c = marbleCharges[hi]; marbleCharges[hi] = null;
          scene.remove(c.mesh); c.geo.dispose(); c.mat.dispose();
        }
        if (previewLines[hi]) { removePreviewThread(previewLines[hi], scene); previewLines[hi] = null; }
        _startGrab(hi, hit, thumbWorld);
      } else {
        // Marble charge
        if (!marbleCharges[hi]) marbleCharges[hi] = { ...(_mkMarble()), buf: [] };
        marbleCharges[hi].mesh.position.copy(midWorld);
        marbleCharges[hi].buf.push(midWorld.clone());
        if (marbleCharges[hi].buf.length > 8) marbleCharges[hi].buf.shift();
      }
    } else if (marbleCharges[hi]) {
      // Release marble — compute flick velocity and shoot
      const charge = marbleCharges[hi];
      marbleCharges[hi] = null;
      scene.remove(charge.mesh); charge.geo.dispose(); charge.mat.dispose();
      const buf = charge.buf;
      if (buf.length >= 3) {
        const raw = buf[buf.length - 1].clone().sub(buf[0]);
        if (raw.length() > 0.035) {
          raw.normalize().multiplyScalar(0.19);
          raw.z -= 0.07;
          _fireMarble(buf[buf.length - 1], raw);
        }
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
  _updateMarbles();
  updateThreadCount(activeThreads.length);

  const handInfos = [getHandInfo(0), getHandInfo(1)];
  _updatePanelTaps(handInfos);
  drawSkeleton(hands.latestResult, handInfos, time);

  render();
}
