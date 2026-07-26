import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

export const activeThreads = [];
const CRUSH_RADIUS = 2.5;
const FADE_DURATION = 250;
const BIRTH_MS = 80;

const THREAD_COLORS = {
  structure: 0xffffff,
  energy: 0x3aa0ff,
  gravity: 0xffcc33,
  ghost: 0xffffff,
};

class Thread {
  constructor(type, start, end, scene, speed = null) {
    this.type = type;
    this.start = start.clone();
    this.end = end.clone();
    this.speed = speed;
    this.birthTime = performance.now();
    this.permanent = type === 'structure' || type === 'gravity';
    this.lifetime = type === 'energy' ? 3000 : Infinity;
    this.strength = 1.0;
    this.dying = false;
    this.dyingStart = 0;
    this.startWelded = false;
    this.endWelded   = false;
    this.locked      = false;  // true once part of a completed triangle
    this.mesh = _buildMesh(type, start, end, speed);
    scene.add(this.mesh);
    this._scene = scene;
  }

  rebuildMesh() {
    this._scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (this.mesh.material) this.mesh.material.dispose();
    this.mesh = _buildMesh(this.type, this.start, this.end, this.speed);
    if (this.mesh.material) this.mesh.material.opacity = 1; // no fade-in on rebuild
    this._scene.add(this.mesh);
  }

  dispose() {
    this._scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    if (this.mesh.material) this.mesh.material.dispose();
  }
}

function _buildMesh(type, start, end, speed = null) {
  // all threads start transparent at opacity 0 — birth fade-in in updateThreads
  if (type === 'structure') {
    // speed: slow (0.008) → thick (0.060), fast (0.067+) → thin (0.006)
    const radius = speed != null
      ? Math.max(0.006, 0.006 + 0.054 * Math.max(0, 1 - speed * 15))
      : 0.012;
    const curve = new THREE.CatmullRomCurve3([start, end]);
    const geo = new THREE.TubeGeometry(curve, 20, radius, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: THREAD_COLORS.structure, transparent: true, opacity: 0 });
    return new THREE.Mesh(geo, mat);
  }
  if (type === 'ghost') {
    const curve = new THREE.CatmullRomCurve3([start, end]);
    const geo = new THREE.TubeGeometry(curve, 20, 0.006, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: THREAD_COLORS.ghost, transparent: true, opacity: 0 });
    return new THREE.Mesh(geo, mat);
  }
  // energy + gravity
  const curve = new THREE.CatmullRomCurve3([start, end]);
  const geo = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
  const mat = new THREE.MeshBasicMaterial({ color: THREAD_COLORS[type], transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  if (type === 'gravity') mesh.layers.enable(BLOOM_LAYER);
  return mesh;
}

export function createThread(type, start, end, scene, speed = null) {
  const t = new Thread(type, start, end, scene, speed);
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
        const maxOp = t.type === 'ghost' ? 0.08 : t.type === 'energy' ? 0.7 : 1.0;
        t.mesh.material.opacity = Math.max(0, 1 - fadeProgress) * maxOp;
      }
      continue;
    }

    const age = now - t.birthTime;
    const birthFade = Math.min(age / BIRTH_MS, 1.0);

    if (!t.permanent) {
      t.strength = Math.max(0, 1 - age / t.lifetime);
      if (t.type === 'energy' && t.mesh.material) {
        t.mesh.material.opacity = (0.4 + 0.3 * Math.sin(time * 0.003)) * t.strength * birthFade;
      }
      if (t.strength <= 0) {
        t.dying = true;
        t.dyingStart = now;
      }
    } else if (t.mesh.material) {
      // structure / gravity / ghost: fade in then hold
      const maxOp = t.type === 'ghost' ? 0.08 : 1.0;
      t.mesh.material.opacity = birthFade * maxOp;
    }
  }
}

// ── Live preview line (follows fingers before gesture commits) ─────────────────
export function createPreviewThread(scene) {
  const pts = new Float32Array(6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const line = new THREE.Line(geo, mat);
  line.layers.enable(BLOOM_LAYER);
  scene.add(line);
  return line;
}

export function updatePreviewThread(line, start, end) {
  const pos = line.geometry.attributes.position;
  pos.setXYZ(0, start.x, start.y, start.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
}

export function removePreviewThread(line, scene) {
  scene.remove(line);
  line.geometry.dispose();
  line.material.dispose();
}

// ── Grab / weld helpers ───────────────────────────────────────────────────────

export function findClosestEndpoint(pos, radius, excludeThread = null) {
  let best = null, bestDist = radius;
  for (const t of activeThreads) {
    if (t === excludeThread || t.type !== 'structure' || t.locked) continue;
    if (!t.startWelded) {
      const d = pos.distanceTo(t.start);
      if (d < bestDist) { bestDist = d; best = { thread: t, which: 'start' }; }
    }
    if (!t.endWelded) {
      const d = pos.distanceTo(t.end);
      if (d < bestDist) { bestDist = d; best = { thread: t, which: 'end' }; }
    }
  }
  return best;
}

export function getEndpointPos(thread, which) {
  return which === 'start' ? thread.start : thread.end;
}

export function setEndpointPos(thread, which, pos) {
  if (which === 'start') thread.start.copy(pos);
  else                   thread.end.copy(pos);
}

export function flashWeld(pos, scene) {
  const geo = new THREE.SphereGeometry(0.14, 8, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.layers.enable(BLOOM_LAYER);
  sphere.position.copy(pos);
  scene.add(sphere);
  const t0 = performance.now();
  (function tick() {
    const f = Math.min((performance.now() - t0) / 500, 1);
    if (f >= 1) { scene.remove(sphere); geo.dispose(); mat.dispose(); return; }
    const s = 1 + f * 4;
    sphere.scale.set(s, s, s);
    mat.opacity = 1 - f;
    requestAnimationFrame(tick);
  })();
}

export function checkAndFlashTriangle(scene) {
  const st = activeThreads.filter(t => t.type === 'structure' && !t.locked);
  const EPS = 0.22;

  function close(p, q) { return p.distanceTo(q) < EPS; }
  function sharedPos(ta, tb) {
    for (const pa of [ta.start, ta.end])
      for (const pb of [tb.start, tb.end])
        if (close(pa, pb)) return pa.clone();
    return null;
  }

  for (let a = 0; a < st.length; a++) {
    for (let b = a + 1; b < st.length; b++) {
      const pab = sharedPos(st[a], st[b]);
      if (!pab) continue;
      for (let c = b + 1; c < st.length; c++) {
        const pbc = sharedPos(st[b], st[c]);
        if (!pbc || close(pab, pbc)) continue;
        const pca = sharedPos(st[c], st[a]);
        if (!pca || close(pca, pab) || close(pca, pbc)) continue;

        // Triangle found — lock threads
        st[a].locked = st[b].locked = st[c].locked = true;

        // Flash filled triangle
        const tgeo = new THREE.BufferGeometry();
        tgeo.setAttribute('position', new THREE.BufferAttribute(
          new Float32Array([pab.x,pab.y,pab.z, pbc.x,pbc.y,pbc.z, pca.x,pca.y,pca.z]), 3));
        tgeo.setIndex([0, 1, 2]);
        const tmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
        const tmesh = new THREE.Mesh(tgeo, tmat);
        tmesh.layers.enable(BLOOM_LAYER);
        scene.add(tmesh);
        const t0 = performance.now();
        (function tick() {
          const f = Math.min((performance.now() - t0) / 900, 1);
          if (f >= 1) { scene.remove(tmesh); tgeo.dispose(); tmat.dispose(); return; }
          tmat.opacity = 0.65 * (1 - f * f);
          requestAnimationFrame(tick);
        })();

        return true;
      }
    }
  }
  return false;
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
