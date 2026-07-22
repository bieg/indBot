import * as THREE from 'three';
import { BLOOM_LAYER } from './scene.js';

// Floating wireframe polyhedra in 3D space.
// These create the "geometric panels in a universe" aesthetic.
// Low opacity, on BLOOM_LAYER so they carry a faint glow.

const COUNT = 16;
const shards = [];

const _geoFactories = [
  () => new THREE.TetrahedronGeometry(1),
  () => new THREE.OctahedronGeometry(1),
  () => new THREE.IcosahedronGeometry(1),
  () => new THREE.BoxGeometry(1, 1.4, 0.8),
  () => new THREE.TetrahedronGeometry(1, 1),
];

export function initNebula(scene) {
  for (let i = 0; i < COUNT; i++) {
    const base = _geoFactories[i % _geoFactories.length]();
    const edges = new THREE.EdgesGeometry(base);
    base.dispose();

    const hue = 0.55 + (i / COUNT) * 0.25;           // blue → purple range
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color().setHSL(hue, 1.0, 0.65),
      transparent: true,
      opacity: 0.06 + Math.random() * 0.10,
    });

    const mesh = new THREE.LineSegments(edges, mat);
    mesh.layers.enable(BLOOM_LAYER);

    const scale = 1.8 + Math.random() * 5;
    mesh.scale.setScalar(scale);
    mesh.position.set(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 13,
      (Math.random() - 0.5) * 16,
    );
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    mesh.userData.rot = new THREE.Vector3(
      (Math.random() - 0.5) * 0.0005,
      (Math.random() - 0.5) * 0.0004,
      (Math.random() - 0.5) * 0.0002,
    );
    mesh.userData.driftZ = (Math.random() - 0.5) * 0.003;

    scene.add(mesh);
    shards.push(mesh);
  }
}

export function updateNebula() {
  for (const mesh of shards) {
    const r = mesh.userData.rot;
    mesh.rotation.x += r.x;
    mesh.rotation.y += r.y;
    mesh.rotation.z += r.z;

    mesh.position.z += mesh.userData.driftZ;
    // wrap: if it drifts behind the camera (z > 8) push it to the far end
    if (mesh.position.z > 8)  mesh.position.z -= 20;
    if (mesh.position.z < -12) mesh.position.z += 20;
  }
}

// Crush pushes nearby shards with a small impulse
export function crushShards(originWorld) {
  for (const mesh of shards) {
    const dx = mesh.position.x - originWorld.x;
    const dy = mesh.position.y - originWorld.y;
    const dz = mesh.position.z - originWorld.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 5) {
      const f = 0.02 / Math.max(dist, 0.5);
      mesh.userData.rot.x += (Math.random() - 0.5) * f;
      mesh.userData.rot.y += (Math.random() - 0.5) * f;
      mesh.userData.driftZ += dz / Math.max(dist, 0.5) * f * 0.5;
    }
  }
}
