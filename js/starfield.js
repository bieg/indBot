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
  points = new THREE.Points(geometry, _starMat(4.5, 0xc8dcff));
  scene.add(points);

  // accent layer — 220 larger warm stars for depth (shared buffer view)
  const accentBuf = new Float32Array(positions.buffer, (COUNT - 220) * 3 * 4, 220 * 3);
  geometry2 = new THREE.BufferGeometry();
  geometry2.setAttribute('position', new THREE.BufferAttribute(accentBuf, 3));
  points2 = new THREE.Points(geometry2, _starMat(9.0, 0xfff6e8));
  scene.add(points2);

  return points;
}

const _tmp = new THREE.Vector3();

export function updateStarfield(time, activeThreads) {
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

    const speed = Math.sqrt(velocities[i3] ** 2 + velocities[i3 + 1] ** 2);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      velocities[i3]     *= scale;
      velocities[i3 + 1] *= scale;
    }
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
