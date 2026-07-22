import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

// Large flat panels floating in 3D space — like tilted glass panes in a universe.
// Each panel has a dark semi-transparent fill that occludes the stars behind it
// (which gives the real sense of depth) plus glowing edges on BLOOM_LAYER.

const COUNT = 10;
const panels = [];

function _makeGeo(i) {
  if (i % 3 === 0) {
    // Triangle — like the sharp panels in the moodboard
    const s = 5 + Math.random() * 5;
    const geo = new THREE.BufferGeometry();
    const v = new Float32Array([
       0,          s * 0.85, 0,
      -s * 0.65, -s * 0.45, 0,
       s * 0.65, -s * 0.45, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    return geo;
  } else {
    // Wide rectangle — long panes like in the reference shots
    const w = 5 + Math.random() * 7;
    const h = 2.5 + Math.random() * 4;
    return new THREE.PlaneGeometry(w, h);
  }
}

export function initNebula(scene) {
  for (let i = 0; i < COUNT; i++) {
    const geo = _makeGeo(i);

    const hue = 0.55 + (i / COUNT) * 0.28;   // cyan-blue → violet

    // Fill: dark tinted glass — opacity makes stars visible through it
    // but distinctly dims them, creating a clear depth layer.
    const fillMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 0.5, 0.05),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(geo, fillMat);

    // Edge glow — same hue, luminous
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(hue, 1.0, 0.75),
      transparent: true,
      opacity: 0.75,
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.layers.enable(BLOOM_LAYER);

    const group = new THREE.Group();
    group.add(fill);
    group.add(edges);

    // Place in a Z band that keeps panels 4–16 units from the camera (cam at z=10)
    group.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 13,
      -2 + (Math.random() - 0.5) * 8,   // z: -6 to +2 → 8–16 units from camera
    );

    // Tilt dramatically — these should look like they're at steep angles
    group.rotation.set(
      (Math.random() - 0.5) * Math.PI * 1.2,
      (Math.random() - 0.5) * Math.PI * 1.2,
      (Math.random() - 0.5) * Math.PI * 0.6,
    );

    group.userData.rot = {
      x: (Math.random() - 0.5) * 0.0006,
      y: (Math.random() - 0.5) * 0.0005,
      z: (Math.random() - 0.5) * 0.0002,
    };
    group.userData.driftZ = (Math.random() - 0.5) * 0.0015;

    scene.add(group);
    panels.push(group);
  }
}

export function updateNebula() {
  for (const g of panels) {
    const r = g.userData.rot;
    g.rotation.x += r.x;
    g.rotation.y += r.y;
    g.rotation.z += r.z;

    g.position.z += g.userData.driftZ;
    // Wrap: drift through the volume, pop out the other side
    if (g.position.z >  4)  g.position.z -= 14;
    if (g.position.z < -10) g.position.z += 14;
  }
}

export function crushShards(originWorld) {
  for (const g of panels) {
    const dx = g.position.x - originWorld.x;
    const dy = g.position.y - originWorld.y;
    const dz = g.position.z - originWorld.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 6) {
      const f = 0.025 / Math.max(dist, 0.5);
      g.userData.rot.x += (Math.random() - 0.5) * f * 3;
      g.userData.rot.y += (Math.random() - 0.5) * f * 3;
      g.userData.driftZ += (dz / Math.max(dist, 0.5)) * f;
    }
  }
}
