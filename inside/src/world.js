// The world. Two things in it: a field that closes around the viewer, and
// figures standing in it at every bearing and height.
//
// Nothing is lit. The field is its own light and the figures are shaded
// from the same field, sampled along the direction they are seen from, so
// a body and the space behind it are reading the same values at the same
// point. That is what makes them part of it rather than in front of it.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { UNIFORMS, HELPERS, fieldBody, skyFragment, skyVertex } from './shaders.js';

function load(loader, url){
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

// Feet on the floor, centred, one unit tall, through the node transform so
// the skeletons are untouched.
function normalise(root){
  root.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(root);
  const height = Math.max(box.getSize(new THREE.Vector3()).y, 1e-6);
  root.scale.multiplyScalar(1 / height);
  root.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.y -= box.min.y;
}

// The figures' material. MeshNormalMaterial carries Three's own skinning,
// which a hand-written ShaderMaterial would have to reimplement, and its
// view-space normal gives facing and silhouette for free. Everything else
// is injected: the field, so a body is shaded by the space it stands in,
// and the erosion that opens holes through it.
const FIGURE_FRAG = /* glsl */ `
  vec3 dir = normalize(vWorld - cameraPosition);
  vec2 p = mapDir(dir) + gazePush(dir);
  float v = clamp(field(p), 0.0, 1.0);

  float face = clamp(normal.z, 0.0, 1.0);
  float rim = pow(1.0 - abs(normal.z), 2.5);

  // Eaten into at two scales, so they come apart in sections and you can
  // see the field, and each other, through the gaps.
  float e1 = turb(p * 1.3 + uTime * 0.12);
  float e2 = turb(p * 4.0 - uTime * 0.26);
  float er = e1 * 0.62 + e2 * 0.45;
  float keep = smoothstep(0.02, 0.4, er);
  if (keep < 0.08) discard;

  float brk = smoothstep(0.14, 0.5, e2 * 0.85 + e1 * 0.3);
  rim *= 0.3 + brk * 1.3;
  float body = face * 0.5 + rim * 0.8;

  // Metal: the facing term cut into hard bands, which is what reads as
  // polished rather than lit.
  float band = fract(face * 4.0 + rim * 1.6 - uTime * 0.25);
  float chrome = smoothstep(0.3, 0.46, band) * (1.0 - smoothstep(0.54, 0.72, band));
  float mMetal = v * 0.32 + chrome * (0.7 + uHit * 0.35) + rim * 0.45;

  // Shell: the field almost untouched inside, silhouette carrying it.
  float mShell = v * (0.92 + body * 0.35) + rim * (1.0 + uHit * 0.45) + face * 0.16;

  // Etched: contour across the form, interior left open.
  float et = fract(face * 7.0 - rim * 2.0 + uTime * 0.14);
  float etch = (1.0 - smoothstep(0.0, 0.11, abs(et - 0.5))) * (0.62 + uTreble * 0.45);
  float mEtch = v * 0.72 + etch * 1.2 + rim * 0.55;

  float wMetal = 1.0 - smoothstep(0.12, 0.34, uTreat);
  float wEtch = smoothstep(0.66, 0.88, uTreat);
  float wShell = clamp(1.0 - wMetal - wEtch, 0.0, 1.0);

  float lit = (mMetal * wMetal + mShell * wShell + mEtch * wEtch) * keep;
  gl_FragColor = vec4(vec3(clamp(lit, 0.0, 1.0) * uGain), 1.0);
`;

function figureMaterial(shaderName, shared){
  const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);

    shader.vertexShader = 'varying vec3 vWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      // After skinning, so a posed limb is shaded where it actually is.
      'vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
    );

    shader.fragmentShader =
      'varying vec3 vWorld;\nuniform float uTreat;\n' +
      UNIFORMS + HELPERS + fieldBody(shaderName) +
      shader.fragmentShader.replace(
        'gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );',
        FIGURE_FRAG
      );
  };
  return material;
}

export async function buildWorld(renderer, config, onProgress){
  const manager = new THREE.LoadingManager();
  if (onProgress){
    manager.onProgress = (url, loaded, total) => onProgress(loaded / Math.max(total, 1));
    manager.onLoad = () => onProgress(1);
  }
  const loader = new GLTFLoader(manager);
  const cfg = config.dancers;

  const gltfs = await Promise.all(cfg.sources.map((s) => load(loader, s.model)));

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
    // Set per figure, between draws. It has to exist before the materials
    // compile: onBeforeCompile copies this object at compile time and a key
    // added afterwards is never bound to anything.
    uTreat:  { value: 0.5 },
  };

  // --- the field that closes around the viewer -------------------------
  const first = config.tracks[0].shader;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(200, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment(first),
      uniforms: shared,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // --- the figures -----------------------------------------------------
  const sources = [];
  const pool = [];
  for (let i = 0; i < gltfs.length; i++){
    const gltf = gltfs[i];
    const root = gltf.scene;
    normalise(root);

    const material = figureMaterial(first, shared);
    root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh){ o.material = material; o.frustumCulled = false; }
    });

    const holder = new THREE.Group();
    holder.add(root);
    const sub = new THREE.Scene();
    sub.add(holder);

    let mixer = null, duration = 0;
    if (gltf.animations.length){
      mixer = new THREE.AnimationMixer(root);
      const clip = gltf.animations[0];
      duration = clip.duration;
      mixer.clipAction(clip).play();
    }

    const source = { holder, sub, mixer, duration, material };
    sources.push(source);
    for (let w = 0; w < (cfg.sources[i].weight || 1); w++) pool.push(source);
  }

  // One slot per figure, scattered round the viewer at every bearing.
  // Fixed pseudo-random rather than Math.random, so a given build is the
  // same arrangement every time.
  const slots = [];
  for (let i = 0; i < cfg.count; i++){
    const a = Math.abs(Math.sin(i * 127.1 + 4.7) * 43758.5453) % 1;
    const b = Math.abs(Math.sin(i * 311.7 + 9.2) * 24634.6345) % 1;
    slots.push({
      source: pool[(i * 5 + Math.floor(a * 11)) % pool.length],
      treat: cfg.treatments[i % cfg.treatments.length],
      angle: (i / cfg.count) * Math.PI * 2 + a * 0.6,
      radius: cfg.near + a * (cfg.far - cfg.near),
      y: (b - 0.55) * cfg.rise * 2,
      scale: cfg.height * (0.8 + b * 0.5),
      spin: (a - 0.5) * 2 * cfg.spin,
      orbit: cfg.orbit * (0.5 + b) * (i % 2 ? 1 : -1),
      phase: a * 6.283 + i * 1.7,
      tumble: (b - 0.5) * cfg.tumble,
    });
  }

  function setShader(name){
    sky.material.fragmentShader = skyFragment(name);
    sky.material.needsUpdate = true;
    // The figures carry the field too, so they recompile with it.
    for (const s of sources){
      s.material.dispose();
      const next = figureMaterial(name, shared);
      s.holder.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.material = next; });
      s.material = next;
    }
  }

  // Each slot is a separate draw of its source at its own point in the
  // clip, which is why no skeleton is ever cloned.
  function renderFigures(renderer, camera, time, audio){
    // The sky is already down and each figure is its own draw, so nothing
    // here may clear. Depth carries between them so they occlude properly.
    const previous = renderer.autoClear;
    renderer.autoClear = false;

    for (const slot of slots){
      const src = slot.source;
      if (src.mixer && src.duration > 0) src.mixer.setTime((time + slot.phase) % src.duration);

      slot.angle += slot.orbit * 0.016;
      const x = Math.cos(slot.angle) * slot.radius;
      const z = Math.sin(slot.angle) * slot.radius;

      src.holder.position.set(x, slot.y - slot.scale * 0.5, z);
      src.holder.rotation.set(
        Math.sin(time * 0.3 + slot.phase) * slot.tumble,
        slot.phase + time * slot.spin,
        Math.sin(time * 0.23 + slot.phase) * slot.tumble
      );
      src.holder.scale.setScalar(slot.scale);
      shared.uTreat.value = slot.treat;
      renderer.render(src.sub, camera);
    }

    renderer.autoClear = previous;
  }

  function update(time, audio, pointer, look){
    const k = config.field.react;
    shared.uTime.value = time;
    shared.uLevel.value = audio.level * k;
    shared.uBass.value = audio.bass * k;
    shared.uTreble.value = audio.treble * k;
    shared.uHit.value = audio.hit * k;
    if (look) shared.uLook.value.copy(look);
    shared.uReach.value = pointer ? pointer.vel * config.view.reach : 0;
  }

  return { scene, sky, setShader, update, renderFigures, shared };
}
