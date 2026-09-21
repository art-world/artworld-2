import * as THREE from 'three';
import { config } from './config.js';
import { buildWorld } from './world.js';
import { createAudio } from './audio.js';
import { createGrade } from './grade.js';
import { createUI } from './ui.js';
import { sample } from './camera.js';

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.05, 400);
const lookAt = new THREE.Vector3();
const back = new THREE.Vector3();   // scratch, so the frame loop allocates nothing

// The ticker counts the models and their buffers, which is the bulk of the
// wait on a cold load. It is declared before the world because the world is
// what it is counting.
const loadingEl = document.getElementById('loading');
const countEl = loadingEl.querySelector('.count');
const barEl = loadingEl.querySelector('.bar i');
let shown = 0;

function setProgress(fraction){
  // Never counts backwards: the manager reports per file, and a later file
  // finishing first would otherwise make the number drop.
  shown = Math.max(shown, Math.min(1, fraction));
  const pct = Math.round(shown * 100);
  countEl.textContent = String(pct).padStart(2, '0');
  barEl.style.width = pct + '%';
}

const world = await buildWorld(renderer, config, setProgress);
const grade = createGrade(renderer, config.grade);
const audio = createAudio(config.tracks, () => updateHint());

let current = 0;
let trackStart = performance.now() / 1000;

const ui = createUI({
  count: config.tracks.length,
  onPrev: () => go(current - 1),
  onNext: () => go(current + 1),
  onToggle: () => { audio.toggle(); updateHint(); },
  onSeek: (fraction) => {
    const el = audio.element;
    if (el.duration) el.currentTime = fraction * el.duration;
  },
});

function updateHint(){
  if (!audio.started) ui.setHint('tap or press any key to play');
  // Refused is not paused. A browser turning playback down reads as a
  // stopped player otherwise, which is what the first tap on a phone used
  // to report back.
  else if (audio.refused) ui.setHint('tap to play');
  else if (audio.element.paused) ui.setHint('paused');
  else ui.setHint('');
}

let switchAt = -99;
let switchDir = 1;

function go(next){
  const n = config.tracks.length;
  current = ((next % n) + n) % n;
  const track = config.tracks[current];
  world.setShader(track.shader);
  trackStart = performance.now() / 1000;
  switchAt = trackStart;
  switchDir = -switchDir;
  ui.setTrack(current, track);
  // Only chase playback once the visitor has started it.
  audio.select(current, { autoplay: audio.started });
  updateHint();
}

// Phone tilt. Reading orientation needs permission on iOS and it is only
// grantable from inside a gesture, which is why it is asked for here rather
// than at load.
const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let tiltAsked = false;

function onOrientation(e){
  if (e.gamma === null || e.beta === null) return;
  tilt.tx = Math.max(-1, Math.min(1, e.gamma / 40));
  tilt.ty = Math.max(-1, Math.min(1, (e.beta - 40) / 40));
}

function enableTilt(){
  if (tiltAsked) return;
  tiltAsked = true;
  const D = window.DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission === 'function'){
    D.requestPermission()
      .then((r) => { if (r === 'granted') window.addEventListener('deviceorientation', onOrientation); })
      .catch(() => {});
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
}

// The room runs from load. Sound waits for a gesture, because browsers
// require one. Anything at all counts.
function start(){
  enableTilt();
  // Before the early return. A context that failed to resume on the first
  // gesture used to stay suspended for good, because every later tap hit
  // the return above it: the first track played silently and only changing
  // track recovered, since that path resumes on its own.
  audio.wake();
  if (audio.started) return;
  audio.select(current);
  updateHint();
}
window.addEventListener('pointerdown', start);
window.addEventListener('keydown', start);

audio.element.addEventListener('ended', () => go(current + 1));
audio.element.addEventListener('play', updateHint);
audio.element.addEventListener('pause', updateHint);

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  grade.setSize(w, h);
}
window.addEventListener('resize', resize);

// Pointer parallax. Held as a target the camera eases toward, so a flick of
// the mouse does not snap the frame. Never written into the path itself:
// camera.js stays a pure function of time.
const pointer = { x: 0, y: 0, tx: 0, ty: 0, vel: 0 };
window.addEventListener('pointermove', (e) => {
  pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
});
// Let go when the pointer leaves, rather than holding the last offset.
window.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });

const clock = new THREE.Clock();

function frame(){
  const time = clock.getElapsedTime();
  const local = performance.now() / 1000 - trackStart;
  const levels = audio.update();

  // Guarded because there is no build step and so no content hashing: a
  // returning visitor can hold a cached ui.js against a fresh main.js, and
  // an unguarded call there throws on the first frame and kills the render
  // loop for good. Losing the play bar is a far better failure.
  const el = audio.element;
  if (ui.setPlayed) ui.setPlayed(el.duration ? el.currentTime / el.duration : 0);

  // Offscreen first: the projection samples the result, so it has to exist
  // before the room is drawn.
  world.renderDancers(time, levels);
  world.update(time, levels, config, pointer);

  const shot = sample(config.tracks[current].move, local, world.room);

  const m = config.mouse;
  const px = pointer.x, py = pointer.y;
  pointer.x += (pointer.tx - pointer.x) * m.ease;
  pointer.y += (pointer.ty - pointer.y) * m.ease;

  // How fast it is moving, with a slow decay. The field answers movement as
  // well as position, so holding still lets it settle.
  const moved = Math.hypot(pointer.x - px, pointer.y - py);
  pointer.vel = Math.max(Math.min(1, moved * 14), pointer.vel * 0.93);

  const tl = config.tilt;
  tilt.x += (tilt.tx - tilt.x) * tl.ease;
  tilt.y += (tilt.ty - tilt.y) * tl.ease;

  camera.position.set(
    shot.pos[0] + pointer.x * m.strength + tilt.x * tl.strength,
    Math.max(0.3, shot.pos[1] - pointer.y * m.strength * 0.45 - tilt.y * tl.strength * 0.4),
    shot.pos[2]
  );
  // The aim point swings against the camera, which turns a slide into a
  // parallax rather than a pan.
  lookAt.set(
    shot.look[0] - pointer.x * m.look - tilt.x * tl.strength * 0.35,
    shot.look[1] + pointer.y * m.look * 0.5 + tilt.y * tl.strength * 0.3,
    shot.look[2]
  );

  // The whip on a track change: thrown back along the view, opened up and
  // rolled, settling into the new path inside about a second. Alternating
  // the roll each time stops consecutive switches feeling identical.
  const sw = config.switchShot;
  const kick = Math.exp(-(performance.now() / 1000 - switchAt) * sw.decay);
  if (kick > 0.003){
    back.copy(camera.position).sub(lookAt).normalize();
    camera.position.addScaledVector(back, sw.pull * kick);
  }

  camera.lookAt(lookAt);

  // Horizon follows the phone, and takes the switch roll with it.
  const roll = tilt.x * tl.roll + (kick > 0.003 ? sw.roll * kick * switchDir : 0);
  if (Math.abs(roll) > 0.0005) camera.rotateZ(roll);

  const fov = shot.fov + sw.fov * kick;
  if (Math.abs(camera.fov - fov) > 0.01){
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  renderer.setRenderTarget(grade.target);
  renderer.render(world.scene, camera);
  grade.render(time, levels.level);

  requestAnimationFrame(frame);
}

resize();
ui.setTrack(current, config.tracks[current]);
world.setShader(config.tracks[current].shader);
updateHint();
ui.reveal();
document.body.classList.add('loaded');
setProgress(1);
loadingEl.classList.add('done');
frame();
