// The room. Built from the models at load time: nothing about their size or
// orientation is hardcoded here, it is measured and normalised.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fragmentShader, vertexShader } from './shaders.js';

// Cheap geometry lit like a luxury product: the textures stay crunchy,
// the lighting does the work.
function crunch(map){
  if (!map) return map;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

// A small equirectangular map: black, with one soft lobe where the
// projection stands. The wet floor has something to reflect and it is
// generated here rather than shipped as an HDR.
function projectionEnvironment(renderer){
  const w = 128, h = 64;
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      // The wall sits at -z from the room, which lands at u = 0.25.
      let du = Math.abs(u - 0.25);
      du = Math.min(du, 1 - du);
      const lobe = Math.exp(-(du * du) / 0.006) * Math.exp(-((v - 0.52) ** 2) / 0.03);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = lobe * 3.0;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function load(loader, url){
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

// Rotate and translate a model so its longest horizontal axis runs along +z,
// its floor sits at y = 0, and it is centred on x = 0 with the near end
// of that axis at z = 0. Returns the measured room.
function normaliseRoom(root){
  root.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());

  // If the model is longer across x than z, turn it a quarter turn.
  if (size.x > size.z){
    root.rotation.y += Math.PI / 2;
    root.updateWorldMatrix(true, true);
    box = new THREE.Box3().setFromObject(root);
    box.getSize(size);
  }

  const centre = box.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.y -= box.min.y;
  root.position.z -= box.min.z;
  root.updateWorldMatrix(true, true);

  const near = Math.min(1.2, size.z * 0.06);
  return {
    width: size.x,
    halfWidth: size.x / 2,
    height: size.y,
    depth: size.z,
    // Keep the camera off the projection.
    near,
    // Clamp a distance in metres from the projection into the room, so the
    // camera moves read the same whether the room is 20m long or 60m.
    at: (metres) => Math.max(near, Math.min(size.z * 0.98, metres)),
  };
}


// Dancers rendered offscreen, then handed to every shader as a texture.
//
// Three sources, mixed at random across the slots. Two carry their own
// skeletal animation; the third has no skeleton at all, so its movement is
// vertex deformation injected with onBeforeCompile: a twist increasing up
// the spine, a hip sway the torso leans against, and a wave travelling up.
//
// The material is MeshNormalMaterial rather than anything custom, because
// Three's own skinning chunks come with it for free and a hand-written
// ShaderMaterial would have to reimplement them. It gives the projection
// exactly what it needs anyway: rgb is the view-space normal, from which
// facing and silhouette both fall out, and alpha is coverage.
const DEFORM = /* glsl */ `
{
  float h = clamp(transformed.y, 0.0, 1.0);
  float beat = uTime * (2.0 + uLevel * 2.2) + uPhase;

  // Shoulders lead the hips.
  float tw = sin(beat * 0.5) * uTwist * (0.55 + uBass * 0.9) * h;
  transformed.xz = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * transformed.xz;

  // Hip travel, torso leaning back against it.
  transformed.x += sin(beat) * uSway * (0.25 + h * 0.9);
  transformed.x -= sin(beat * 0.5) * uSway * 0.5 * h;

  // A wave up the body, so nothing moves as a rigid block.
  transformed.x += sin(beat - h * 4.2) * 0.05 * (0.25 + uLevel * 0.8);
  transformed.z += cos(beat * 0.9 - h * 3.4) * 0.045 * (0.25 + uLevel * 0.8);

  // Weight dropping on the beat.
  transformed.y -= abs(sin(beat)) * 0.055;
}
`;

function dancerMaterial(deformUniforms, treatUniform){
  const material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTreat = treatUniform;

    // The packed normal is more than the projection needs. Facing and
    // silhouette are all it reads, which frees the blue channel to carry
    // how this figure should be treated: metal, glass or glitching
    // negative. One shared uniform is enough because the slots are drawn
    // one after another.
    shader.fragmentShader =
      'uniform float uTreat;\n' +
      shader.fragmentShader.replace(
        'gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );',
        'float face = clamp( normal.z, 0.0, 1.0 );\n' +
        '\tfloat rimv = pow( 1.0 - abs( normal.z ), 2.5 );\n' +
        '\tgl_FragColor = vec4( face, rimv, uTreat, 1.0 );'
      );

    if (deformUniforms){
      Object.assign(shader.uniforms, deformUniforms);
      shader.vertexShader =
        'uniform float uTime, uLevel, uBass, uPhase, uTwist, uSway;\n' +
        shader.vertexShader.replace('#include <begin_vertex>',
                                    '#include <begin_vertex>\n' + DEFORM);
    }
  };
  return material;
}

// Feet on the floor, centred, one unit tall. Skinned sources are normalised
// through the node transform; the unskinned one has it baked into the
// geometry, because the deformation above reads transformed.y as height and
// that only holds if the positions themselves are normalised.
function prepareSource(gltf, entry, deformUniforms, treatUniform){
  const root = gltf.scene;
  root.updateWorldMatrix(true, true);

  let box = new THREE.Box3().setFromObject(root);
  const height = Math.max(box.getSize(new THREE.Vector3()).y, 1e-6);
  const material = dancerMaterial(entry.deform ? deformUniforms : null, treatUniform);

  if (entry.deform){
    let mesh = null;
    root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return null;
    // The mesh's own world matrix, not the root's: the Z-up to Y-up
    // rotation lives on the chain between them.
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    geometry.translate(-c.x, -b.min.y, -c.z);
    geometry.scale(1 / size.y, 1 / size.y, 1 / size.y);
    geometry.computeVertexNormals();

    const holder = new THREE.Group();
    const body = new THREE.Mesh(geometry, material);
    body.frustumCulled = false;
    holder.add(body);
    const scene = new THREE.Scene();
    scene.add(holder);
    return { holder, scene, mixer: null, duration: 0 };
  }

  root.scale.multiplyScalar(1 / height);
  root.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box.min.y;

  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh){ o.material = material; o.frustumCulled = false; }
  });

  const holder = new THREE.Group();
  holder.add(root);
  const scene = new THREE.Scene();
  scene.add(holder);

  let mixer = null, duration = 0;
  if (gltf.animations.length){
    mixer = new THREE.AnimationMixer(root);
    const clip = gltf.animations[0];
    duration = clip.duration;
    mixer.clipAction(clip).play();
  }
  return { holder, scene, mixer, duration };
}

function createDancers(renderer, gltfs, config, aspect){
  const cfg = config.dancers;

  const deformUniforms = {
    uTime:  { value: 0 }, uLevel: { value: 0 }, uBass: { value: 0 },
    uPhase: { value: 0 },
    uTwist: { value: cfg.twist }, uSway: { value: cfg.sway },
  };

  const treatUniform = { value: 0.5 };

  const sources = [];
  const pool = [];              // one entry per unit of weight
  for (let i = 0; i < gltfs.length; i++){
    const entry = cfg.sources[i];
    const src = prepareSource(gltfs[i], entry, deformUniforms, treatUniform);
    if (!src) continue;
    sources.push(src);
    for (let w = 0; w < (entry.weight || 1); w++) pool.push(src);
  }
  if (!sources.length) return null;

  const camera = new THREE.PerspectiveCamera(cfg.camera.fov, aspect, 0.1, 60);
  const height = Math.max(64, Math.round(cfg.width / aspect));
  const target = new THREE.WebGLRenderTarget(cfg.width, height, {
    samples: 4,               // the silhouette is the whole point, so AA it
    depthBuffer: true,
  });
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;

  // One slot per figure. The source is picked once, from a fixed sequence
  // rather than Math.random, so a given build always looks the same.
  const slots = [];
  for (let i = 0; i < cfg.count; i++){
    const r = (Math.sin(i * 127.1 + 4.7) * 43758.5453) % 1;
    const rnd = Math.abs(r - Math.trunc(r));
    const u = cfg.count === 1 ? 0.5 : i / (cfg.count - 1);
    slots.push({
      source: pool[(i * 3 + Math.floor(rnd * 7)) % pool.length],
      treat: cfg.treatments[i % cfg.treatments.length],
      x: (u - 0.5) * cfg.spread * 2,
      z: -rnd * cfg.depth,
      scale: (0.82 + rnd * 0.45) * cfg.scale,
      spin: (rnd - 0.5) * 2 * cfg.spin,
      phase: rnd * 6.283 + i * 1.7,
      drift: cfg.drift * (0.6 + rnd * 0.9) * (i % 2 ? 1 : -1),
      tumble: (rnd - 0.5) * cfg.tumble,
    });
  }

  const limit = cfg.spread + 1.4;

  function render(time, audio){
    const c = cfg.camera;

    // The camera never settles. Orbit, roll and focal length together are
    // most of where the sense of perspective comes from, and they cost
    // nothing next to redrawing the figures.
    const a = time * c.orbit + Math.sin(time * 0.11) * 1.1;
    const radius = c.radius + Math.sin(time * 0.07) * 1.0;
    camera.position.set(Math.sin(a) * radius * 0.55,
                        0.58 + Math.sin(time * 0.13) * 0.42,
                        Math.cos(a) * radius);
    camera.lookAt(0, 0.6 + Math.sin(time * 0.09) * 0.14, 0);
    camera.rotateZ(Math.sin(time * 0.08) * c.roll);
    camera.fov = c.fov + Math.sin(time * 0.05) * c.fovSwing + audio.bass * 7.0;
    camera.updateProjectionMatrix();

    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;

    renderer.setClearAlpha(0);
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    // Each slot is a separate draw of its source at a different transform
    // and a different point in the clip, so the depth buffer has to survive
    // between them. That is cheaper than cloning six skeletons.
    renderer.autoClear = false;

    for (const slot of slots){
      const src = slot.source;
      if (src.mixer && src.duration > 0){
        src.mixer.setTime((time + slot.phase) % src.duration);
      } else {
        deformUniforms.uTime.value = time;
        deformUniforms.uLevel.value = audio.level;
        deformUniforms.uBass.value = audio.bass;
        deformUniforms.uPhase.value = slot.phase;
      }

      treatUniform.value = slot.treat;
      slot.x += slot.drift * 0.016;
      if (slot.x > limit) slot.x = -limit;
      if (slot.x < -limit) slot.x = limit;

      src.holder.position.set(slot.x, 0, slot.z);
      src.holder.rotation.set(Math.sin(time * 0.3 + slot.phase) * slot.tumble,
                              slot.phase + time * slot.spin,
                              Math.sin(time * 0.23 + slot.phase) * slot.tumble);
      src.holder.scale.setScalar(slot.scale);
      renderer.render(src.scene, camera);
    }

    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearAlpha(prevAlpha);
  }

  return { texture: target.texture, render };
}

export async function buildWorld(renderer, config, onProgress){
  // A manager so the loading ticker has something to count. It sees the
  // glTF files and every texture and buffer they pull in, which is the
  // bulk of the wait; the audio streams later and is not counted.
  const manager = new THREE.LoadingManager();
  if (onProgress){
    manager.onProgress = (url, loaded, total) => onProgress(loaded / Math.max(total, 1));
    manager.onLoad = () => onProgress(1);
  }
  const loader = new GLTFLoader(manager);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.0135);

  const [warehouseGltf, characterGltf, ...dancerGltfs] = await Promise.all([
    load(loader, config.models.warehouse),
    load(loader, config.models.character),
    ...config.dancers.sources.map((entry) => load(loader, entry.model)),
  ]);

  // --- the shell -------------------------------------------------------
  const shell = warehouseGltf.scene;
  shell.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const m = o.material;
    if (!m) return;
    crunch(m.map); crunch(m.normalMap); crunch(m.roughnessMap); crunch(m.metalnessMap);
    // Strip every trace of colour out of the shell.
    if (m.color) m.color.setScalar(0.62);
    if (m.emissive){
      // The model ships a coloured strip light. Keep the strip, lose the hue.
      const lit = m.emissive.r + m.emissive.g + m.emissive.b > 0.01;
      m.emissive.setScalar(lit ? 0.03 : 0);
    }
    m.roughness = Math.min(m.roughness ?? 1, 0.52);   // wet concrete
    m.metalness = Math.max(m.metalness ?? 0, 0.18);
    m.envMapIntensity = 0.55;
    m.needsUpdate = true;
  });
  const room = normaliseRoom(shell);
  scene.add(shell);

  // --- the projection --------------------------------------------------
  const planeW = room.width * config.projection.fill;
  const planeH = room.height * config.projection.rise;
  const aspect = planeW / planeH;

  const dancers = createDancers(renderer, dancerGltfs, config, aspect);

  const uniforms = {
    uRes:    { value: new THREE.Vector2(1024 * aspect, 1024) },
    uDancers:{ value: dancers ? dancers.texture : null },
    uTime:   { value: 0 },
    uLevel:  { value: 0 },
    uBass:   { value: 0 },
    uTreble: { value: 0 },
    uHit:    { value: 0 },
    uPointer:    { value: new THREE.Vector2() },
    uPointerVel: { value: 0 },
    uGain:   { value: config.projection.gain },
  };

  const projection = new THREE.Mesh(
    new THREE.PlaneGeometry(planeW, planeH),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fragmentShader(config.tracks[0].shader),
      uniforms,
      toneMapped: false,
      fog: false,
    })
  );
  // Clear of the end wall: at 6cm the shell's own geometry wins the depth
  // test and the projection disappears behind it. Run the bottom edge just
  // under the floor too, or the strip of wall below it catches the lights
  // and reads as a bright seam.
  projection.position.set(0, planeH / 2 - 0.08, 0.45);
  scene.add(projection);

  // The only light in the room comes off that plane.
  const lights = [];
  const n = Math.max(1, config.projection.lights);
  for (let i = 0; i < n; i++){
    const light = new THREE.PointLight(0xffffff, config.projection.intensity, 0, config.projection.decay);
    const u = n === 1 ? 0.5 : i / (n - 1);
    // Well out into the room. Sitting them against the wall just blows out
    // the metal either side of the plane and the projection loses.
    light.position.set(
      (u - 0.5) * planeW * 0.5,
      planeH * (0.45 + 0.25 * Math.sin(u * Math.PI)),
      4.5 + u * 2.5
    );
    scene.add(light);
    lights.push(light);
  }
  // Just enough to keep the far end from being pure void.
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));

  scene.environment = projectionEnvironment(renderer);
  scene.environmentIntensity = 0.5;

  // --- the figure ------------------------------------------------------
  const figure = characterGltf.scene;
  figure.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    crunch(m.map); crunch(m.normalMap); crunch(m.roughnessMap); crunch(m.metalnessMap);
    if (m.color) m.color.setScalar(0.5);
    if (m.emissive) m.emissive.setScalar(0);
    m.roughness = Math.min(m.roughness ?? 1, 0.72);
    m.envMapIntensity = 0.35;
    m.needsUpdate = true;
  });

  figure.updateWorldMatrix(true, true);
  const fbox = new THREE.Box3().setFromObject(figure);
  const fsize = fbox.getSize(new THREE.Vector3());
  const scale = config.character.height / Math.max(fsize.y, 0.001);
  figure.scale.multiplyScalar(scale);
  figure.updateWorldMatrix(true, true);

  // Re-measure after scaling, then stand it on the floor.
  const sbox = new THREE.Box3().setFromObject(figure);
  const scentre = sbox.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  figure.position.x -= scentre.x;
  figure.position.z -= scentre.z;
  figure.position.y -= sbox.min.y;
  pivot.add(figure);
  pivot.position.set(
    config.character.offset * room.halfWidth,
    0,
    room.at(config.character.distance)
  );
  // The camera moves need to know where the figure stands.
  room.figure = pivot.position.z;
  // Facing the projection, turned slightly off dead-on.
  pivot.rotation.y = config.character.turn;
  scene.add(pivot);

  // The source model ships an A-pose and nothing else. Bring the arms down
  // so the figure reads as someone standing and watching, not as a rig.
  // Bone names carry a numeric suffix, so match on the prefix.
  const bones = [];
  figure.traverse((o) => { if (o.isBone) bones.push(o); });
  for (const [prefix, amount] of Object.entries(config.character.pose || {})){
    const bone = bones.find((b) => b.name.toLowerCase().startsWith(prefix.toLowerCase()));
    if (bone) bone.rotateZ(amount);
  }

  function setShader(name){
    projection.material.fragmentShader = fragmentShader(name);
    projection.material.needsUpdate = true;
  }

  function update(time, audio, config2, pointer){
    uniforms.uTime.value = time;
    // Scaled on the way in, so the wall barely moves while the lights
    // below still get the full signal.
    const k = config2.projection.shaderReact;
    uniforms.uLevel.value = audio.level * k;
    uniforms.uBass.value = audio.bass * k;
    uniforms.uTreble.value = audio.treble * k;
    uniforms.uHit.value = audio.hit * k;
    if (pointer){
      uniforms.uPointer.value.set(pointer.x, -pointer.y);
      uniforms.uPointerVel.value = pointer.vel;
    }

    // One band per light. Driving them all from overall loudness makes the
    // room pump as a single block, which reads as a fade and not as sound.
    const react = config2.projection.reactivity;
    const flash = config2.projection.flash * audio.hit;
    const bands = [audio.bass, audio.level, audio.treble];
    for (let i = 0; i < lights.length; i++){
      const band = bands[i % bands.length];
      // A low fixed floor, plus the band, plus the onset. The steady term
      // is deliberately small: most of what you see should be the music,
      // not a lamp that is always on.
      // The room answers movement too, not only the music.
      const gain = 0.12 + react * band * 0.95 + flash
                 + (pointer ? pointer.vel * 0.3 : 0);
      lights[i].intensity = config2.projection.intensity * gain;
    }
    scene.environmentIntensity = 0.5 * (1 - react + react * (0.25 + audio.level * 1.8) + flash * 0.5);

    // Weight shift, and a slight lean as the low end hits.
    pivot.rotation.y = config2.character.turn + Math.sin(time * 0.23) * 0.045;
    pivot.position.y = Math.sin(time * 0.41) * 0.012 - audio.bass * 0.01;
  }

  return { scene, room, projection, setShader, update,
           renderDancers: dancers ? dancers.render : () => {} };
}
