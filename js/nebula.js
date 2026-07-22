import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

// Large flat panels in 3D space.
// Each has an iridescent thin-film surface shader + glowing edge on BLOOM_LAYER.
// Index finger proximity pushes panels away — they're part of the physical space.

const COUNT = 10;
const panels = [];

// ── Iridescent surface shader ─────────────────────────────────────────────────
// Dark glass base with animated oil-slick colour shimmer + fresnel rim glow.
const _VERT = `
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vEyeDir;
  void main() {
    vUv = uv;
    vec4 mv  = modelViewMatrix * vec4(position, 1.0);
    vNormal  = normalize(normalMatrix * normal);
    vEyeDir  = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const _FRAG = `
  uniform float uTime;
  uniform float uHue;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vEyeDir;

  vec3 hsl2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  void main() {
    float facing  = abs(dot(vNormal, vEyeDir));
    float fresnel = 1.0 - facing;             // 0 = face-on, 1 = edge-on

    // Two animated sine waves across UV — oil-slick interference
    float w  = sin(vUv.x * 6.0 + uTime * 0.55) * 0.5 + 0.5;
    w       *= sin(vUv.y * 4.2 - uTime * 0.38 + 1.3) * 0.5 + 0.5;

    // Hue shifts with fresnel + wave + slow drift
    float h   = uHue + fresnel * 0.12 + w * 0.09 + uTime * 0.012;
    vec3  col = hsl2rgb(vec3(fract(h), 0.85, 0.30));

    // Surface colour: mostly dark, shimmer + rim adds light
    vec3 surface = col * (0.07 + w * 0.10 + fresnel * 0.22);

    // Alpha: solid enough to occlude, rim is slightly more opaque
    float alpha = 0.52 + fresnel * 0.28;

    gl_FragColor = vec4(surface, alpha);
  }
`;

// ── Geometry helpers ──────────────────────────────────────────────────────────
function _makeGeo(i) {
  if (i % 3 === 0) {
    // Sharp triangle — like the angular panels in the moodboard
    const s   = 5 + Math.random() * 5;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
       0,          s * 0.85, 0,
      -s * 0.65, -s * 0.45, 0,
       s * 0.65, -s * 0.45, 0,
    ]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0.5, 1.0,
      0.0, 0.0,
      1.0, 0.0,
    ]), 2));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    return geo;
  } else {
    const w = 5 + Math.random() * 7;
    const h = 2.8 + Math.random() * 4.5;
    return new THREE.PlaneGeometry(w, h);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initNebula(scene) {
  for (let i = 0; i < COUNT; i++) {
    const geo = _makeGeo(i);
    const hue = 0.54 + (i / COUNT) * 0.30;   // cyan-blue → deep violet

    // Iridescent fill
    const fillMat = new THREE.ShaderMaterial({
      vertexShader:   _VERT,
      fragmentShader: _FRAG,
      uniforms: {
        uTime: { value: 0 },
        uHue:  { value: hue },
      },
      transparent: true,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    const fill = new THREE.Mesh(geo, fillMat);

    // Glowing edge
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color:       new THREE.Color().setHSL(hue, 1.0, 0.78),
      transparent: true,
      opacity:     0.80,
    });
    const edge = new THREE.LineSegments(edgeGeo, edgeMat);
    edge.layers.enable(BLOOM_LAYER);

    const group = new THREE.Group();
    group.add(fill);
    group.add(edge);
    group.userData.fill = fill;   // keep ref for uniform updates

    group.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 13,
      -2 + (Math.random() - 0.5) * 8,
    );
    group.rotation.set(
      (Math.random() - 0.5) * Math.PI * 1.3,
      (Math.random() - 0.5) * Math.PI * 1.3,
      (Math.random() - 0.5) * Math.PI * 0.6,
    );
    group.userData.rot    = { x: (Math.random()-0.5)*0.0006, y: (Math.random()-0.5)*0.0005, z: (Math.random()-0.5)*0.0002 };
    group.userData.driftZ = (Math.random() - 0.5) * 0.0015;
    group.userData.vel    = new THREE.Vector3();   // velocity for hand push

    scene.add(group);
    panels.push(group);
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
// indexTips: array of THREE.Vector3 (world space) — index fingertip positions
export function updateNebula(time, indexTips = []) {
  const t = time * 0.001;

  for (const g of panels) {
    // Update shader time
    g.userData.fill.material.uniforms.uTime.value = t;

    // Rotation
    const r = g.userData.rot;
    g.rotation.x += r.x;
    g.rotation.y += r.y;
    g.rotation.z += r.z;

    // Hand proximity — push panel away from index fingertips
    for (const tip of indexTips) {
      const dx = g.position.x - tip.x;
      const dy = g.position.y - tip.y;
      const dz = g.position.z - tip.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist < 3.5 && dist > 0.05) {
        const push = 0.004 / Math.max(dist, 0.3);
        g.userData.vel.x += (dx / dist) * push;
        g.userData.vel.y += (dy / dist) * push;
        // Spin slightly when touched
        g.userData.rot.x += (Math.random() - 0.5) * 0.0008;
        g.userData.rot.y += (Math.random() - 0.5) * 0.0008;
      }
    }

    // Apply + damp velocity
    g.position.add(g.userData.vel);
    g.userData.vel.multiplyScalar(0.92);

    // Z drift
    g.position.z += g.userData.driftZ;
    if (g.position.z >  5) g.position.z -= 15;
    if (g.position.z < -10) g.position.z += 15;
  }
}

// ── Crush ─────────────────────────────────────────────────────────────────────
export function crushShards(originWorld) {
  for (const g of panels) {
    const dx = g.position.x - originWorld.x;
    const dy = g.position.y - originWorld.y;
    const dz = g.position.z - originWorld.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist < 6) {
      const f = 0.04 / Math.max(dist, 0.5);
      g.userData.vel.x += (dx / Math.max(dist, 0.001)) * f;
      g.userData.vel.y += (dy / Math.max(dist, 0.001)) * f;
      g.userData.rot.x += (Math.random() - 0.5) * f * 4;
      g.userData.rot.y += (Math.random() - 0.5) * f * 4;
      g.userData.driftZ += (dz / Math.max(dist, 0.001)) * f * 0.5;
    }
  }
}
