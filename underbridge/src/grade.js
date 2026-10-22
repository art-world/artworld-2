// Final pass. The scene renders to a target, then this draws it back as a
// single fullscreen triangle: desaturate, crush, grain, vignette, scan.
// Nothing reaches the canvas in colour.

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

varying vec2 vUv;

float hash(vec2 p){
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
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

  gl_FragColor = vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
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
  };

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
    render(time, level){
      uniforms.uTime.value = time;
      uniforms.uLevel.value = level;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
