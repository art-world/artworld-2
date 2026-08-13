// Named camera paths. Every vertical clip is a crop of this world: paths are
// data here, capture is deterministic on a fixed timestep. Do not add
// hand-flown one-off camera code — add a named path instead.

import * as THREE from 'three';

const FIXED_STEP = 1 / 30;

// name: ordered list of { t (seconds), position: [x,y,z], target: [x,y,z] }
export const paths = {
  // Wide establishing view dollying in to the phone unit, ending at the
  // handset/keypad hotspots (src/world.js SCAN_HOTSPOTS) so interaction
  // reads as the natural next beat once the move settles.
  approach: [
    { t: 0, position: [1.8, 2.2, 5.5], target: [-0.04, 1.4, 0.2] },
    { t: 2.5, position: [0.7, 1.8, 2.8], target: [-0.04, 1.4, 0.3] },
    { t: 4.5, position: [0.15, 1.6, 1.9], target: [-0.04, 1.4, 0.35] },
  ],
};

function sampleAtTime(path, t) {
  const keys = path;
  if (t <= keys[0].t) return keys[0];
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1];

  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  const alpha = span === 0 ? 0 : (t - a.t) / span;

  const position = new THREE.Vector3().fromArray(a.position)
    .lerp(new THREE.Vector3().fromArray(b.position), alpha);
  const target = new THREE.Vector3().fromArray(a.target)
    .lerp(new THREE.Vector3().fromArray(b.target), alpha);

  return { position: position.toArray(), target: target.toArray() };
}

export function applyPath(camera, name, t) {
  const path = paths[name];
  if (!path) throw new Error(`unknown path: ${name}`);
  const sample = sampleAtTime(path, t);
  camera.position.fromArray(sample.position);
  camera.lookAt(new THREE.Vector3().fromArray(sample.target));
}

export function pathDuration(name) {
  const path = paths[name];
  if (!path) throw new Error(`unknown path: ${name}`);
  return path[path.length - 1].t;
}

// Captures a deterministic 1080x1920 webm of a named path by stepping the
// render loop at a fixed timestep rather than wall-clock time.
export async function grab(name, ctx) {
  const { renderer, scene, camera, fps = 30 } = ctx;
  const duration = pathDuration(name);
  const totalFrames = Math.ceil(duration / FIXED_STEP);

  const canvas = renderer.domElement;
  const stream = canvas.captureStream(0); // manual frame pacing
  const track = stream.getVideoTracks()[0];

  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  recorder.start();
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame * FIXED_STEP;
    applyPath(camera, name, t);
    renderer.render(scene, camera);
    if (track.requestFrame) track.requestFrame();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
  recorder.stop();

  return done;
}
