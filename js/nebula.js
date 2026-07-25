import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

// Large flat panels in 3D space.
// Each has an iridescent thin-film surface shader + glowing edge on BLOOM_LAYER.
// Index finger proximity pushes panels away — they're part of the physical space.

const COUNT = 10;
export const panels = [];

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
  uniform float uSolid;   // 0 = iridescent, 1 = solidified dark panel
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vEyeDir;

  vec3 hsl2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }

  void main() {
    float facing  = abs(dot(vNormal, vEyeDir));
    float fresnel = 1.0 - facing;

    float w  = sin(vUv.x * 6.0 + uTime * 0.55) * 0.5 + 0.5;
    w       *= sin(vUv.y * 4.2 - uTime * 0.38 + 1.3) * 0.5 + 0.5;

    float h   = uHue + fresnel * 0.12 + w * 0.09 + uTime * 0.012;
    vec3  col = hsl2rgb(vec3(fract(h), 0.85, 0.30));
    vec3  surface = col * (0.07 + w * 0.10 + fresnel * 0.22);
    float alpha   = 0.52 + fresnel * 0.28;

    // Solidified: near-black with faint hue tint, fully opaque
    vec3  solidCol   = hsl2rgb(vec3(fract(uHue + 0.02), 0.25, 0.05));
    float solidAlpha = 0.95;

    gl_FragColor = vec4(
      mix(surface,  solidCol,   uSolid),
      mix(alpha,    solidAlpha, uSolid)
    );
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
        uTime:  { value: 0 },
        uHue:   { value: hue },
        uSolid: { value: 0 },
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
    group.userData.rot       = { x: (Math.random()-0.5)*0.0006, y: (Math.random()-0.5)*0.0005, z: (Math.random()-0.5)*0.0002 };
    group.userData.driftZ    = (Math.random() - 0.5) * 0.0015;
    group.userData.vel       = new THREE.Vector3();
    group.userData.solid     = false;   // solidified by fingertip tap
    group.userData.prevClose = false;   // tap edge detection

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

    // Index fingertip interaction
    let nowClose = false;
    for (const tip of indexTips) {
      const dx = g.position.x - tip.x;
      const dy = g.position.y - tip.y;
      const dz = g.position.z - tip.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      // Tap zone — entering triggers solid (one-way: tap locks it)
      if (dist < 1.0 && dist > 0.05) {
        nowClose = true;
        if (!g.userData.prevClose && !g.userData.solid) {
          g.userData.solid = true;
          g.userData.rot.x = 0;
          g.userData.rot.y = 0;
          g.userData.rot.z = 0;
          g.userData.vel.set(0, 0, 0);
        }
      }

      // Push — only when not solidified
      if (!g.userData.solid && dist < 3.5 && dist > 0.05) {
        const push = 0.004 / Math.max(dist, 0.3);
        g.userData.vel.x += (dx / dist) * push;
        g.userData.vel.y += (dy / dist) * push;
        g.userData.rot.x += (Math.random() - 0.5) * 0.0008;
        g.userData.rot.y += (Math.random() - 0.5) * 0.0008;
      }
    }
    g.userData.prevClose = nowClose;
    g.userData.fill.material.uniforms.uSolid.value = g.userData.solid ? 1 : 0;

    // Apply + damp velocity — solidified panels barely move
    g.position.add(g.userData.vel);
    g.userData.vel.multiplyScalar(g.userData.solid ? 0.60 : 0.92);

    // Z drift
    g.position.z += g.userData.driftZ;
    if (g.position.z >  5) g.position.z -= 15;
    if (g.position.z < -10) g.position.z += 15;
  }
}

// ── Marble explosion ──────────────────────────────────────────────────────────
export function explodePanel(group, scene) {
  const idx = panels.indexOf(group);
  if (idx === -1) return;
  panels.splice(idx, 1);
  scene.remove(group);

  const pos = group.position.clone();
  const hue = group.userData.fill?.material?.uniforms?.uHue?.value ?? 0.6;
  const col = new THREE.Color().setHSL(hue, 1.0, 0.72);

  const shards = [];
  for (let i = 0; i < 130; i++) {
    const s = 0.04 + Math.random() * 0.30;
    let geo;
    if (i % 3 === 0) {
      geo = new THREE.PlaneGeometry(s, s * (0.25 + Math.random() * 1.2));
    } else {
      geo = new THREE.BufferGeometry();
      const a = Math.random() * Math.PI * 2, b = a + (0.8 + Math.random()) * 1.2;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0, s * Math.cos(a), s * Math.sin(a), 0, s * Math.cos(b), s * Math.sin(b), 0,
      ]), 3));
      geo.setIndex([0, 1, 2]);
      geo.computeVertexNormals();
    }
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const spread = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
    mesh.position.copy(pos).addScaledVector(spread, Math.random() * 0.6);
    mesh.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
    const spd = 0.06 + Math.random() * 0.22;
    const dir = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, (Math.random()-0.3)*0.6).normalize();
    const rotV = { x:(Math.random()-0.5)*0.14, y:(Math.random()-0.5)*0.14, z:(Math.random()-0.5)*0.10 };
    shards.push({ mesh, vel: dir.multiplyScalar(spd), rotV, mat });
    scene.add(mesh);
  }

  const born = performance.now();
  const LIFE = 1800;
  (function tick() {
    const f = Math.min((performance.now() - born) / LIFE, 1);
    if (f >= 1) {
      shards.forEach(s => { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mat.dispose(); });
      return;
    }
    for (const s of shards) {
      s.mesh.position.add(s.vel);
      s.vel.multiplyScalar(0.93);
      s.mesh.rotation.x += s.rotV.x;
      s.mesh.rotation.y += s.rotV.y;
      s.mesh.rotation.z += s.rotV.z;
      s.mat.opacity = 0.92 * Math.pow(1 - f, 1.4);
    }
    requestAnimationFrame(tick);
  })();
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
