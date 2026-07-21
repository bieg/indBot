import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

const GOLD  = new THREE.Color(0xffd76a);
const WHITE = new THREE.Color(0xffffff);
const PROXIMITY_RADIUS = 2.0;
const TOUCH_RADIUS     = 0.55;
const TOUCH_COOLDOWN   = 1200;

let group, faceMesh, edgeLines;
const velocity    = new THREE.Vector3();
const SPRING      = 0.004;
const DAMPING     = 0.92;
let energizeBoost  = 0;
let proximityLevel = 0;
let lastTouchTime  = 0;
let touchFlash     = 0;
const origin = new THREE.Vector3(0, 0, 0);

export let onSollyTouch = null;
export function setOnSollyTouch(fn) { onSollyTouch = fn; }

export function initSolly(scene) {
  group = new THREE.Group();

  const tetraGeo = new THREE.TetrahedronGeometry(0.45, 0);

  // semi-transparent faces at 50% — 3D volume visible, void shows through
  faceMesh = new THREE.Mesh(tetraGeo, new THREE.MeshBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.50,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  group.add(faceMesh);

  // 100% solid edges, on bloom layer for golden glow
  edgeLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(tetraGeo),
    new THREE.LineBasicMaterial({ color: GOLD.clone() })
  );
  edgeLines.layers.enable(BLOOM_LAYER);
  group.add(edgeLines);

  scene.add(group);
  return group;
}

const _tmp = new THREE.Vector3();
const _cp  = new THREE.Vector3();

export function updateSolly(time, activeThreads, fingerPositions = [], palmPositions = []) {
  let energySum = 0;
  let gravityTarget = null;
  let nearestGravityDist = Infinity;

  for (const t of activeThreads) {
    if (t.dying) continue;
    const d = Math.min(group.position.distanceTo(t.start), group.position.distanceTo(t.end));
    if ((t.type === 'energy' || t.type === 'gravity') && d < 4) {
      energySum += t.strength / Math.max(d, 0.3);
    }
    if (t.type === 'gravity') {
      const cp = _closestPt(group.position, t.start, t.end, _cp);
      const dist = group.position.distanceTo(cp);
      if (dist < nearestGravityDist) {
        nearestGravityDist = dist;
        gravityTarget = cp.clone();
      }
    }
  }

  // float above palm when hand present and no gravity thread
  let palmTarget = null;
  if (!gravityTarget && palmPositions.length > 0) {
    palmTarget = palmPositions[0].clone();
    palmTarget.y += 1.2; // hover above the palm
  }

  _tmp.copy(gravityTarget || palmTarget || origin).sub(group.position);
  velocity.addScaledVector(_tmp, SPRING);
  velocity.multiplyScalar(DAMPING);
  group.position.add(velocity);

  // proximity to index finger tips
  let closestFinger = Infinity;
  for (const fp of fingerPositions) {
    const d = group.position.distanceTo(fp);
    if (d < closestFinger) closestFinger = d;
  }
  const targetProx = fingerPositions.length > 0
    ? Math.max(0, 1 - closestFinger / PROXIMITY_RADIUS)
    : 0;

  const now = performance.now();
  if (closestFinger < TOUCH_RADIUS && now - lastTouchTime > TOUCH_COOLDOWN) {
    lastTouchTime = now;
    touchFlash = 1.0;
    if (onSollyTouch) onSollyTouch();
  }

  proximityLevel = proximityLevel * 0.88 + targetProx * 0.12;
  touchFlash     *= 0.91;
  energizeBoost  *= Math.pow(0.001, 0.016);

  // full 3D tumble — faster when touched or energized
  const rotSpeed = 0.0003 + proximityLevel * 0.0006 + touchFlash * 0.003 + energizeBoost * 0.001;
  group.rotation.y = time * rotSpeed;
  group.rotation.x = time * rotSpeed * 0.6;
  group.rotation.z = time * rotSpeed * 0.35;

  // scale
  const sc = 1 + proximityLevel * 0.2 + touchFlash * 0.45 + 0.06 * Math.sin(time * 0.003);
  group.scale.setScalar(Math.max(0.5, Math.min(sc, 2.5)));

  // edge color: gold → white on proximity/touch
  const colorT = Math.min(proximityLevel * 0.7 + touchFlash, 1);
  edgeLines.material.color.lerpColors(GOLD, WHITE, colorT);

  // face opacity: 50% base, brightens on touch
  faceMesh.material.opacity = 0.50 + proximityLevel * 0.15 + touchFlash * 0.25;
}

export function energizeSolly(amount = 1.5) {
  energizeBoost += amount;
  touchFlash = Math.min(touchFlash + amount * 0.4, 1.5);
}

function _closestPt(p, a, b, out) {
  const ax = b.x - a.x, ay = b.y - a.y;
  const bx = p.x - a.x, by = p.y - a.y;
  const t = Math.max(0, Math.min(1, (bx * ax + by * ay) / (ax * ax + ay * ay + 1e-8)));
  out.set(a.x + ax * t, a.y + ay * t, 0);
  return out;
}
