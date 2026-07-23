import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

const COUNT  = 900;  // dark body cloud — form emerges through density
const GLOW_N =  80;  // hot-pink orbiting core halo

// World position of creature centroid
const _ORIG = new THREE.Vector3(0, 0.5, -3);

// Attractor bone skeleton — positions relative to _ORIG
// r = scatter radius, w = weight (how many particles cluster here)
const _BONES = [
  { p: [ 0.0,  2.6,  0.4], r: 0.50, w: 9  },  // head
  { p: [ 0.0,  1.5,  0.2], r: 0.40, w: 6  },  // neck
  { p: [ 0.0,  0.0,  0.0], r: 0.85, w: 16 },  // body (core)
  { p: [-1.6,  1.3,  0.3], r: 0.50, w: 8  },  // L wing root
  { p: [-3.2,  1.9,  0.5], r: 0.55, w: 8  },  // L wing mid
  { p: [-4.8,  2.5,  0.9], r: 0.45, w: 6  },  // L wing tip
  { p: [ 1.6,  1.3,  0.3], r: 0.50, w: 8  },  // R wing root
  { p: [ 3.2,  1.9,  0.5], r: 0.55, w: 8  },  // R wing mid
  { p: [ 4.8,  2.5,  0.9], r: 0.45, w: 6  },  // R wing tip
  { p: [ 0.0, -1.1, -0.2], r: 0.45, w: 6  },  // tail base
  { p: [ 0.3, -2.6,  0.4], r: 0.38, w: 5  },  // tail tip
  { p: [-0.7, -0.7,  0.2], r: 0.38, w: 4  },  // L leg
  { p: [ 0.7, -0.7,  0.2], r: 0.38, w: 4  },  // R leg
];

// Cumulative weight for weighted random bone selection
const _cumW = [];
{ let s = 0, tot = _BONES.reduce((a, b) => a + b.w, 0);
  for (const b of _BONES) _cumW.push((s += b.w) / tot); }

function _pickBone() {
  const r = Math.random();
  for (let i = 0; i < _cumW.length; i++) if (r <= _cumW[i]) return i;
  return _BONES.length - 1;
}

const _pos   = new Float32Array(COUNT * 3);
const _vel   = new Float32Array(COUNT * 3);
const _home  = new Float32Array(COUNT * 3);
const _phase = new Float32Array(COUNT);
const _bref  = new Uint8Array(COUNT);

const _gpos  = new Float32Array(GLOW_N * 3);

let _geo, _pts, _ggeo, _gpts, _coreMesh;
let _energize = 0;

export function initCreature(scene) {
  // ── Body particles scattered around bone attractors ───────────────────────────
  for (let i = 0; i < COUNT; i++) {
    const bi   = _pickBone();
    const b    = _BONES[bi];
    const ang1 = Math.random() * Math.PI * 2;
    const ang2 = Math.acos(2 * Math.random() - 1);
    const rad  = b.r * Math.cbrt(Math.random());  // cube root = uniform sphere fill
    const i3   = i * 3;
    _home[i3]   = _ORIG.x + b.p[0] + Math.sin(ang2) * Math.cos(ang1) * rad;
    _home[i3+1] = _ORIG.y + b.p[1] + Math.sin(ang2) * Math.sin(ang1) * rad;
    _home[i3+2] = _ORIG.z + b.p[2] + Math.cos(ang2) * rad;
    _pos[i3] = _home[i3]; _pos[i3+1] = _home[i3+1]; _pos[i3+2] = _home[i3+2];
    _phase[i] = Math.random() * Math.PI * 2;
    _bref[i]  = bi;
  }

  // Dim cool blue-white: individually near-invisible, form emerges through density
  _geo = new THREE.BufferGeometry();
  _geo.setAttribute('position', new THREE.BufferAttribute(_pos, 3));
  _pts = new THREE.Points(_geo, new THREE.PointsMaterial({
    size:            0.09,
    color:           0xb0bedd,
    blending:        THREE.AdditiveBlending,
    depthWrite:      false,
    transparent:     true,
    opacity:         0.09,
    sizeAttenuation: true,
  }));
  scene.add(_pts);

  // ── Hot-pink core halo (bloom) ────────────────────────────────────────────────
  _ggeo = new THREE.BufferGeometry();
  _ggeo.setAttribute('position', new THREE.BufferAttribute(_gpos, 3));
  _gpts = new THREE.Points(_ggeo, new THREE.PointsMaterial({
    size:            0.20,
    color:           0xff1166,
    blending:        THREE.AdditiveBlending,
    depthWrite:      false,
    transparent:     true,
    opacity:         0.75,
    sizeAttenuation: true,
  }));
  _gpts.layers.enable(BLOOM_LAYER);
  scene.add(_gpts);

  // ── Central core sphere (pinpoint bloom) ─────────────────────────────────────
  _coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff0044 })
  );
  _coreMesh.position.copy(_ORIG);
  _coreMesh.layers.enable(BLOOM_LAYER);
  scene.add(_coreMesh);
}

export function energizeCreature() {
  _energize = Math.min(1, _energize + 0.85);
}

export function updateCreature(time, activeThreads = []) {
  const t      = time * 0.001;
  const spring = 0.016 + _energize * 0.04;
  const damp   = 0.84;

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const bi = _bref[i];

    // Organic breathing undulation per particle
    const wave = Math.sin(t * 0.75 + _phase[i]);
    const hx   = _home[i3]   + wave * _BONES[bi].p[0] * 0.06;
    const hy   = _home[i3+1] + Math.sin(t * 0.55 + _phase[i] * 1.2) * (0.04 + _energize * 0.05);
    const hz   = _home[i3+2] + Math.cos(t * 0.45 + _phase[i] * 0.8) * 0.02;

    _vel[i3]   += (hx - _pos[i3])   * spring;
    _vel[i3+1] += (hy - _pos[i3+1]) * spring;
    _vel[i3+2] += (hz - _pos[i3+2]) * spring;

    // Gravity threads pull creature particles toward them
    for (const th of activeThreads) {
      if (th.type !== 'gravity' || th.dying) continue;
      const mx = (th.start.x + th.end.x) * 0.5;
      const my = (th.start.y + th.end.y) * 0.5;
      const dx = mx - _pos[i3], dy = my - _pos[i3+1];
      const dist = Math.sqrt(dx*dx + dy*dy) + 0.01;
      if (dist < 7) {
        _vel[i3]   += (dx / dist) * 0.0025;
        _vel[i3+1] += (dy / dist) * 0.0025;
      }
    }

    _vel[i3]   *= damp;
    _vel[i3+1] *= damp;
    _vel[i3+2] *= damp;
    _pos[i3]   += _vel[i3];
    _pos[i3+1] += _vel[i3+1];
    _pos[i3+2] += _vel[i3+2];
  }
  _geo.attributes.position.needsUpdate = true;

  // ── Core glow orbit ───────────────────────────────────────────────────────────
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
  const coreR = 0.28 + pulse * 0.20 + _energize * 0.55;
  for (let i = 0; i < GLOW_N; i++) {
    const ang = (i / GLOW_N) * Math.PI * 2 + t * 0.7;
    const i3  = i * 3;
    _gpos[i3]   = _ORIG.x + Math.cos(ang) * coreR;
    _gpos[i3+1] = _ORIG.y + Math.sin(t * 1.1 + i * 0.39) * 0.20;
    _gpos[i3+2] = _ORIG.z + Math.sin(ang) * coreR * 0.5;
  }
  _ggeo.attributes.position.needsUpdate = true;

  _coreMesh.scale.setScalar(1 + pulse * 0.4 + _energize * 2.2);
  _gpts.material.opacity = 0.60 + pulse * 0.28 + _energize * 0.30;

  _energize *= 0.96;
}

// Scatter creature on crush gesture, then spring back
export function crushCreature(origin) {
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const dx = _pos[i3]   - origin.x;
    const dy = _pos[i3+1] - origin.y;
    const dz = _pos[i3+2] - origin.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) + 0.1;
    if (dist < 9) {
      const f = 0.05 / Math.max(dist, 0.4);
      _vel[i3]   += (dx / dist) * f;
      _vel[i3+1] += (dy / dist) * f;
      _vel[i3+2] += (dz / dist) * f;
    }
  }
  energizeCreature();
}
