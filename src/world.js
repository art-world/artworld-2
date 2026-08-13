// Builds the scene from config. Cheap geometry lit like a luxury product:
// nearest-neighbour filtering for crunchy surfaces, HDR environment maps for
// expensive reflections.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

function applyNearestFiltering(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        const tex = material[key];
        if (tex) {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestMipmapNearestFilter;
        }
      }
    }
  });
}

function placeholderBooth(config) {
  const group = new THREE.Group();
  group.name = 'booth-placeholder';

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.35 }),
  );
  shell.position.y = 1.2;
  group.add(shell);

  const partDefs = [
    { name: 'Handset', position: [0.35, 1.6, 0.6], size: [0.5, 0.15, 0.15] },
    { name: 'Keypad', position: [0, 1.1, 0.61], size: [0.3, 0.3, 0.02] },
  ];
  for (const def of partDefs) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...def.size),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.4, roughness: 0.5 }),
    );
    mesh.name = def.name;
    mesh.position.fromArray(def.position);
    group.add(mesh);
  }

  return group;
}

// assets/models/booth.glb is a single fused scan mesh with no named parts.
// These invisible boxes stand in as raycast targets for config.parts until
// the model gets a real retopo/part-split pass. Positions were sampled by
// raycasting into the loaded scan in the browser, not measured by hand — if
// the booth model changes, these need resampling. No "Door": this scan is
// an open alcove with no separate door leaf.
const SCAN_HOTSPOTS = [
  { name: 'Handset', position: [-0.04, 1.55, 0.41], size: [0.34, 0.32, 0.14] },
  { name: 'Keypad', position: [-0.04, 1.27, 0.38], size: [0.32, 0.24, 0.14] },
];

function addScanHotspots(root) {
  for (const def of SCAN_HOTSPOTS) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...def.size));
    mesh.name = def.name;
    mesh.position.fromArray(def.position);
    mesh.visible = false;
    root.add(mesh);
  }
}

async function loadBooth(config, scene) {
  try {
    const gltf = await gltfLoader.loadAsync(config.booth.model);
    applyNearestFiltering(gltf.scene);
    addScanHotspots(gltf.scene);
    scene.add(gltf.scene);
    return gltf.scene;
  } catch (err) {
    console.warn(`booth model not available (${config.booth.model}), using placeholder`, err);
    const placeholder = placeholderBooth(config);
    scene.add(placeholder);
    return placeholder;
  }
}

async function loadEnvironment(config, renderer, scene) {
  try {
    const hdr = await new RGBELoader().loadAsync(config.booth.env);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.background = null;
  } catch (err) {
    console.warn(`environment map not available (${config.booth.env}), using flat background`, err);
    scene.background = new THREE.Color(0x050505);
  }
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 4);
  return camera;
}

export async function buildWorld(config, renderer) {
  const scene = new THREE.Scene();
  const camera = createCamera();

  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 3, 2);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));

  await loadEnvironment(config, renderer, scene);
  const booth = await loadBooth(config, scene);

  return { scene, camera, booth };
}
