// The world. Two things in it: a field that closes around the viewer, and
// the scan of the underside of a bridge standing in the middle of it.
//
// The field is its own light, as in the inside world. The scan is a
// Gaussian splat: a cloud of soft, coloured, semi-transparent blobs that
// together look like the place they were captured from. It is drawn after
// the field, so the field shows through wherever the scan runs out.

import * as THREE from 'three';
import { DropInViewer, LogLevel, SceneRevealMode } from 'gaussian-splats-3d';
import { skyFragment, skyVertex } from './shaders.js';

export async function buildWorld(renderer, config, onProgress){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const shared = {
    uTime:   { value: 0 },
    uLevel:  { value: 0 },
    uBass:   { value: 0 },
    uTreble: { value: 0 },
    uHit:    { value: 0 },
    uGain:   { value: config.field.gain },
    uLook:   { value: new THREE.Vector3(0, 0, -1) },
    uReach:  { value: 0 },
    uFlow:   { value: 0 },
    uDetail: { value: 0.4 },
    uOrigin: { value: new THREE.Vector2() },
  };

  // --- the field that closes around the viewer -------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment(config.tracks[0].shader),
      uniforms: shared,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // --- the scan ---------------------------------------------------------
  // Drawn by GaussianSplats3D, vendored, in drop-in mode: it renders inside
  // this scene's own render call, into the grade's target like everything
  // else, rather than owning a canvas. Shared memory is off because it
  // needs headers GitHub Pages cannot send; the sort runs in a worker
  // either way. Colour beyond the base is left out, since the grade takes
  // every colour out regardless.
  const cfg = config.scan;
  const scan = new DropInViewer({
    sharedMemoryForWorkers: false,
    sphericalHarmonicsDegree: 0,
    dynamicScene: false,
    freeIntermediateSplatData: true,
    // All at once. Its own fade-in grows the scene out from the middle,
    // which behind the loading screen's fade reads as something broken.
    sceneRevealMode: SceneRevealMode.Instant,
    logLevel: LogLevel.None,
  });
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(cfg.rotation[0]),
    THREE.MathUtils.degToRad(cfg.rotation[1]),
    THREE.MathUtils.degToRad(cfg.rotation[2]),
    'XYZ'
  ));
  try {
    await scan.addSplatScene(cfg.model, {
      showLoadingUI: false,
      progressiveLoad: false,
      position: cfg.position,
      rotation: turn.toArray(),
      scale: [cfg.scale, cfg.scale, cfg.scale],
      splatAlphaRemovalThreshold: cfg.alphaCut,
      onProgress: (percent) => { if (onProgress) onProgress(percent / 100); },
    });
    scene.add(scan);
  } catch (err) {
    // The field and the player still work without it.
    console.warn(`scan not available (${cfg.model})`, err);
  }
  if (onProgress) onProgress(1);

  let current = { detail: 0.4 };
  function setScene(next){ current = Object.assign({}, current, next || {}); }

  function setShader(name){
    sky.material.fragmentShader = skyFragment(name);
    sky.material.needsUpdate = true;
  }

  function update(time, audio, pointer, look){
    const k = config.field.react;
    shared.uTime.value = time;
    shared.uLevel.value = audio.level * k;
    shared.uBass.value = audio.bass * k;
    shared.uTreble.value = audio.treble * k;
    shared.uHit.value = audio.hit * k;
    if (look) shared.uLook.value.copy(look);
    const moved = pointer ? pointer.vel : 0;
    const v = config.view;
    shared.uReach.value = moved * v.reach;
    shared.uFlow.value = v.flow + audio.hit * v.flowHit + moved * v.flowReach;
    shared.uDetail.value = current.detail;
  }

  // Where in the field this visitor's world sits. Set once, from their
  // connection, and never stored anywhere.
  function setOrigin(x, y){ shared.uOrigin.value.set(x, y); }

  return { scene, sky, scan, setShader, setScene, setOrigin, update, shared };
}
