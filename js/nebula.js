import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

const COUNT = 10;
export const panels = [];

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

    // Invisible fill — transparent but present for raycasting
    const fillMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity:     0,
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
    group.userData.fill = fill;
    group.userData.edge = edge;
    group.userData.hue  = hue;

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
    const rotX = (Math.random()-0.5)*0.0006, rotY = (Math.random()-0.5)*0.0005, rotZ = (Math.random()-0.5)*0.0002;
    group.userData.rot       = { x: rotX, y: rotY, z: rotZ };
    group.userData.origRot   = { x: rotX, y: rotY, z: rotZ };
    group.userData.driftZ    = (Math.random() - 0.5) * 0.0015;
    group.userData.vel       = new THREE.Vector3();
    group.userData.tapState  = 0;   // 0=default 1=colored 2=solid
    group.userData.prevClose = false;

    scene.add(group);
    panels.push(group);
  }
}

// ── Tap state ─────────────────────────────────────────────────────────────────
// 0 = default (iridescent, floating)
// 1 = colored  (vivid edge glow, still floating)
// 2 = solid    (frozen, dark)
function _applyTapState(g) {
  const { tapState, hue, edge, fill, origRot, rot, vel } = g.userData;
  if (tapState === 0) {
    rot.x = origRot.x; rot.y = origRot.y; rot.z = origRot.z;
    edge.material.color.setHSL(hue, 1.0, 0.78);
    edge.material.opacity = 0.80;
    fill.material.opacity = 0;
  } else if (tapState === 1) {
    rot.x = origRot.x; rot.y = origRot.y; rot.z = origRot.z;
    edge.material.color.setHSL(hue, 1.0, 0.97);
    edge.material.opacity = 1.0;
    fill.material.opacity = 0;
  } else {
    // Solid: stop moving, fill becomes 50% opaque
    rot.x = 0; rot.y = 0; rot.z = 0;
    vel.set(0, 0, 0);
    edge.material.color.setHSL(hue, 0.6, 0.55);
    edge.material.opacity = 0.60;
    fill.material.color.setHSL(hue, 0.7, 0.4);
    fill.material.opacity = 0.5;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
// indexTips: array of THREE.Vector3 (world space) — index fingertip positions
export function updateNebula(time, indexTips = []) {
  for (const g of panels) {
    // Rotation
    const r = g.userData.rot;
    g.rotation.x += r.x;
    g.rotation.y += r.y;
    g.rotation.z += r.z;

    // Index fingertip interaction
    for (const tip of indexTips) {
      const dx = g.position.x - tip.x;
      const dy = g.position.y - tip.y;

      // Push — only when not solid (2D distance)
      const dist2d = Math.sqrt(dx*dx + dy*dy);
      if (g.userData.tapState !== 2 && dist2d < 4.0 && dist2d > 0.05) {
        const push = 0.004 / Math.max(dist2d, 0.3);
        g.userData.vel.x += (dx / dist2d) * push;
        g.userData.vel.y += (dy / dist2d) * push;
        g.userData.rot.x += (Math.random() - 0.5) * 0.0008;
        g.userData.rot.y += (Math.random() - 0.5) * 0.0008;
      }
    }
    const solid = g.userData.tapState === 2;

    // Apply + damp velocity
    g.position.add(g.userData.vel);
    g.userData.vel.multiplyScalar(solid ? 0.60 : 0.92);

    // Z drift
    g.position.z += g.userData.driftZ;
    if (g.position.z >  5) g.position.z -= 15;
    if (g.position.z < -10) g.position.z += 15;
  }
}

export function tapPanel(group) {
  group.userData.tapState = (group.userData.tapState + 1) % 3;
  _applyTapState(group);
}

// ── Marble explosion ──────────────────────────────────────────────────────────
export function explodePanel(group, scene) {
  const idx = panels.indexOf(group);
  if (idx === -1) return;
  panels.splice(idx, 1);
  scene.remove(group);

  const pos = group.position.clone();
  const hue = group.userData.hue ?? 0.6;
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
