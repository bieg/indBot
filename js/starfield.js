import * as THREE from 'three';

const COUNT = 1500;
const BOUNDS = 22;
const MAX_SPEED = 0.04;
const GRAVITY_STRENGTH = 0.0006;
const GRAVITY_RADIUS = 3.0;
const ENERGY_RADIUS = 1.5;
const CRUSH_RADIUS = 4.0;

const positions = new Float32Array(COUNT * 3);
const velocities = new Float32Array(COUNT * 3);
const phases = new Float32Array(COUNT);
let geometry, points;
let geometry2, points2;
let _mat1, _mat2;

const _origColor1 = new THREE.Color(0xc8dcff);
const _origColor2 = new THREE.Color(0xfff6e8);
const _darkColor1 = new THREE.Color(0x440011); // dark red
const _darkColor2 = new THREE.Color(0x001133); // dark blue

let _negState = null; // null | 'contracting' | 'exploding'
let _negStartTime = 0;
let _explosionApplied = false;
const CONTRACTION_MS    = 800;
const EXPLOSION_MS      = 1100;
const CONTRACTION_FORCE = 0.015;
const EXPLOSION_FORCE   = 0.28;
const BURST_MAX_SPEED   = 0.8;

// Inline GLSL — draws a soft radial glow disc using gl_PointCoord.
// Much more reliable than canvas textures (no asset loading, no alphaTest quirks).
const _VERT = `
  uniform float uSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // sizeAttenuation: scale by depth so far stars are smaller
    gl_PointSize = uSize / max(0.05, -mv.z / 10.0);
    gl_Position  = projectionMatrix * mv;
  }
`;
const _FRAG = `
  uniform vec3 uColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0; // 0 centre → 1 edge
    if (d > 1.0) discard;
    float g = pow(1.0 - d, 2.4);                  // soft power-law glow
    gl_FragColor = vec4(uColor * g, g);
  }
`;

function _starMat(uSize, hex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSize:  { value: uSize },
      uColor: { value: new THREE.Color(hex) },
    },
    vertexShader:   _VERT,
    fragmentShader: _FRAG,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
    transparent: true,
  });
}

export function initStarfield(scene) {
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    positions[i3]     = (Math.random() - 0.5) * BOUNDS;
    positions[i3 + 1] = (Math.random() - 0.5) * BOUNDS;
    positions[i3 + 2] = (Math.random() - 0.5) * 8;
    velocities[i3]     = (Math.random() - 0.5) * 0.002;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.002;
    velocities[i3 + 2] = 0;
    phases[i] = Math.random() * Math.PI * 2;
  }

  // main layer — 1500 small cool blue-white glowing dots
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  _mat1 = _starMat(4.5, 0xc8dcff);
  points = new THREE.Points(geometry, _mat1);
  scene.add(points);

  // accent layer — 220 larger warm stars for depth (shared buffer view)
  const accentBuf = new Float32Array(positions.buffer, (COUNT - 220) * 3 * 4, 220 * 3);
  geometry2 = new THREE.BufferGeometry();
  geometry2.setAttribute('position', new THREE.BufferAttribute(accentBuf, 3));
  _mat2 = _starMat(9.0, 0xfff6e8);
  points2 = new THREE.Points(geometry2, _mat2);
  scene.add(points2);

  return points;
}

const _tmp = new THREE.Vector3();

export function updateStarfield(time, activeThreads) {
  // Handle negative-word burst: contraction → explosion state machine
  if (_negState && _mat1 && _mat2) {
    const now = performance.now();
    const elapsed = now - _negStartTime;

    if (_negState === 'contracting') {
      const t = Math.min(1, elapsed / CONTRACTION_MS);
      _mat1.uniforms.uColor.value.set(
        _origColor1.r + (_darkColor1.r - _origColor1.r) * t,
        _origColor1.g + (_darkColor1.g - _origColor1.g) * t,
        _origColor1.b + (_darkColor1.b - _origColor1.b) * t,
      );
      _mat2.uniforms.uColor.value.set(
        _origColor2.r + (_darkColor2.r - _origColor2.r) * t,
        _origColor2.g + (_darkColor2.g - _origColor2.g) * t,
        _origColor2.b + (_darkColor2.b - _origColor2.b) * t,
      );
      if (t >= 1) {
        _negState = 'exploding';
        _negStartTime = now;
        _explosionApplied = false;
      }
    } else if (_negState === 'exploding') {
      const t = Math.min(1, elapsed / EXPLOSION_MS);
      _mat1.uniforms.uColor.value.set(
        _darkColor1.r + (_origColor1.r - _darkColor1.r) * t,
        _darkColor1.g + (_origColor1.g - _darkColor1.g) * t,
        _darkColor1.b + (_origColor1.b - _darkColor1.b) * t,
      );
      _mat2.uniforms.uColor.value.set(
        _darkColor2.r + (_origColor2.r - _darkColor2.r) * t,
        _darkColor2.g + (_origColor2.g - _darkColor2.g) * t,
        _darkColor2.b + (_origColor2.b - _darkColor2.b) * t,
      );
      if (t >= 1) {
        _negState = null;
        _mat1.uniforms.uColor.value.copy(_origColor1);
        _mat2.uniforms.uColor.value.copy(_origColor2);
      }
    }
  }

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];

    for (const thread of activeThreads) {
      if (thread.dying) continue;

      if (thread.type === 'gravity') {
        const cp = _closestPointOnSegment(px, py, thread.start, thread.end, _tmp);
        const dx = cp.x - px, dy = cp.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRAVITY_RADIUS && dist > 0.01) {
          const force = GRAVITY_STRENGTH / Math.max(dist, 0.3);
          velocities[i3]     += (dx / dist) * force;
          velocities[i3 + 1] += (dy / dist) * force;
        }
      }

      if (thread.type === 'energy') {
        const mx = (thread.start.x + thread.end.x) * 0.5;
        const my = (thread.start.y + thread.end.y) * 0.5;
        const dx = px - mx, dy = py - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ENERGY_RADIUS) {
          velocities[i3]     += (Math.random() - 0.5) * 0.003 * thread.strength;
          velocities[i3 + 1] += (Math.random() - 0.5) * 0.003 * thread.strength;
        }
      }
    }

    // Contraction: pull all stars toward center
    if (_negState === 'contracting') {
      const ddx = -px, ddy = -py;
      const dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
      velocities[i3]     += (ddx / dd) * CONTRACTION_FORCE;
      velocities[i3 + 1] += (ddy / dd) * CONTRACTION_FORCE;
    }

    // Explosion: one-shot outward impulse on the first frame of exploding state
    if (_negState === 'exploding' && !_explosionApplied) {
      const dd = Math.sqrt(px * px + py * py);
      let ex, ey;
      if (dd < 0.05) {
        const angle = Math.random() * Math.PI * 2;
        ex = Math.cos(angle);
        ey = Math.sin(angle);
      } else {
        ex = px / dd;
        ey = py / dd;
      }
      const str = EXPLOSION_FORCE * (0.7 + Math.random() * 0.6);
      velocities[i3]     = ex * str;
      velocities[i3 + 1] = ey * str;
    }

    velocities[i3]     *= 0.98;
    velocities[i3 + 1] *= 0.98;

    const sinOffset = Math.sin(time * 0.0001 + phases[i]) * 0.001;
    positions[i3]     += velocities[i3]     + sinOffset;
    positions[i3 + 1] += velocities[i3 + 1] + sinOffset;

    const half = BOUNDS / 2;
    if (positions[i3]     >  half) positions[i3]     -= BOUNDS;
    if (positions[i3]     < -half) positions[i3]     += BOUNDS;
    if (positions[i3 + 1] >  half) positions[i3 + 1] -= BOUNDS;
    if (positions[i3 + 1] < -half) positions[i3 + 1] += BOUNDS;

    const maxSpd = _negState ? BURST_MAX_SPEED : MAX_SPEED;
    const speed = Math.sqrt(velocities[i3] ** 2 + velocities[i3 + 1] ** 2);
    if (speed > maxSpd) {
      const scale = maxSpd / speed;
      velocities[i3]     *= scale;
      velocities[i3 + 1] *= scale;
    }
  }

  if (_negState === 'exploding' && !_explosionApplied) {
    _explosionApplied = true;
  }

  geometry.attributes.position.needsUpdate = true;
  if (geometry2) geometry2.attributes.position.needsUpdate = true;
}

export function rotateImpulse(originWorld, direction = 1) {
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const dx = positions[i3] - originWorld.x;
    const dy = positions[i3 + 1] - originWorld.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4.5 && dist > 0.05) {
      const strength = 0.05 / Math.max(dist, 0.3);
      // tangential = perpendicular to radial
      velocities[i3]     += (-dy / dist) * strength * direction;
      velocities[i3 + 1] += ( dx / dist) * strength * direction;
    }
  }
}

export function crushImpulse(originWorld) {
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    const dx = positions[i3] - originWorld.x;
    const dy = positions[i3 + 1] - originWorld.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < CRUSH_RADIUS) {
      const strength = 0.08 / Math.max(dist, 0.2);
      velocities[i3]     += (dx / Math.max(dist, 0.001)) * strength;
      velocities[i3 + 1] += (dy / Math.max(dist, 0.001)) * strength;
    }
  }
}

export function darkMoodBurst() {
  // 5 random crush-impulse points scattered across the visible area
  for (let k = 0; k < 5; k++) {
    const ox = (Math.random() - 0.5) * 16;
    const oy = (Math.random() - 0.5) * 10;
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const dx = positions[i3] - ox;
      const dy = positions[i3 + 1] - oy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CRUSH_RADIUS) {
        const str = 0.12 / Math.max(dist, 0.2);
        velocities[i3]     += (dx / Math.max(dist, 0.001)) * str;
        velocities[i3 + 1] += (dy / Math.max(dist, 0.001)) * str;
      }
    }
  }
}

export function negativeWordBurst() {
  _negState = 'contracting';
  _negStartTime = performance.now();
  _explosionApplied = false;
}

export function lightMoodDrift() {
  // gentle rightward + upward drift — like a breeze
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    velocities[i3]     += 0.012 * (0.4 + Math.random() * 0.6);
    velocities[i3 + 1] += 0.007 * (0.4 + Math.random() * 0.6);
  }
}

function _closestPointOnSegment(px, py, start, end, out) {
  const ax = end.x - start.x, ay = end.y - start.y;
  const bx = px - start.x,  by = py - start.y;
  const t = Math.max(0, Math.min(1, (bx * ax + by * ay) / (ax * ax + ay * ay + 1e-8)));
  out.set(start.x + ax * t, start.y + ay * t, 0);
  return out;
}
