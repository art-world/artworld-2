// Six fragment shaders, written for this room. Grayscale only: every one
// returns a single luminance value, so the projection can never introduce
// colour into the space.
//
// All six are fluid. The shared move is curl-noise advection: the field is
// pushed around by a divergence-free flow before it is drawn, so structure
// smears and folds instead of sitting still. What keeps them apart is what
// gets advected. Depth, radial rings, marbling, volume, signal, cells.
//
// Uniforms available to all six:
//   uTime    seconds since load
//   uRes     projection resolution in pixels
//   uLevel   broadband loudness, 0..1, smoothed
//   uBass    low band, 0..1, smoothed
//   uTreble  high band, 0..1, smoothed
//   uHit     onset, spikes on a transient and falls away fast
//   uGain    output gain, set from config
//
// Each shader implements `float field(vec2 p)` where p is centred on the
// plane and scaled so the short edge runs -1..1. The prelude wraps it.

const PRELUDE = /* glsl */ `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uLevel;
uniform float uBass;
uniform float uTreble;
uniform float uHit;
uniform float uGain;
// The dancers, rendered offscreen. r is facing, g is silhouette, b is how
// the figure should be treated, a is coverage.
uniform sampler2D uDancers;

// Where the pointer is, in the same space as p, and how fast it is moving.
// Velocity decays, so the field answers movement rather than position alone.
uniform vec2  uPointer;
uniform float uPointerVel;

varying vec2 vUv;

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
  for (int i = 0; i < 5; i++){
    v += a * noise(p);
    p = rot(0.5) * p * 2.02;
    a *= 0.5;
  }
  return v;
}

// Three octaves, for use inside curl where it is evaluated four times.
float fbm3(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){
    v += a * noise(p);
    p = rot(0.5) * p * 2.02;
    a *= 0.5;
  }
  return v;
}

// Ridged turbulence. Creases and filaments rather than soft blobs.
float turb(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * abs(noise(p) * 2.0 - 1.0);
    p = rot(0.7) * p * 2.03;
    a *= 0.5;
  }
  return v;
}

// Curl of a noise field. Divergence-free, so it swirls and folds the field
// rather than shunting all of it one way. This is what makes the set read
// as liquid instead of as scrolling texture.
vec2 curl(vec2 p, float t){
  const float e = 0.09;
  float nx1 = fbm3(p + vec2(e, 0.0) + t);
  float nx0 = fbm3(p - vec2(e, 0.0) + t);
  float ny1 = fbm3(p + vec2(0.0, e) + t);
  float ny0 = fbm3(p - vec2(0.0, e) + t);
  return vec2(ny1 - ny0, nx0 - nx1) / (2.0 * e);
}

// Depth for the shaders that have it. A stack of slices, each scaled by
// perspective and composited front to back so near ones occlude far ones.
// The stack runs the near way: every slice's depth DECREASES with time, so
// the pattern grows and passes the viewer rather than receding into the
// wall. A true volumetric raymarch through 3D noise reads better still, but
// costs roughly seven times as much per pixel and this plane covers most of
// the screen.
//
// k is distance from the viewer, so a slice fades out as k falls to zero
// and it sweeps past, and fades in at the far end of the stack.
float sliceFade(float k, float lo, float hi){
  return smoothstep(0.0, lo, k) * (1.0 - smoothstep(hi, hi + 1.4, k));
}

// The projection is much wider than it is tall. Shaders need its aspect to
// stay undistorted, and the raymarchers need a focal length derived from it
// or they end up with an absurdly wide lens.
float aspect(){ return uRes.x / max(uRes.y, 1.0); }
float focal(){ return aspect() / 1.2; }

// The dancers, composited into whatever field a shader has produced.
// Every shader returns through here, so the figures are in all of them.
//
// A body does not replace the field. It bends and brightens what is already
// there, so the field's own filaments keep running across it and the figure
// looks made of the same material as the rest of the frame rather than a
// lit render laid on top. Pure modulation goes too far on its own: where
// the field is black it leaves the body black as well, so there is a small
// floor, scaled by the field so it still carries its texture.
//
// Blue carries the treatment. Three of them, blended by weight rather than
// branched, so a figure is never half one thing and half another.
float withDancers(float v, vec2 p){
  float t = uTime;

  // Two turbulence samples, used for both the distortion and the erosion.
  // Evaluating them once and reusing matters: this runs for every pixel of
  // a plane that fills most of the screen.
  float e1 = turb(p * 1.3 + t * 0.12);
  float e2 = turb(p * 4.0 - t * 0.26);

  vec2 duv = vUv
           + curl(p * 0.9, t * 0.07) * (0.028 + uBass * 0.075)
           + (vec2(e1, e2) - 0.4) * (0.075 + uTreble * 0.11);

  // Blocky tearing: quantised, so it reads as signal rather than as noise.
  vec2 cell = floor(vUv * vec2(42.0, 15.0));
  float tear = hash12(cell + floor(t * 9.0));
  duv.x += (tear - 0.5) * (0.004 + uHit * 0.022);

  vec4 dz = texture2D(uDancers, duv);
  float cov = dz.a;
  if (cov < 0.004) return v;

  float face = dz.r;
  float rim = dz.g;
  float treat = dz.b;

  // The outline comes apart. A clean rim off the normal is a continuous
  // line all the way round, which is the one thing that still reads as a
  // traced figure; this eats sections out of it so the edge is only ever
  // partly there. Built from the two turbulence samples already taken
  // above rather than new ones, because this runs for most of the screen.
  float brk = smoothstep(0.14, 0.5, e2 * 0.85 + e1 * 0.3);
  float rimBroken = rim * (0.26 + brk * 1.35);

  // A few keep a clear edge. If every figure is fragments there is nothing
  // for the eye to resolve against, and the whole wall reads as texture.
  float rimClear = rim * (0.88 + brk * 0.4);

  // Treatment 0.3 is the clear one, in a narrow band so it never bleeds
  // into the neighbouring treatments.
  float wClear = 1.0 - smoothstep(0.0, 0.1, abs(treat - 0.3));
  rim = mix(rimBroken, rimClear, wClear);

  // Body reads off the broken rim too, so the figures come apart in
  // sections rather than only losing their outline.
  float body = face * 0.5 + rim * 0.8;

  // Erosion is what actually reads as blur; the warp only displaces. So
  // the clear ones are barely eroded at all, which is what holds them
  // together as bodies instead of as drifting fragments.
  float er = e1 * 0.62 + e2 * 0.45;
  float sil = cov * mix(smoothstep(0.06, 0.48, er),
                        smoothstep(-0.12, 0.28, er), wClear);

  // All three are hollow. None of them fills the body in: the field runs
  // straight through every one, and what differs is only how the surface
  // catches. An earlier pass inverted the field inside the silhouette and
  // strobed it, which filled the figure with flat grey and lost the thing
  // that makes the rest of them work.

  // Metal: the facing term cut into hard bands, which is what makes a
  // surface read as polished rather than lit.
  float band = fract(face * 4.0 + rim * 1.6 - t * 0.25);
  float chrome = smoothstep(0.3, 0.46, band) * (1.0 - smoothstep(0.54, 0.72, band));
  float mMetal = v * 0.32 + chrome * (0.7 + uHit * 0.35) + rim * 0.45;

  // Shell: the field almost untouched inside, but the silhouette carries
  // hard. A faint edge is enough on a bright field and vanishes entirely on
  // a dark one, and half these shaders are dark.
  float mShell = v * (0.92 + body * 0.35) + rim * (1.0 + uHit * 0.45) + face * 0.16;

  // The clear variant of the same treatment: still hollow, but the body's
  // own shading comes through so it resolves as a figure and not an outline.
  float mShellClear = v * (0.8 + body * 0.5) + rim * (1.05 + uHit * 0.4) + face * 0.44;
  mShell = mix(mShell, mShellClear, wClear);

  // Etched: contour lines running across the form, interior left open.
  float et = fract(face * 7.0 - rim * 2.0 + t * 0.14);
  float etch = (1.0 - smoothstep(0.0, 0.11, abs(et - 0.5))) * (0.62 + uTreble * 0.45);
  float mEtch = v * 0.72 + etch * 1.2 + rim * 0.55;

  float wMetal = 1.0 - smoothstep(0.12, 0.34, treat);
  float wEtch = smoothstep(0.66, 0.88, treat);
  float wShell = clamp(1.0 - wMetal - wEtch, 0.0, 1.0);

  float inside = mMetal * wMetal + mShell * wShell + mEtch * wEtch;

  return mix(v, inside, sil) + rim * sil * (0.08 + uHit * 0.22);
}

// A disturbance the visitor drags around. Applied in the epilogue, so it
// bends whatever a shader draws rather than each one having to opt in, and
// it answers movement as well as position: hold still and it settles.
vec2 pointerPush(vec2 p){
  vec2 d = p - uPointer * vec2(aspect(), 1.0);
  float r2 = dot(d, d);
  // Tight falloff: a small pointed disturbance under the cursor. At a wide
  // radius this stops being a disturbance and just slides the whole plane
  // around, which reads as the image coming loose rather than responding.
  // Stronger and a little wider than it reads on a desktop: a fingertip
  // covers more of a phone screen than a cursor does, and the disturbance
  // has to be findable under it.
  float k = (0.16 + uPointerVel * 1.9) * exp(-r2 * 12.0);
  return d * k;
}

float box3(vec3 p, vec3 b){
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}
`;

const EPILOGUE = /* glsl */ `
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= uRes.x / max(uRes.y, 1.0);
  p += pointerPush(p);
  float c = clamp(field(p), 0.0, 1.0) * uGain;

  // Throw falls off at the edges the way a real projection does. It also
  // takes the aliasing off the border, which at grazing angles is ugly.
  vec2 e = smoothstep(vec2(0.0), vec2(0.035, 0.05), vUv)
         * smoothstep(vec2(0.0), vec2(0.035, 0.05), 1.0 - vUv);
  c *= e.x * e.y;

  gl_FragColor = vec4(vec3(c), 1.0);
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

export function fragmentShader(name){
  const body = FIELDS[name];
  if (!body) throw new Error(`no shader named "${name}"`);
  return PRELUDE + body + EPILOGUE;
}

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
