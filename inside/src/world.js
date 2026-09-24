// The world. Three things in it: a field that closes around the viewer,
// figures standing in it at every bearing and height, and the booth in the
// middle of it all, which the field bends round.
//
// Nothing is lit. The field is its own light and the figures are shaded
// from the same field, sampled along the direction they are seen from, so
// a body and the space behind it are reading the same values at the same
// point. That is what makes them part of it rather than in front of it.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { UNIFORMS, HELPERS, fieldBody, skyFragment, skyVertex } from './shaders.js';
import { createBooth } from './booth.js';

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
  // Lensed like the field behind them, so a body passing the booth is
  // still reading the same values as the space it stands in.
  vec3 dir = lens(normalize(vWorld - cameraPosition));
  vec2 p = mapDir(dir) + gazePush(dir);

  // The body's sampling drifts through the same flow as everything else,
  // smooth and continuous. Nothing steps and nothing is cut.
  p += curl(p * 0.75, uTime * 0.05) * (0.04 + uFlux * 0.4);

  // The judder, on the figures given one. Stepped in time and cut into
  // slabs, the way the warehouse did it, so it snaps rather than sways.
  // Gated, so the rest of them stay smooth and the field never does any
  // of this: it is the bodies coming apart, not the world.
  if (uShake > 0.001){
    float st = floor(uTime * 11.0);
    float slab = floor(vWorld.y * 8.0 + st * 0.4);
    float g = hash11(slab * 3.7 + st * 1.3 + uSeed);
    p += vec2(g - 0.5, fract(g * 17.3) - 0.5) * uShake * 0.8;
    if (g < uShake * 0.13) discard;
  }

  // Refraction. Without this a translucent body shows the same field as
  // the space behind it and disappears completely against anything busy.
  // Bending the sample by the surface is what separates the two, and it
  // reads as glass rather than as a hole.
  p += normal.xy * (0.22 + uFlux * 0.18);

  float v = clamp(field(p), 0.0, 1.0);

  float face = clamp(normal.z, 0.0, 1.0);
  float rim = pow(1.0 - abs(normal.z), 2.5);

  // Eaten into at two scales, so they come apart in sections and you can
  // see the field, and each other, through the gaps.
  float e1 = turb(p * 1.3 + uTime * 0.12);
  float e2 = turb(p * 4.0 - uTime * 0.26);
  float er = e1 * 0.62 + e2 * 0.45;
  float keep = smoothstep(0.02 + uFlux * 0.1, 0.4 + uFlux * 0.08, er);
  if (keep < 0.08) discard;

  // The edge runs as well as breaking. A flow through the threshold makes
  // the outline ripple along its own length, so it is never a line that is
  // simply eaten into in places.
  vec2 edgeFlow = curl(p * 2.1 + vWorld.y * 0.5, uTime * 0.09);
  float brk = smoothstep(0.14, 0.5, e2 * 0.85 + e1 * 0.3 + (edgeFlow.x + edgeFlow.y) * 0.2);
  rim *= 0.3 + brk * 1.35;
  float body = face * 0.5 + rim * 0.8;

  // Fresnel. Thin where the surface faces you, dense where it turns away,
  // which is how anything translucent actually behaves and the reason a
  // body stops reading as a solid the moment it is applied.
  float fres = pow(1.0 - abs(normal.z), 3.0);
  // A single narrow highlight, the thing that says polished rather than
  // matte. No broad facing term anywhere below: a term that barely varies
  // across the body is exactly what comes out as flat grey.
  float spec = smoothstep(0.86, 0.995, face);

  // Metal: the facing term cut into hard bands.
  float band = fract(face * 4.0 + rim * 1.6 - uTime * 0.25);
  float chrome = smoothstep(0.3, 0.46, band) * (1.0 - smoothstep(0.54, 0.72, band));
  float mMetal = v * 0.3 + chrome * (0.75 + uHit * 0.35) + rim * 0.5;

  // Glass: the field showing through almost untouched, held together by
  // the edge and the highlight alone.
  float mShell = v * (0.78 + body * 0.3) + rim * (1.05 + uHit * 0.45) + spec * 0.55;

  // Etched: contour across the form, interior left open.
  float et = fract(face * 7.0 - rim * 2.0 + uTime * 0.14);
  float etch = (1.0 - smoothstep(0.0, 0.11, abs(et - 0.5))) * (0.62 + uTreble * 0.45);
  float mEtch = v * 0.6 + etch * 1.15 + rim * 0.6 + spec * 0.3;

  float wMetal = 1.0 - smoothstep(0.12, 0.34, uTreat);
  float wEtch = smoothstep(0.66, 0.88, uTreat);
  float wShell = clamp(1.0 - wMetal - wEtch, 0.0, 1.0);

  float lit = (mMetal * wMetal + mShell * wShell + mEtch * wEtch) * keep;

  // Actually transparent, not merely dark. The field behind a body reads
  // straight through the middle of it and the form is carried by the edge,
  // the highlight and whatever the field is doing underneath.
  float alpha = clamp(0.34 + fres * 0.85 + spec * 0.8 + chrome * wMetal * 0.55, 0.0, 1.0) * keep;
  gl_FragColor = vec4(vec3(clamp(lit, 0.0, 1.0) * uGain), alpha);
`;

function figureMaterial(shaderName, shared){
  const material = new THREE.MeshNormalMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    // Off, or a near figure punches a hole in every one behind it. The
    // slots are drawn back to front below instead.
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);

    shader.vertexShader =
      'varying vec3 vWorld;\nuniform float uTime, uFlux, uShake, uSeed;\n' +
      'float vhash(float n){ return fract(sin(n) * 43758.5453123); }\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        // After skinning, so a posed limb is shaded and sliced where it
        // actually is. Slicing the geometry rather than only the shading
        // is what makes the break look like the body came apart.
        `{
           // A wave travelling up the body, two rates so it never settles
           // into a single rhythm. Continuous: the geometry bends rather
           // than breaking into offset slabs.
           float h = transformed.y;
           float w = sin(h * 3.1 - uTime * 1.5) * 0.6 + sin(h * 1.6 + uTime * 0.8) * 0.4;
           transformed.x += w * uFlux * 0.3;
           transformed.z += cos(h * 2.4 - uTime * 1.1) * uFlux * 0.22;

           // And the judder, for the ones given one: the whole body
           // displaced in steps, and slabs of it thrown further.
           if (uShake > 0.001){
             float st = floor(uTime * 11.0);
             float j = vhash(st * 1.7 + uSeed);
             transformed.x += (j - 0.5) * uShake * 0.2;
             transformed.y += (fract(j * 13.7) - 0.5) * uShake * 0.1;
             float sl = floor(h * 7.0 + st * 0.3);
             transformed.x += (vhash(sl * 3.1 + st * 2.7 + uSeed) - 0.5) * uShake * 0.34;
           }
         }
         vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         #include <project_vertex>`
      );

    shader.fragmentShader =
      'varying vec3 vWorld;\nuniform float uTreat, uFlux, uShake, uSeed;\n' +
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
  // The booth is meshopt compressed. The decoder is vendored like the rest.
  loader.setMeshoptDecoder(MeshoptDecoder);
  const cfg = config.dancers;

  // A booth that fails to load leaves the world as it was rather than
  // leaving nothing at all.
  const [boothGltf, ...gltfs] = await Promise.all([
    load(loader, config.booth.model).catch((err) => {
      console.warn(`booth model not available (${config.booth.model})`, err);
      return null;
    }),
    ...cfg.sources.map((s) => load(loader, s.model)),
  ]);

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
    // Set per figure, between draws. It has to exist before the materials
    // compile: onBeforeCompile copies this object at compile time and a key
    // added afterwards is never bound to anything.
    uTreat:  { value: 0.5 },
    // Per figure, set between draws like uTreat. How far this one moves
    // with the flow. The giants run far higher.
    uFlux:   { value: 0.3 },
    uShake:  { value: 0 },
    uSeed:   { value: 0 },
    uDetail: { value: 0.4 },
    uOrigin: { value: new THREE.Vector2() },
    // Set from the booth every frame. Zero mass until it exists, so the
    // field is untouched if it never loads.
    uLensDir:   { value: new THREE.Vector3(0, 0, -1) },
    uLensSize:  { value: 0 },
    uLensMass:  { value: 0 },
    uLensSwirl: { value: 0 },
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

  // --- the booth ------------------------------------------------------
  const booth = boothGltf
    ? createBooth(boothGltf, config.booth, shared, first)
    : null;
  if (booth) scene.add(booth.group);

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
    // A couple of them are enormous and come apart badly. They read as
    // structure you are standing inside rather than as another figure.
    const giant = i < cfg.giants;
    slots.push({
      // Kept, because the slots are re-sorted by distance every frame and
      // which ones are present has to be decided on something stable.
      index: i,
      source: pool[(i * 5 + Math.floor(a * 11)) % pool.length],
      treat: cfg.treatments[i % cfg.treatments.length],
      flux: giant ? cfg.giantFlux : cfg.flux * (0.6 + a * 0.8),
      // Every nth one judders. The giants are left out: at their size the
      // displacement reads as the whole world jumping.
      shake: (!giant && i % cfg.shakeEvery === 0) ? cfg.shake * (0.7 + a * 0.6) : 0,
      seed: i * 37.1 + a * 91.3,
      angle: (i / cfg.count) * Math.PI * 2 + a * 0.6,
      radius: giant ? cfg.far * (1.1 + a * 0.5) : cfg.near + a * (cfg.far - cfg.near),
      y: giant ? (b - 0.4) * cfg.rise : (b - 0.55) * cfg.rise * 2,
      scale: cfg.height * (giant ? cfg.giantScale * (0.8 + b * 0.5) : 0.8 + b * 0.5),
      spin: (a - 0.5) * 2 * cfg.spin,
      orbit: cfg.orbit * (0.5 + b) * (i % 2 ? 1 : -1),
      phase: a * 6.283 + i * 1.7,
      tumble: (b - 0.5) * cfg.tumble,
    });
  }

  // What the current track wants the world to be like. Defaults are the
  // identity, so a track with no scene behaves as it did before.
  let scene2 = { figures: 1, scale: 1, detail: 0.4, spin: 1, shake: 1 };
  function setScene(next){
    scene2 = Object.assign({}, scene2, next || {});
    if (booth) booth.setLook(next && next.booth);
  }

  function setShader(name){
    sky.material.fragmentShader = skyFragment(name);
    sky.material.needsUpdate = true;
    // The booth reflects it and the figures carry it, so both recompile.
    if (booth) booth.setShader(name);
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

    // How many of them this track wants. Decided on the stable index, not
    // on the draw order, or the set would change every time they sort.
    const live = Math.max(1, Math.round(slots.length * scene2.figures));

    // Transparent figures have to be drawn back to front, so the order is
    // worked out first and the positions reused rather than recomputed.
    for (const slot of slots){
      slot.angle += slot.orbit * 0.016 * scene2.spin;
      slot.px = Math.cos(slot.angle) * slot.radius;
      slot.pz = Math.sin(slot.angle) * slot.radius;
      const dx = slot.px - camera.position.x;
      const dy = (slot.y - slot.scale * 0.5) - camera.position.y;
      const dz = slot.pz - camera.position.z;
      slot.dist = dx * dx + dy * dy + dz * dz;
    }
    slots.sort((a, b) => b.dist - a.dist);

    for (const slot of slots){
      if (slot.index >= live) continue;
      const src = slot.source;
      if (src.mixer && src.duration > 0) src.mixer.setTime((time + slot.phase) % src.duration);

      src.holder.position.set(slot.px, slot.y - slot.scale * 0.5, slot.pz);
      src.holder.rotation.set(
        Math.sin(time * 0.3 + slot.phase) * slot.tumble,
        slot.phase + time * slot.spin * scene2.spin,
        Math.sin(time * 0.23 + slot.phase) * slot.tumble
      );
      src.holder.scale.setScalar(slot.scale * scene2.scale);
      shared.uTreat.value = slot.treat;
      shared.uFlux.value = slot.flux;
      shared.uShake.value = slot.shake * scene2.shake;
      shared.uSeed.value = slot.seed;
      renderer.render(src.sub, camera);
    }

    renderer.autoClear = previous;
  }

  // What the booth is doing this frame, for anything downstream that wants
  // to move with it.
  const quiet = { ring: 0, connect: 0 };

  function update(time, audio, pointer, look, camera, state){
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
    shared.uDetail.value = scene2.detail;
    return booth && camera ? booth.update(time, audio, camera, state || {}) : quiet;
  }

  // Where in the field this visitor's world sits. Set once, from their
  // connection, and never stored anywhere.
  function setOrigin(x, y){ shared.uOrigin.value.set(x, y); }

  return { scene, sky, booth, setShader, setScene, setOrigin, update, renderFigures, shared };
}
