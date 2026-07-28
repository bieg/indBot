import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const BLOOM_LAYER = 1;

let renderer, camera, scene;
let bloomComposer, finalComposer;
const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const materialCache = new Map();

const CAMERA_Z = 10;
const FOV = 50;

export function initScene() {
  const canvas = document.getElementById('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  scene = new THREE.Scene();

  // lights for Solly's 3D MeshStandardMaterial
  scene.add(new THREE.AmbientLight(0x223344, 1.5));
  const keyLight = new THREE.PointLight(0xffd76a, 4, 20);
  keyLight.position.set(3, 4, 6);
  scene.add(keyLight);

  _buildBloomComposer();
  window.addEventListener('resize', _onResize);

  return { renderer, camera, scene };
}

function _buildBloomComposer() {
  const w = window.innerWidth, h = window.innerHeight;

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.4, 0.25);

  bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  bloomComposer.addPass(bloomPass);

  const finalPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(baseTexture, vUv) + vec4(1.0) * texture2D(bloomTexture, vUv);
        }
      `,
      defines: {},
    }),
    'baseTexture'
  );
  finalPass.needsSwap = true;

  finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(finalPass);
}

function _onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  bloomComposer.setSize(w, h);
  finalComposer.setSize(w, h);
}

export function render() {
  _darkenNonBloomed();
  camera.layers.set(BLOOM_LAYER);
  bloomComposer.render();
  _restoreMaterials();
  camera.layers.enableAll();
  finalComposer.render();
}

function _darkenNonBloomed() {
  scene.traverse(obj => {
    if (obj.isMesh && !obj.layers.isEnabled(BLOOM_LAYER)) {
      materialCache.set(obj, obj.material);
      obj.material = blackMat;
    }
  });
}

function _restoreMaterials() {
  materialCache.forEach((mat, obj) => { obj.material = mat; });
  materialCache.clear();
}

export function getScene() { return scene; }
export function getCamera() { return camera; }

const WORLD_SCALE = 0.6; // compress hand-to-world mapping so closer hands still work

export function mpToWorld(mpX, mpY, z = 0) {
  const aspect = window.innerWidth / window.innerHeight;
  const vHalfH = Math.tan((FOV * Math.PI / 180) / 2) * CAMERA_Z;
  const vHalfW = vHalfH * aspect;
  const wx = (1 - mpX - 0.5) * vHalfW * 2 * WORLD_SCALE;
  const wy = -(mpY - 0.5) * vHalfH * 2 * WORLD_SCALE;
  return new THREE.Vector3(wx, wy, z);
}
