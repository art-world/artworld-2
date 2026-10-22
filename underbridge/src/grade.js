// Final pass. The scene renders to a target, then this draws it back as a
// single fullscreen triangle: desaturate, crush, grain, vignette, scan.
// Then the image is painted back in the track's palette: a shadow colour,
// five colours for the middle, and a light. Brightness decides how far
// from the shadow toward the light a pixel sits. Which of the five it
// takes comes from large, slow, soft regions that stay with the world as
// the camera turns, nudged by whatever colour the scan had there, so the
// plants, the wood and the sky land on different colours of the same
// palette. Several colours in every frame, never confetti.

import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D tScene;
uniform vec2  uRes;
uniform float uTime;
uniform float uContrast;
uniform float uLift;
uniform float uGrain;
uniform float uVignette;
uniform float uScanline;
uniform float uLevel;
uniform vec3  uShadow;
uniform vec3  uInk0;
uniform vec3  uInk1;
uniform vec3  uInk2;
uniform vec3  uInk3;
uniform vec3  uInk4;
uniform vec3  uLight;
uniform vec2  uView;   // which way the camera faces, yaw and pitch

varying vec2 vUv;

float hash(vec2 p){
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The five middle colours as one line, walked back and forth rather than
// round, so the last never blends straight into the first. Each colour is
// held for a while before it gives way to the next.
vec3 ink(float h){
  float x = (1.0 - abs(fract(h * 0.5) * 2.0 - 1.0)) * 3.999;
  float f = smoothstep(0.2, 0.8, fract(x));
  if (x < 1.0) return mix(uInk0, uInk1, f);
  if (x < 2.0) return mix(uInk1, uInk2, f);
  if (x < 3.0) return mix(uInk2, uInk3, f);
  return mix(uInk3, uInk4, f);
}

float hueOf(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (d < 1e-4) return 0.0;
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0)
          : mx == c.g ? (c.b - c.r) / d + 2.0
          : (c.r - c.g) / d + 4.0;
  return h / 6.0;
}

void main(){
  vec3 src = texture2D(tScene, vUv).rgb;

  // Luminance. Anything that got in with colour leaves without it, and
  // is only consulted again below to choose among the palette's own.
  float v = dot(src, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(src.r, max(src.g, src.b));
  float sat = mx > 1e-4 ? (mx - min(src.r, min(src.g, src.b))) / mx : 0.0;

  v = (v - 0.5) * uContrast + 0.5 + uLift;

  // Vignette, opened slightly by loudness so the room breathes.
  vec2 c = vUv - 0.5;
  float r = length(c) * (uVignette - uLevel * 0.1);
  v *= 1.0 - smoothstep(0.42, 0.95, r);

  // Scanline, locked to device pixels.
  v *= 1.0 - uScanline * (0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159));

  // Grain, heavier in the shadows where banding would otherwise show.
  float g = hash(vUv * uRes + fract(uTime) * 137.0) - 0.5;
  v += g * uGrain * (1.25 - v);

  // Which of the middle colours. The regions are anchored to the view on a
  // circle, so turning moves the colour with the world and a full turn
  // comes back to where it started, with no seam at any heading.
  vec2 q = vec2(vUv.x * uRes.x / uRes.y, vUv.y) * 1.1
         + vec2(cos(uView.x), sin(uView.x)) * 0.8 + vec2(0.0, uView.y * 0.8)
         + uTime * vec2(0.007, 0.004);
  float n = vnoise(q * 1.2) * 0.65 + vnoise(q * 2.7 + 4.1) * 0.35;
  // Centred on the middle colour of the five, which is the most common;
  // the two ends show as accents. The top of the frame leans to the first
  // of them, the way a sky does above a horizon. The scan's own hue moves
  // the sky one way and the wood and plants the other.
  float h = 0.5 + (n - 0.5) * 2.2 - (vUv.y - 0.5) * 0.5
          + (hueOf(src) - 0.3) * 0.8 * smoothstep(0.08, 0.35, sat);

  v = clamp(v, 0.0, 1.0);
  vec3 col = mix(uShadow, ink(h), smoothstep(0.03, 0.55, v));
  col = mix(col, uLight, smoothstep(0.6, 1.0, v));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createGrade(renderer, settings){
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;

  const uniforms = {
    tScene:    { value: target.texture },
    uRes:      { value: new THREE.Vector2(size.x, size.y) },
    uTime:     { value: 0 },
    uContrast: { value: settings.contrast },
    uLift:     { value: settings.lift },
    uGrain:    { value: settings.grain },
    uVignette: { value: settings.vignette },
    uScanline: { value: settings.scanline },
    uLevel:    { value: 0 },
    uView:     { value: new THREE.Vector2() },
    uShadow:   { value: new THREE.Vector3(0, 0, 0) },
    uInk0:     { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uInk1:     { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uInk2:     { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uInk3:     { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uInk4:     { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uLight:    { value: new THREE.Vector3(1, 1, 1) },
  };
  const stops = [uniforms.uShadow, uniforms.uInk0, uniforms.uInk1, uniforms.uInk2,
                 uniforms.uInk3, uniforms.uInk4, uniforms.uLight];

  // Where the palette is heading. A change of track crossfades to the new
  // one over a couple of seconds rather than cutting.
  const towards = stops.map((u) => u.value.clone());
  let last = 0;

  // One oversized triangle, no attributes beyond position and uv.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(
    new Float32Array([0, 0, 2, 0, 0, 2]), 2));

  const quad = new THREE.Mesh(geometry, new THREE.RawShaderMaterial({
    vertexShader: 'attribute vec3 position;\nattribute vec2 uv;\n' + VERT,
    fragmentShader: FRAG,
    uniforms,
    depthTest: false,
    depthWrite: false,
  }));

  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  return {
    target,
    setSize(w, h){
      const dpr = renderer.getPixelRatio();
      target.setSize(w * dpr, h * dpr);
      uniforms.uRes.value.set(w * dpr, h * dpr);
    },
    // { shadow, inks: [five], light }, as hex. Read as written, not colour
    // managed: nothing else in this pipeline is either.
    setPalette(palette, instant = false){
      const hexes = [palette.shadow, ...palette.inks, palette.light];
      hexes.forEach((hex, i) => {
        const n = parseInt(hex.replace('#', ''), 16);
        towards[i].set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        if (instant) stops[i].value.copy(towards[i]);
      });
    },
    render(time, level, yaw = 0, pitch = 0){
      uniforms.uView.value.set(yaw, pitch);
      // Time runs backwards when a capture starts from zero: arrive at once.
      const dt = time - last;
      last = time;
      const k = dt < 0 ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) / settings.paletteFade);
      for (let i = 0; i < stops.length; i++) stops[i].value.lerp(towards[i], k);
      uniforms.uTime.value = time;
      uniforms.uLevel.value = level;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
