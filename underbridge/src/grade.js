// Final pass. The scene renders to a target, then this draws it back as a
// single fullscreen triangle: desaturate, crush, grain, vignette, scan.
// Then the brightness that is left is read through the track's palette,
// four colours from darkest to lightest. Whatever colour the scene had is
// gone by then: every track is one light on one place, not the place's
// own colours tinted.

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
uniform vec3  uPal0;   // darkest
uniform vec3  uPal1;   // shadow
uniform vec3  uPal2;   // middle
uniform vec3  uPal3;   // lightest

varying vec2 vUv;

float hash(vec2 p){
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// Brightness to colour, smoothly through the four stops.
vec3 palette(float v){
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(uPal0, uPal1, smoothstep(0.0, 0.34, v));
  c = mix(c, uPal2, smoothstep(0.34, 0.68, v));
  return mix(c, uPal3, smoothstep(0.68, 1.0, v));
}

void main(){
  vec3 src = texture2D(tScene, vUv).rgb;

  // Luminance. Anything that got in with colour leaves without it.
  float v = dot(src, vec3(0.2126, 0.7152, 0.0722));

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

  gl_FragColor = vec4(palette(v), 1.0);
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
    uPal0:     { value: new THREE.Vector3(0, 0, 0) },
    uPal1:     { value: new THREE.Vector3(0.33, 0.33, 0.33) },
    uPal2:     { value: new THREE.Vector3(0.66, 0.66, 0.66) },
    uPal3:     { value: new THREE.Vector3(1, 1, 1) },
  };
  const stops = [uniforms.uPal0, uniforms.uPal1, uniforms.uPal2, uniforms.uPal3];

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
    // Four hex colours, darkest first. Read as written, not colour managed:
    // nothing else in this pipeline is either.
    setPalette(hexes, instant = false){
      hexes.forEach((hex, i) => {
        const n = parseInt(hex.replace('#', ''), 16);
        towards[i].set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        if (instant) stops[i].value.copy(towards[i]);
      });
    },
    render(time, level){
      // Time runs backwards when a capture starts from zero: arrive at once.
      const dt = time - last;
      last = time;
      const k = dt < 0 ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) / settings.paletteFade);
      for (let i = 0; i < 4; i++) stops[i].value.lerp(towards[i], k);
      uniforms.uTime.value = time;
      uniforms.uLevel.value = level;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
