import * as THREE from 'three';

let _scene = null;
const _active = [];
const MAX_CLOUDS = 8;

export function initWordCloud(scene) {
  _scene = scene;
}

export function spawnWordCloud(word) {
  if (!_scene || _active.length >= MAX_CLOUDS) return;

  const upper = word.toUpperCase();

  // Render word to offscreen canvas, then sample filled pixels as 3D points
  const cw = 320, ch = 72;
  const canvas = document.createElement('canvas');
  canvas.width  = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.font         = 'bold 52px "Courier New", monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = 'white';
  ctx.fillText(upper, cw / 2, ch / 2);

  const img = ctx.getImageData(0, 0, cw, ch).data;
  const pts = [];
  const step = 2;
  for (let y = 0; y < ch; y += step) {
    for (let x = 0; x < cw; x += step) {
      if (img[(y * cw + x) * 4 + 3] > 100) {
        pts.push(
          (x / cw - 0.5) * 7.5,          // x: ~±3.75 scene units
          -(y / ch - 0.5) * 2.2,          // y: ~±1.1 scene units
          (Math.random() - 0.5) * 0.7,    // z: slight depth scatter
        );
      }
    }
  }
  if (pts.length < 8) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));

  const mat = new THREE.PointsMaterial({
    color:       0x88ddff,
    size:        0.065,
    transparent: true,
    opacity:     0.80,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });

  const mesh = new THREE.Points(geo, mat);

  // Scatter position — avoid dead center where Solly lives
  const angle  = Math.random() * Math.PI * 2;
  const radius = 1.8 + Math.random() * 4.5;
  mesh.position.set(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.5,
    -0.5 - Math.random() * 2,
  );
  mesh.rotation.z = (Math.random() - 0.5) * 0.12;

  _scene.add(mesh);
  _active.push({
    mesh, mat, geo,
    born:     performance.now(),
    life:     4000 + Math.random() * 1500,
    vx:       (Math.random() - 0.5) * 0.0025,
    vy:       0.003 + Math.random() * 0.004,
  });
}

export function updateWordCloud() {
  const now = performance.now();
  for (let i = _active.length - 1; i >= 0; i--) {
    const e = _active[i];
    const t = (now - e.born) / e.life;
    if (t >= 1) {
      _scene.remove(e.mesh);
      e.geo.dispose();
      e.mat.dispose();
      _active.splice(i, 1);
      continue;
    }
    // fade out in final 35%
    e.mat.opacity = t < 0.65 ? 0.80 : 0.80 * (1 - (t - 0.65) / 0.35);
    e.mesh.position.x += e.vx;
    e.mesh.position.y += e.vy;
  }
}
