import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from './config.js';
import { createRenderer, buildWorld } from './world.js';
import { createInteractions } from './interactions.js';
import { createDial } from './dial.js';
import { readConnection, renderConnection } from './net.js';

// Matches the SCAN_HOTSPOTS midpoint in world.js — the visitor orbits
// around the phone unit, not the booth's geometric center.
const ORBIT_TARGET = new THREE.Vector3(-0.04, 1.4, 0.3);

function createOrbitControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.target.copy(ORBIT_TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.53; // stop just past level, keep floor out of view
  controls.update();
  return controls;
}

async function main() {
  const canvas = document.createElement('canvas');
  document.body.prepend(canvas);

  const renderer = createRenderer(canvas);
  const { scene, camera, booth } = await buildWorld(config, renderer);
  const controls = createOrbitControls(camera, renderer.domElement);

  const dial = createDial(config, {
    onConnect: (entry) => console.log('connected:', entry),
    onInvalid: (digits) => console.log('no line at', digits),
  });

  const interactions = createInteractions(camera, booth, config, {
    onHover: (part) => part && console.log('hover:', part),
    onSelect: (part) => console.log('select:', part),
  });
  interactions.attach(canvas);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const readoutEl = document.getElementById('readout');
  readConnection()
    .then((connection) => renderConnection(readoutEl, connection))
    .catch((err) => console.warn('connection readout unavailable', err));

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
}

main().catch((err) => console.error('main failed:', err));
