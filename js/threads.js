import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

export const activeThreads = [];
const CRUSH_RADIUS = 2.5;
const FADE_DURATION = 250;

const THREAD_COLORS = {
  structure: 0xffffff,
  energy: 0x3aa0ff,
  gravity: 0xffcc33,
  ghost: 0xffffff,
};

class Thread {
  constructor(type, start, end, scene) {
    this.type = type;
    this.start = start.clone();
    this.end = end.clone();
    this.birthTime = performance.now();
    this.permanent = type === 'structure' || type === 'gravity';
    this.lifetime = type === 'energy' ? 3000 : Infinity;
    this.strength = 1.0;
    this.dying = false;
    this.dyingStart = 0;
    this.mesh = _buildMesh(type, start, end);
    scene.add(this.mesh);
    this._scene = scene;
  }

  dispose() {
    this._scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (this.mesh.material) this.mesh.material.dispose();
  }
}

function _buildMesh(type, start, end) {
  if (type === 'structure') {
    const curve = new THREE.CatmullRomCurve3([start, end]);
    const geo = new THREE.TubeGeometry(curve, 20, 0.012, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: THREAD_COLORS.structure });
    return new THREE.Mesh(geo, mat);
  }
  if (type === 'ghost') {
    const curve = new THREE.CatmullRomCurve3([start, end]);
    const geo = new THREE.TubeGeometry(curve, 20, 0.006, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: THREAD_COLORS.ghost,
      transparent: true,
      opacity: 0.08,
    });
    return new THREE.Mesh(geo, mat);
  }
  // energy + gravity — TubeGeometry
  const curve = new THREE.CatmullRomCurve3([start, end]);
  const geo = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
  const mat = new THREE.MeshBasicMaterial({
    color: THREAD_COLORS[type],
    transparent: type === 'energy',
    opacity: type === 'energy' ? 0.7 : 1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  if (type === 'gravity') mesh.layers.enable(BLOOM_LAYER);
  return mesh;
}

export function createThread(type, start, end, scene) {
  const t = new Thread(type, start, end, scene);
  activeThreads.push(t);
  return t;
}

export function updateThreads(time) {
  const now = performance.now();
  for (let i = activeThreads.length - 1; i >= 0; i--) {
    const t = activeThreads[i];

    if (t.dying) {
      const fadeProgress = (now - t.dyingStart) / FADE_DURATION;
      if (fadeProgress >= 1) {
        t.dispose();
        activeThreads.splice(i, 1);
        continue;
      }
      if (t.mesh.material) {
        t.mesh.material.transparent = true;
        t.mesh.material.opacity = Math.max(0, 1 - fadeProgress) * (t.type === 'ghost' ? 0.08 : 0.7);
      }
      continue;
    }

    if (!t.permanent) {
      const age = now - t.birthTime;
      t.strength = Math.max(0, 1 - age / t.lifetime);
      if (t.type === 'energy' && t.mesh.material) {
        t.mesh.material.opacity = (0.4 + 0.3 * Math.sin(time * 0.006)) * t.strength;
      }
      if (t.strength <= 0) {
        t.dying = true;
        t.dyingStart = now;
      }
    }
  }
}

export function crushThreads(originWorld) {
  for (const t of activeThreads) {
    if (t.dying) continue;
    const mid = new THREE.Vector3().addVectors(t.start, t.end).multiplyScalar(0.5);
    const d = Math.min(
      originWorld.distanceTo(t.start),
      originWorld.distanceTo(t.end),
      originWorld.distanceTo(mid)
    );
    if (d < CRUSH_RADIUS) {
      t.dying = true;
      t.dyingStart = performance.now();
    }
  }
}
