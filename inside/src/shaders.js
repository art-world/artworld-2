// The field, and the six of them. Same field functions as the warehouse,
// but nothing here is a wall: the field is evaluated from the direction you
// are looking, so it closes around you and looking anywhere lands somewhere
// in it.
//
// Mapping a flat field onto every direction is the whole problem. Plain
// equirectangular leaves a hard vertical join where longitude wraps, and a
// turbulent field makes that join obvious. This traces a circle in the
// field's own plane, once per turn, so the mapping closes on itself and
// there is no seam anywhere you can look. The circle shrinks to nothing at
// the poles, which converges smoothly rather than tearing.

export const UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uBass;
uniform float uTreble;
uniform float uHit;
uniform float uGain;
uniform vec3  uLook;      // where the viewer is facing
uniform float uReach;     // how hard the viewer is disturbing the field
uniform float uTear;      // how badly the field itself is breaking up
`;

export const HELPERS = /* glsl */ `
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash11(float n){ return fract(sin(n) * 43758.5453123); }

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p = rot(0.5) * p * 2.02; a *= 0.5; }
  return v;
}

float fbm3(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){ v += a * noise(p); p = rot(0.5) * p * 2.02; a *= 0.5; }
  return v;
}

float turb(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * abs(noise(p) * 2.0 - 1.0);
    p = rot(0.7) * p * 2.03;
    a *= 0.5;
  }
  return v;
}

vec2 curl(vec2 p, float t){
  const float e = 0.09;
  float nx1 = fbm3(p + vec2(e, 0.0) + t);
  float nx0 = fbm3(p - vec2(e, 0.0) + t);
  float ny1 = fbm3(p + vec2(0.0, e) + t);
  float ny0 = fbm3(p - vec2(0.0, e) + t);
  return vec2(ny1 - ny0, nx0 - nx1) / (2.0 * e);
}

float box3(vec3 p, vec3 b){
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// The field bodies were written against a wall with an aspect and a focal
// length. Nothing here has either, so they are fixed: the shapes they were
// tuned for are kept without the fields having to be rewritten.
float aspect(){ return 2.0; }
float focal(){ return 1.7; }

float sliceFade(float k, float lo, float hi){
  return smoothstep(0.0, lo, k) * (1.0 - smoothstep(hi, hi + 1.4, k));
}

// The figures are real geometry in this world rather than a texture
// composited into the field, so this is a pass-through and the field
// bodies below need no edits.
float withDancers(float v, vec2 p){ return v; }

// Direction to a point in the field. Seamless: a full turn traces a closed
// circle, so there is no longitude at which the field jumps.
vec2 mapDir(vec3 d){
  d = normalize(d);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = atan(d.z, d.x);
  // Kept inside the range the fields were written for. They were tuned
  // against a wall roughly four units across, and several of them fade out
  // past that, so a mapping that roams further just returns black.
  float r = 1.35 * cos(lat);
  return vec2(cos(lon), sin(lon)) * r + vec2(0.0, lat * 0.95);
}

// The viewer disturbs what they are looking at. Tight, so it is a pressure
// under the gaze rather than the whole field sliding about.
vec2 gazePush(vec3 d){
  float towards = max(dot(normalize(d), normalize(uLook)), 0.0);
  float k = pow(towards, 18.0) * uReach;
  return vec2(d.z, d.x) * k * 1.1;
}

// The field breaks up in horizontal slabs, each one turned a little off the
// rest. Stepped in time rather than smoothed, so it reads as a signal
// coming apart rather than as the world wobbling. Being slabs of direction
// rather than of screen, they stay put in the world as you look around.
vec3 tearDir(vec3 d){
  float amount = uTear;
  if (amount < 0.001) return d;
  float slab = floor(d.y * (6.0 + amount * 16.0) + uTime * 0.4);
  float g = hash11(slab * 5.3 + floor(uTime * 6.0) * 1.7);
  d.xz = rot((g - 0.5) * amount * 1.6) * d.xz;
  d.y += (fract(g * 23.1) - 0.5) * amount * 0.12;
  return normalize(d);
}
`;

// DEPTH. A hole with irregular walls, receding. Nothing about it is
// centred or circular: the polar field itself is warped before anything is
// drawn on it, which is the only way to stop concentric contours coming out
// as a bullseye however messy the shading on top gets.
const tunnel = /* glsl */ `
float field(vec2 p){
  float t = uTime;

  // A vanishing point that wanders off centre and never settles.
  vec2 centre = vec2(sin(t * 0.037) * 0.5 + sin(t * 0.019) * 0.3,
                     sin(t * 0.045 + 1.7) * 0.22);
  vec2 q = vec2(p.x / aspect(), p.y) - centre;

  // Warp the polar field. Without this the contours are perfect circles no
  // matter what gets drawn on them.
  q += curl(q * 0.7, t * 0.09) * (0.35 + uBass * 0.8);

  // Rotating and anisotropic, so it is not even a stable ellipse.
  q = rot(t * 0.05) * q;
  q *= vec2(1.0, 1.0 + 0.4 * sin(t * 0.11));

  float r = max(length(q), 0.004);
  vec2 dir = q / r;

  // Radius modulated by direction, so the contours are irregular closed
  // loops rather than rings. Sampled on the unit vector, because a function
  // of atan() would leave a seam at plus or minus pi.
  r *= 1.0 + (fbm(dir * 2.6 + t * 0.06) - 0.5) * (0.5 + uTreble * 0.35);
  r = max(r, 0.004);

  // Log of the radius: geometric spacing, so the loops crowd toward the
  // vanishing point at every scale without one blown ring at the mouth.
  vec2 uv = vec2(atan(q.y, q.x) * 1.4, -log(r) * 2.1 - t * 0.5);

  vec2 flow = curl(uv * 0.5, t * 0.16);
  vec2 wall = uv + flow * (0.5 + uLevel * 0.9);
  vec2 ribs = uv + flow * 0.16;

  float v = turb(wall * 1.6);
  v = smoothstep(0.3, 0.63 - uTreble * 0.14, v) * 0.5;

  float ring = abs(fract(ribs.y * 0.7) - 0.5);
  v = max(v, (1.0 - smoothstep(0.03, 0.13, ring)) * (0.7 + uBass * 0.3));

  // Generous at the mouth: the radius is being pushed around hard above,
  // so a tight falloff here throws most of the plane away as black.
  v *= smoothstep(0.0, 0.16, r) * (1.0 - smoothstep(1.5, 2.4, r));

  return withDancers(v + uHit * 0.3, p);
}
`;

// SHARDS. Space folded back on itself, six times, with the angle and the
// fold distance of every pass pulled from noise rather than fixed. Folding
// by constants gives a kaleidoscope, which is regular and reads as a
// pattern; driving each pass from a field that drifts gives shattered plate
// and none of it repeats.
const fracture = /* glsl */ `
float field(vec2 p){
  float t = uTime;

  vec2 z = p * 1.1;
  z += curl(z * 0.5, t * 0.07) * (0.45 + uBass * 1.3);

  float v = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    // Angle and fold both wander, so no two passes agree for long.
    float a = t * 0.05 + fi * 2.399 + noise(vec2(fi * 3.1, t * 0.03)) * 3.4;
    z = rot(a) * z;
    z = abs(z) - (0.4 + 0.4 * noise(vec2(fi, t * 0.045)) + uBass * 0.22);

    // The crease between the folded halves is the only thing drawn.
    v += amp * exp(-abs(z.x - z.y) * (5.0 + uTreble * 16.0));
    amp *= 0.72;
    z *= 1.27;
  }

  v = pow(clamp(v * 0.34, 0.0, 1.0), 1.3);
  return withDancers(v * (0.8 + uLevel * 0.5) + uHit * 0.25, p);
}
`;

// MARBLING. Domain warp folded back on itself. Slow, weather-like, the one
// with no hard geometry in it at all.
const warp = /* glsl */ `
float field(vec2 p){
  p *= 1.3;
  float t = uTime * 0.09;

  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.7),
                fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.5));
  r += curl(p * 0.6, t * 0.5) * (0.4 + uBass * 0.9);

  float v = fbm(p + (3.2 + uBass * 2.2) * r);
  // Tight window high up the range: the brief is very dark, and a domain
  // warp left open blows out to white across most of the plane.
  v = smoothstep(0.47, 0.78 - uLevel * 0.1, v);

  // Contours through the field, so it reads as structure and not as fog.
  float c = abs(fract(v * 7.0) - 0.5);
  float contour = (1.0 - smoothstep(0.0, 0.12, c)) * 0.28 * uTreble;

  return withDancers(v * 0.74 + contour + uHit * 0.18, p);
}
`;

// VOLUME. A lattice of hollow boxes, disordered and rushing past. This one
// is a real raymarch, so the depth is genuine rather than stacked: the ray
// origin moves forward, which is what throws the structure out at the
// viewer. An onset lurches it forward.
const lattice = /* glsl */ `
float map(vec3 q){
  q.xz = rot(uTime * 0.13) * q.xz;
  q.xy = rot(uTime * 0.08) * q.xy;

  // Two displacements at different scales and along different axes. One
  // alone gives a lattice that is merely bent; two make it disordered.
  // Single octave each, because this runs 48 times for every pixel.
  float w1 = noise(q.xy * 0.42 + q.z * 0.25 + uTime * 0.22) - 0.5;
  float w2 = noise(q.yz * 0.9 - q.x * 0.4 - uTime * 0.17) - 0.5;
  q += w1 * (0.6 + uLevel * 0.75) + w2 * (0.3 + uBass * 0.45);

  // Per-cell size, so the stack is not a regular grid of identical boxes.
  // The smallest cells shrink to nothing, which opens holes through it.
  vec3 id = floor(q / 3.0);
  float h = hash12(id.xy + id.z * 37.0);
  vec3 c = mod(q, 3.0) - 1.5;

  float size = 0.34 + h * 0.44 + uBass * 0.2;
  float b = box3(c, vec3(size)) - 0.06;
  return max(b, -box3(c, vec3(size * 0.66)));
}

float field(vec2 p){
  // Forward motion is the depth cue here, and the onset shoves it.
  vec3 ro = vec3(0.0, 0.0, -6.0 + uTime * 1.15 + uHit * 0.9);
  vec3 rd = normalize(vec3(p, focal() * 1.1));

  // Volumetric, not a surface hit: the camera sits inside the lattice, so
  // the distance is regularly negative. Stepping by abs(d) with a floor
  // keeps the ray moving forward instead of stalling on the first sample.
  float t = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 48; i++){
    float d = map(ro + rd * t);
    // Squared falloff: a linear kernel collects light from everywhere the
    // ray passes and comes out flat mid-grey.
    float ad = abs(d);
    glow += 0.02 / (0.03 + ad * ad * 3.0);
    t += max(ad * 0.6, 0.07);
    if (t > 24.0) break;
  }

  // The accumulator sits in a narrow band well above zero, so a curve alone
  // only ever gives grey. The pedestal is what puts the voids back to black.
  float v = pow(clamp(glow * 0.062 - 0.46, 0.0, 1.0), 1.2);
  return withDancers(v * exp(-t * 0.05) + uHit * 0.16, p);
}
`;

// STRATA. Torn layers, sheared. The angle of the bedding wanders, the
// thickness of every band is its own random number, and the edges are eaten
// by turbulence so nothing lines up twice. Replaces the old horizontal band
// scan, which was too regular to read as anything but a test card.
const strata = /* glsl */ `
float field(vec2 p){
  float t = uTime;

  vec2 q = p + curl(p * 0.6, t * 0.08) * (0.5 + uBass * 1.4);

  // The bedding plane turns slowly, so the layers are never level.
  float ang = (noise(vec2(t * 0.035, 3.1)) - 0.5) * 2.6;
  float u = dot(q, vec2(cos(ang), sin(ang)));

  // Folded before it is cut, so the layers buckle rather than stack flat.
  u += fbm(q * 1.3 + t * 0.04) * (0.5 + uLevel * 0.7);

  float rate = 2.2 + floor(uLevel * 4.0);
  float band = floor(u * rate);
  float sd = hash11(band * 7.77 + 1.3);
  float f = fract(u * rate);

  // Every band its own thickness, and better than a third of them missing.
  float tear = turb(q * 2.6 + band * 11.0 + t * 0.16) - 0.5;
  float lo = 0.12 + sd * 0.3;
  float hi = lo + 0.16 + sd * 0.26 + uTreble * 0.14;
  float v = smoothstep(lo, hi, f + tear * 0.55) * (1.0 - smoothstep(hi, hi + 0.22, f));
  v *= step(0.36, sd);

  // A second, coarser bedding crossing the first at its own angle.
  float u2 = dot(q, vec2(cos(ang + 1.9), sin(ang + 1.9))) * 0.8;
  float b2 = hash11(floor(u2 * 1.6) * 3.17);
  v = max(v * 0.9, step(0.72, b2) * (1.0 - smoothstep(0.0, 0.3, abs(fract(u2 * 1.6) - 0.5))) * 0.5);

  return withDancers(v * (0.9 + uLevel * 0.5) + uHit * 0.24, p);
}
`;

// SWARM. Contour filaments at four scales, each advected by its own flow
// and each threaded at a slightly different level, so they drift across one
// another and tangle. No grid and no cells anywhere in it: the old version
// was voronoi, and voronoi always reads as a regular partition however hard
// the input is warped.
const swarm = /* glsl */ `
float field(vec2 p){
  float t = uTime;
  vec2 q = p * 1.25;

  float v = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);

    // Each scale rides its own flow, at its own speed and direction.
    vec2 o = curl(q * (0.45 + fi * 0.4), t * (0.05 + fi * 0.035) + fi * 2.7)
           * (0.55 + uBass * 1.5) * (1.0 - fi * 0.17);

    float n = turb((q + o) * (1.5 + fi * 1.35) + fi * 7.3);

    // Threaded at a level that drifts, so filaments appear and close up.
    float level = 0.4 + fi * 0.045 + sin(t * 0.09 + fi * 1.7) * 0.06;
    float width = 0.055 + uTreble * 0.1 + fi * 0.012;
    v += (1.0 - smoothstep(0.0, width, abs(n - level))) * (0.52 - fi * 0.075);
  }

  v = clamp(v, 0.0, 1.0);
  v *= 0.75 + 0.25 * fbm(q * 0.5 - t * 0.03);   // broad shading, so it is not flat
  return withDancers(v * (0.68 + uLevel * 0.45) + uHit * 0.2, p);
}
`;

// BODIES. The liquid one, where the figures carry the frame rather than
// passing through it. Everything else about them is in withDancers above.
const bodies = /* glsl */ `
float field(vec2 p){
  float t = uTime;

  vec2 q = p * 1.2;
  vec2 fl = curl(q * 0.6, t * 0.05) * (0.45 + uBass * 1.2);
  vec2 wq = vec2(fbm(q + fl + vec2(0.0, t * 0.05)),
                 fbm(q + fl + vec2(4.1, 1.7 - t * 0.04)));
  float liquid = fbm(q + (2.8 + uBass * 2.0) * (wq - 0.5) * 2.0);

  // Tight, and only slightly opened by level: the figures are read by
  // inverting this, so a field that brightens far with loudness takes the
  // contrast they depend on with it.
  liquid = smoothstep(0.50, 0.80 - uLevel * 0.04, liquid);

  return withDancers(liquid * 0.55, p);
}
`;

const FIELDS = { tunnel, fracture, warp, lattice, strata, swarm, bodies };

export const names = Object.keys(FIELDS);

export function fieldBody(name){
  const body = FIELDS[name];
  if (!body) throw new Error(`no shader named "${name}"`);
  return body;
}

// The sky: one evaluation per pixel, from the direction that pixel looks.
export function skyFragment(name){
  return 'precision highp float;\n' + UNIFORMS + HELPERS + fieldBody(name) + /* glsl */ `
varying vec3 vDir;

void main(){
  vec3 d = tearDir(normalize(vDir));
  vec2 p = mapDir(d) + gazePush(d);
  float c = clamp(field(p), 0.0, 1.0) * uGain;
  gl_FragColor = vec4(vec3(c), 1.0);
}
`;
}

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main(){
  // Object space is view direction: the sky is kept centred on the camera.
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
