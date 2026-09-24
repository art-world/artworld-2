// The booth. The one object in this world with a surface of its own.
//
// It is a scan of a real kiosk, litter and all, and it is treated two ways
// at once: the scan as it came, and liquid chrome that reflects
// the field it is standing in. A front runs across it between the two, so
// the cheap object and the expensive one are the same thing at different
// moments. The field bends round it. It rings until someone answers it.
// The camera goes round it, up close to it and straight through it.
//
// Every displacement is a function of position and time only, never of a
// normal, so the scan's split vertices move together and the mesh bends
// without tearing along its UV seams. The tearing that does happen is put
// there on purpose, in slabs.

import * as THREE from 'three';
import { UNIFORMS, HELPERS, fieldBody } from './shaders.js';

const NOISE3 = /* glsl */ `
float h3(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
`;

const BOOTH_UNIFORMS = /* glsl */ `
uniform float uChrome;   // how much of it is mirror, 0..1
uniform float uWarp;     // how far it bends
uniform float uMelt;     // how far it runs and pools
uniform float uGlitch;   // how often slabs of it jump
uniform float uRing;     // the ring, while nobody has answered
uniform float uConnect;  // a call going through, 1 falling to 0
uniform float uBoothSeed;
uniform float uLag;      // ghosts run behind the booth in time
uniform float uEchoShift;
uniform float uGhost;
uniform sampler2D uMap;
uniform sampler2D uSign;
uniform float uSignOn;
uniform vec4  uSignRect;
`;

// The shape, in the booth's own space: one unit tall, centred on the
// origin. Shared by the booth and its ghosts.
const DEFORM = /* glsl */ `
vec3 deform(vec3 p, float t){
  float y = p.y + 0.5;

  // Breathing. Three channels of slow noise, so it swells and sags like
  // something liquid holding a shape it would rather not.
  vec3 q = p * 2.4 + vec3(0.0, -t * 0.18, t * 0.05);
  vec3 n = vec3(noise3(q), noise3(q + 19.1), noise3(q + 41.7)) - 0.5;
  p += n * (0.02 + uWarp * 0.05 + uBass * 0.04);

  // A slight twist, wound and unwound, more at the top than the foot.
  // Only just enough to keep the reflections moving.
  p.xz = rot((y - 0.5) * sin(t * 0.17) * 0.2 * uWarp) * p.xz;

  // Melt. It runs down in columns and pools at the foot, the way a candle
  // goes, and draws itself back up again.
  float col = noise3(vec3(p.xz * 11.0, uBoothSeed));
  float drip = smoothstep(0.55, 0.95, col) * uMelt;
  p.y -= drip * (1.0 - y) * 0.3 * (0.65 + 0.35 * sin(t * 0.3 + col * 6.0));
  float pool = smoothstep(0.32, 0.0, y) * uMelt;
  p.xz *= 1.0 + pool * (0.55 + 0.2 * sin(t * 0.4));
  p.y = mix(p.y, -0.5, pool * 0.35);

  // Slabs. Stepped in time, so they jump rather than slide, and the
  // triangles across each cut stretch into a smear. A call going through
  // knocks every one of them a little out of line.
  float st = floor(t * 12.0);
  float slab = floor(y * 22.0 + hash11(st) * 4.0);
  float g = hash11(slab * 3.7 + st * 1.31 + uBoothSeed);
  vec2 shove = vec2(hash11(slab + st * 7.1), hash11(slab * 1.9 + st * 3.3)) - 0.5;
  p.xz += shove * step(g, uGlitch * 0.1) * 0.3;
  vec2 fling = vec2(hash11(slab * 5.3 + 1.7), hash11(slab * 8.9 + 4.1)) - 0.5;
  p.xz += fling * uConnect * 0.4;
  p.y += (hash11(slab * 2.1) - 0.5) * uConnect * 0.1;

  // The ring. A shudder too fast to follow, only while it rings.
  p.xz += vec2(sin(t * 97.0), cos(t * 83.0)) * 0.006 * uRing;
  p.y += sin(t * 61.0) * 0.002 * uRing;
  return p;
}
`;

const VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vLocal;
varying vec2 vUv;
varying vec3 vNorm;
varying vec3 vLocalN;

void main(){
  float t = uTime - uLag;
  vec3 p = deform(position, t);
  vLocal = position;
  vUv = uv;
  vNorm = normalize(mat3(modelMatrix) * normal);
  vLocalN = normal;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 mv = viewMatrix * world;
  // Ghosts only. Multipath: the same picture arriving twice, a moment
  // late and shifted along the line.
  mv.x += uEchoShift;
  gl_Position = projectionMatrix * mv;
}
`;

const SHARED_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vLocal;
varying vec2 vUv;
varying vec3 vNorm;
varying vec3 vLocalN;

// Where the sign is, in the sign's own 0..1, or outside it.
vec2 signAt(){
  vec2 s = (vLocal.xy - uSignRect.xy) / (uSignRect.zw - uSignRect.xy);
  bool front = vLocalN.z > 0.5 && vLocal.z > 0.0;
  return (front && s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) ? s : vec2(-1.0);
}

// The scan's own texture, as it was captured.
vec3 scanColour(){
  vec3 c = texture2D(uMap, vUv).rgb;

  // The sign. When there is a connection to show, the kiosk names the
  // visitor where it used to say what it was.
  vec2 s = signAt();
  if (uSignOn > 0.5 && s.x >= 0.0) c = texture2D(uSign, s).rgb;
  return c;
}

float slabCut(){
  float st = floor(uTime * 12.0);
  float slab = floor((vLocal.y + 0.5) * 22.0 + hash11(st) * 4.0);
  return hash11(slab * 9.1 + st * 0.7 + uBoothSeed);
}
`;

// The booth itself. The field is evaluated along the reflected ray, so the
// chrome shows the same world the viewer is standing in, from where they
// are standing. No cube camera, no environment map: the world is a
// function, so the reflection is exact.
function boothFragment(name){
  return UNIFORMS + BOOTH_UNIFORMS + HELPERS + fieldBody(name) + SHARED_FRAG + /* glsl */ `
void main(){
  // Drawn in lines, like a picture coming down a wire, only while a call
  // is going through.
  float lines = uConnect * 0.2;
  if (lines > 0.001 && fract(vLocal.y * 95.0 - uTime * 0.6) < lines * 0.7) discard;
  if (slabCut() < uGlitch * 0.06 + uConnect * 0.1) discard;

  // Smooth normals only. The simplified scan is made of long thin
  // triangles, and shading them flat drew every one as its own stripe.
  vec3 V = normalize(vWorld - cameraPosition);
  vec3 N = normalize(vNorm);
  if (dot(N, V) > 0.0) N = -N;

  // Ripple, slow and broad, so the smooth version reads as liquid rather
  // than as plastic.
  vec2 rp = vLocal.xy * 6.0 + vec2(vLocal.z * 5.0, -uTime * 0.3);
  N = normalize(N + vec3(noise(rp) - 0.5, noise(rp + 7.3) - 0.5, noise(rp + 3.1) - 0.5) * (0.04 + uWarp * 0.14));

  vec3 R = reflect(V, N);
  vec2 fp = mapDir(flowDir(R));
  float env = clamp(field(fp), 0.0, 1.0);

  float facing = clamp(dot(-V, N), 0.0, 1.0);
  float fres = pow(1.0 - facing, 4.0);

  // The horizon, the line every chrome object carries, running like
  // liquid rather than sitting level.
  float hz = R.y + (noise(fp * 2.0 + uTime * 0.1) - 0.5) * 0.14;
  float sky = smoothstep(-0.02, 0.02, hz);
  // A strip light. A long softbox, reflected as a hard bar: the tell of a
  // product shot, on a kiosk somebody left cans in. Level only: an upright
  // one broke into vertical streaks across the scan's lumps.
  float strip = 1.0 - smoothstep(0.0, 0.035, abs(R.y - 0.42));
  float chrome = mix(0.01 + env * 0.3, 0.5 + env * 0.7, sky) + strip * 1.3 + fres * 0.5;

  // The chrome is left clean. Printing the scan into it put the graffiti's
  // drips and the photo's grain across the mirror as fine vertical lines.
  float lum = dot(scanColour(), vec3(0.2126, 0.7152, 0.0722));

  // The scan, close to how it was captured, with a little of the field's
  // light on it so it still sits in the world.
  float scan = lum * (0.9 + env * 0.3) + fres * 0.12;

  // The front between the two. Attached to the object, not the screen, so
  // it washes over the kiosk as it turns. Its edge runs hot.
  float m = noise(vLocal.xy * 3.1 + vec2(vLocal.z * 2.3, -uTime * 0.07)) * 0.6
          + noise(vLocal.zy * 7.3 + uTime * 0.11) * 0.4;
  float th = mix(0.86, 0.14, uChrome);
  float mask = smoothstep(th - 0.02, th + 0.02, m);
  float edge = 1.0 - smoothstep(0.0, 0.018 + uLevel * 0.02, abs(m - th));

  // The sign is never covered, and it is lit, as the real one is. The
  // one thing on the kiosk that always says what it is, or who you are.
  if (signAt().x >= 0.0){
    mask = 0.0;
    edge = 0.0;
    scan = lum * 1.15;
  }

  float v = mix(scan, chrome, mask) + edge * (1.0 + uHit * 0.4);
  // A steady glow while it rings. Flickering, it read as another glitch.
  v += uRing * 0.12 * (0.4 + fres);

  gl_FragColor = vec4(vec3(max(v, 0.0) * uGain), 1.0);
}
`;
}

// The ghosts. The booth arriving twice more, late and to one side, the way
// a signal does when it has taken more than one path. Cheap on purpose:
// no field, just the outline and the scan.
const GHOST_FRAG = UNIFORMS + BOOTH_UNIFORMS + HELPERS + SHARED_FRAG + /* glsl */ `
void main(){
  vec3 V = normalize(vWorld - cameraPosition);
  float fres = pow(1.0 - abs(dot(V, normalize(vNorm))), 2.0);
  float lum = dot(scanColour(), vec3(0.2126, 0.7152, 0.0722));
  float v = (lum * 0.45 + fres * 0.7) * uGhost * 0.3;
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;

const vertexShader = UNIFORMS + BOOTH_UNIFORMS + HELPERS + NOISE3 + DEFORM + VERTEX;

// The scan arrives as one mesh under a rotated, quantised node. Everything
// is baked into plain floats in the booth's own space, one unit tall and
// centred, so the shaders can reason about height without knowing where
// the file came from. Replace the model and this still holds.
function prepare(gltf){
  let mesh = null;
  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('booth model has no mesh');

  const src = mesh.geometry;
  const pos = src.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  for (let i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    v.toArray(out, i * 3);
    box.expandByPoint(v);
  }
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const k = 1 / Math.max(size.y, 1e-6);
  for (let i = 0; i < pos.count; i++){
    out[i * 3]     = (out[i * 3]     - centre.x) * k;
    out[i * 3 + 1] = (out[i * 3 + 1] - centre.y) * k;
    out[i * 3 + 2] = (out[i * 3 + 2] - centre.z) * k;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geometry.setAttribute('uv', src.attributes.uv);
  geometry.setIndex(src.index);
  geometry.setAttribute('normal', new THREE.BufferAttribute(weldedNormals(out, src.index), 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const map = mesh.material.map;
  if (map){
    // Raw values, not linearised: nothing in this world is colour managed,
    // the grade reads whatever lands in the target as display values.
    map.colorSpace = THREE.NoColorSpace;
    // Filtered, not nearest: sampled nearest, the scan shimmered into a
    // fine grain as soon as it was any distance away.
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.needsUpdate = true;
  }

  return { geometry, map, extent: size.clone().multiplyScalar(k) };
}

// Smooth normals across the scan's seams. Its vertices are split wherever
// the texture is, so a plain computeVertexNormals leaves every seam as a
// visible crease in the chrome. Faces are accumulated per position instead.
function weldedNormals(positions, index){
  const n = positions.length / 3;
  const ids = new Uint32Array(n);
  const seen = new Map();
  let count = 0;
  for (let i = 0; i < n; i++){
    const key = Math.round(positions[i * 3] * 2e4) + ',' +
                Math.round(positions[i * 3 + 1] * 2e4) + ',' +
                Math.round(positions[i * 3 + 2] * 2e4);
    let id = seen.get(key);
    if (id === undefined){ id = count++; seen.set(key, id); }
    ids[i] = id;
  }
  const acc = new Float32Array(count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const idx = index ? index.array : null;
  const tris = idx ? idx.length / 3 : n / 3;
  for (let t = 0; t < tris; t++){
    const i0 = idx ? idx[t * 3] : t * 3;
    const i1 = idx ? idx[t * 3 + 1] : t * 3 + 1;
    const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromArray(positions, i0 * 3);
    b.fromArray(positions, i1 * 3).sub(a);
    c.fromArray(positions, i2 * 3).sub(a);
    b.cross(c);   // area weighted
    for (const i of [i0, i1, i2]){
      const o = ids[i] * 3;
      acc[o] += b.x; acc[o + 1] += b.y; acc[o + 2] += b.z;
    }
  }
  // Then relaxed over their neighbours a few times. A scan is lumpy at
  // every scale, and the raw normals make chrome look like crumpled foil.
  // Relaxed, the big planes hold one long reflection, the way poured metal
  // does, and the geometry underneath stays as lumpy as it was.
  let cur = acc;
  for (let pass = 0; pass < SMOOTHING; pass++){
    const next = new Float32Array(count * 3);
    for (let t = 0; t < tris; t++){
      const a0 = ids[idx ? idx[t * 3] : t * 3] * 3;
      const a1 = ids[idx ? idx[t * 3 + 1] : t * 3 + 1] * 3;
      const a2 = ids[idx ? idx[t * 3 + 2] : t * 3 + 2] * 3;
      for (let k = 0; k < 3; k++){
        const sum = unit(cur, a0, k) + unit(cur, a1, k) + unit(cur, a2, k);
        next[a0 + k] += sum; next[a1 + k] += sum; next[a2 + k] += sum;
      }
    }
    cur = next;
  }

  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++){
    const o = ids[i] * 3;
    const len = Math.hypot(cur[o], cur[o + 1], cur[o + 2]) || 1;
    out[i * 3] = cur[o] / len;
    out[i * 3 + 1] = cur[o + 1] / len;
    out[i * 3 + 2] = cur[o + 2] / len;
  }
  return out;
}

const SMOOTHING = 4;

function unit(v, o, k){
  const len = Math.hypot(v[o], v[o + 1], v[o + 2]) || 1;
  return v[o + k] / len;
}

// The phone's ring as a pattern of on and off, in seconds. Nothing is
// heard: the booth shudders on the beats of it, and that is enough to know
// what it is doing.
function ringing(t, cadence){
  const period = cadence.reduce((s, x) => s + x, 0);
  let at = ((t % period) + period) % period;
  for (let i = 0; i < cadence.length; i++){
    if (at < cadence[i]) return i % 2 === 0;
    at -= cadence[i];
  }
  return false;
}

// The connection, drawn as the kiosk would draw it: white on its black
// band, in the only face this site has. Held on the GPU as pixels and in
// nothing else.
function signTexture(){
  const canvas = document.createElement('canvas');
  // The sign's own proportions, so the lettering is not stretched.
  canvas.width = 560;
  canvas.height = 104;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, texture };
}

export function createBooth(gltf, cfg, shared, shaderName){
  const { geometry, map, extent } = prepare(gltf);
  const sign = signTexture();

  const own = {
    uChrome:    { value: 0.5 },
    uWarp:      { value: 0.4 },
    uMelt:      { value: 0.2 },
    uGlitch:    { value: 0 },
    uRing:      { value: 0 },
    uConnect:   { value: 0 },
    uBoothSeed: { value: 3.7 },
    uGhost:     { value: 0 },
    uMap:       { value: map },
    uSign:      { value: sign.texture },
    uSignOn:    { value: 0 },
    uSignRect:  { value: new THREE.Vector4(...cfg.sign) },
  };

  // Per draw: which ghost this is, how late and how far along the line.
  const perDraw = (extra) => Object.assign({}, shared, own, {
    uLag: { value: 0 }, uEchoShift: { value: 0 },
  }, extra);

  const group = new THREE.Group();

  const material = new THREE.ShaderMaterial({
    uniforms: perDraw(),
    vertexShader,
    fragmentShader: boothFragment(shaderName),
    side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(geometry, material);
  // Drawn before the field, so the field's pixels behind it fail the depth
  // test and are never evaluated. The field is the expensive part.
  body.renderOrder = -1;
  body.frustumCulled = false;
  group.add(body);

  const ghosts = [];
  for (let i = 0; i < cfg.ghosts; i++){
    const g = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms: perDraw({ uLag: { value: 0.12 * (i + 1) } }),
      vertexShader,
      fragmentShader: GHOST_FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }));
    g.renderOrder = 2;
    g.frustumCulled = false;
    ghosts.push(g);
    group.add(g);
  }

  // Current look and the one it is heading for. Changing track moves the
  // target; the booth gets there over a second or two, under the cover of
  // the call going through.
  const look = Object.assign({}, cfg.look);
  let target = Object.assign({}, cfg.look);
  function setLook(next){ target = Object.assign({}, cfg.look, next || {}); }

  let last = 0;
  let connectAt = -99;
  let ringLevel = 0;

  function connect(){ connectAt = last; }

  const toBooth = new THREE.Vector3();

  function update(time, audio, camera, state){
    // Time can run backwards when a capture starts from zero. A call in
    // progress is dropped rather than left stuck.
    if (time < last) connectAt = -99;
    last = time;

    for (const key in target) look[key] += (target[key] - look[key]) * 0.03;

    const height = cfg.height * look.size;
    group.scale.setScalar(height);
    group.position.set(0, Math.sin(time * 0.21) * cfg.bob, 0);
    group.rotation.set(
      Math.sin(time * 0.13) * cfg.lean,
      time * cfg.spin,
      Math.sin(time * 0.17) * cfg.lean * 0.7
    );
    group.updateMatrixWorld(true);

    const on = state.ringing && ringing(time, cfg.ring);
    ringLevel += ((on ? 1 : 0) - ringLevel) * 0.45;

    const connecting = Math.exp(-Math.max(0, time - connectAt) * 5.5);
    const hit = audio.hit || 0;

    // The mirror comes and goes on a slow tide, pushed in a little on the
    // low end. Narrow, so the scan is what is mostly seen.
    const tide = Math.sin(time * 0.11) * 0.08 + Math.sin(time * 0.047 + 1.0) * 0.04;
    own.uChrome.value = THREE.MathUtils.clamp(look.chrome + tide + (audio.bass || 0) * 0.05, 0, 1);
    own.uWarp.value = look.warp;
    own.uMelt.value = look.melt;
    // Only if a track asks for it. None does at the moment.
    own.uGlitch.value = look.glitch;
    own.uRing.value = ringLevel;
    own.uConnect.value = connecting;
    own.uGhost.value = cfg.ghost + connecting * 0.4;

    // Not drawn at all when there is nothing to show.
    for (let i = 0; i < ghosts.length; i++){
      ghosts[i].visible = own.uGhost.value > 0.01;
      ghosts[i].material.uniforms.uEchoShift.value =
        (i + 1) * height * 0.045 * (0.5 + own.uGhost.value);
    }

    // The field bends round it. Measured from wherever the viewer is, so
    // the pull is strongest along the line of sight to it. It lets go as
    // the camera closes in: from inside the booth there is no line of
    // sight to bend round, and a lens that size would turn the whole sky
    // inside out on the way through the wall.
    toBooth.copy(group.position).sub(camera.position);
    const dist = Math.max(toBooth.length(), 1e-3);
    shared.uLensDir.value.copy(toBooth).divideScalar(dist);
    const halfWidth = Math.max(extent.x, extent.z) * 0.5 * height;
    shared.uLensSize.value = Math.min(Math.atan(halfWidth / dist), 0.6);
    const close = THREE.MathUtils.smoothstep(dist, halfWidth * 1.4, halfWidth * 3.2);
    shared.uLensMass.value = look.lens * close *
      (1 + hit * 0.25 + ringLevel * 0.35 + connecting * 1.1);
    shared.uLensSwirl.value = look.swirl * Math.sin(time * 0.13) + connecting * 2.2;

    return { ring: ringLevel, connect: connecting };
  }

  function setShader(name){
    material.fragmentShader = boothFragment(name);
    material.needsUpdate = true;
  }

  // A ray against the booth's box, in its own space. The scan is one fused
  // mesh with no parts to aim at, and the whole kiosk is the thing to touch.
  const hitBox = new THREE.Box3().copy(geometry.boundingBox).expandByScalar(0.04);
  const inverse = new THREE.Matrix4();
  const local = new THREE.Ray();
  function hit(ray){
    inverse.copy(group.matrixWorld).invert();
    local.copy(ray).applyMatrix4(inverse);
    // From inside it, every ray would hit it. Inside is not a place to
    // tap it from.
    if (hitBox.containsPoint(local.origin)) return false;
    return local.intersectsBox(hitBox);
  }

  // Only ever called with what net.js read this visit. Drawn into a canvas
  // that exists to feed the texture and nothing else. Not stored, not sent.
  function setSign(connection){
    const text = connection && connection.ip;
    if (!text){ own.uSignOn.value = 0; return; }
    // The face has to be there before anything is drawn in it, or the
    // canvas quietly falls back to the system monospace.
    const ready = document.fonts && document.fonts.load
      ? document.fonts.load('96px VT323').catch(() => {})
      : Promise.resolve();
    ready.then(() => drawSign(text));
  }

  function drawSign(text){
    const { canvas, texture } = sign;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 96;
    ctx.font = `${size}px VT323, monospace`;
    while (ctx.measureText(text).width > canvas.width * 0.92 && size > 12){
      size -= 2;
      ctx.font = `${size}px VT323, monospace`;
    }
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    texture.needsUpdate = true;
    own.uSignOn.value = 1;
  }

  return { group, update, connect, setLook, setShader, setSign, hit,
           get y(){ return group.position.y; } };
}
