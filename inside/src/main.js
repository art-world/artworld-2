import * as THREE from 'three';
import { config } from './config.js';
import { buildWorld } from './world.js';
import { createAudio } from './audio.js';
import { createGrade } from './grade.js';
import { createUI } from './ui.js';
import { readConnection, seedFrom, renderConnection } from './net.js';
import { grab, pathNames, paths } from './paths.js';

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.render.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);

// Anyone who has asked their system not to animate things gets a version
// that holds nearly still rather than one that cannot be looked at.
const stillPlease = config.render.respectReducedMotion &&
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Wide, because the point is to be inside it rather than looking at it.
const camera = new THREE.PerspectiveCamera(config.view.fov, window.innerWidth / window.innerHeight, 0.05, 500);
const forward = new THREE.Vector3();

const loadingEl = document.getElementById('loading');
const countEl = loadingEl.querySelector('.count');
const barEl = loadingEl.querySelector('.bar i');
let shown = 0;

function setProgress(fraction){
  shown = Math.max(shown, Math.min(1, fraction));
  const pct = Math.round(shown * 100);
  countEl.textContent = String(pct).padStart(2, '0');
  barEl.style.width = pct + '%';
}

const world = await buildWorld(renderer, config, setProgress);
const grade = createGrade(renderer, config.grade);
const audio = createAudio(config.tracks, () => updateHint());

let current = 0;

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
  else if (audio.refused) ui.setHint('tap to play');
  else if (audio.contextState !== 'running') ui.setHint('tap again for sound');
  else if (audio.element.paused) ui.setHint('paused');
  else ui.setHint('');
}

function go(next){
  const n = config.tracks.length;
  current = ((next % n) + n) % n;
  const track = config.tracks[current];
  world.setShader(track.shader);
  world.setScene(track.scene);
  // Every change of track is a call placed, and the booth shows it going
  // through.
  if (world.booth) world.booth.connect();
  ui.setTrack(current, track);
  audio.select(current, { autoplay: audio.started });
  // The one after this, so changing track never waits on a cold fetch.
  audio.preload(current + 1);
  updateHint();
}

// ---------------------------------------------------------------- looking
// Yaw and pitch, driven by drag, by the phone, or by nothing at all. A
// flick keeps travelling and slows down, so the world has some weight to
// it rather than stopping dead with the finger.
const look = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 };
const drag = { active: false, x: 0, y: 0, moved: 0 };
let lastInput = -99;

// A tap, as opposed to a drag, and whether the call had already been taken
// when it started. Read before start() runs on the same press.
const tap = { x: 0, y: 0, t: 0, answered: false };

function onDown(e){
  drag.active = true;
  drag.x = e.clientX;
  drag.y = e.clientY;
  look.vYaw = 0;
  look.vPitch = 0;
  tap.x = e.clientX;
  tap.y = e.clientY;
  tap.t = performance.now();
  tap.answered = audio.started;
}

function onMove(e){
  if (!drag.active) return;
  const w = Math.max(window.innerWidth, 1);
  const dx = (e.clientX - drag.x) / w;
  const dy = (e.clientY - drag.y) / w;
  drag.x = e.clientX;
  drag.y = e.clientY;

  // Dragging right turns the view left, which is how dragging a world works
  // rather than how dragging a camera works.
  look.vYaw -= dx * config.view.drag;
  look.vPitch -= dy * config.view.drag;
  drag.moved = Math.min(1, drag.moved + Math.hypot(dx, dy) * 9);
  lastInput = performance.now() / 1000;
}

// The booth is the thing to touch. Nothing else in the world is.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function overBooth(x, y){
  if (!world.booth) return false;
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return world.booth.hit(raycaster.ray);
}

function onUp(e){
  drag.active = false;
  if (!e || e.type !== 'pointerup' || e.target !== canvas) return;
  const still = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10;
  const quick = performance.now() - tap.t < 450;
  // Tapping the booth answers it if it is ringing, and places a call if it
  // is not: the next track. The first tap of all is left to start(), or
  // taking the first call would hang straight up on it.
  if (!tap.answered || !still || !quick || !overBooth(e.clientX, e.clientY)) return;
  if (audio.element.paused){ audio.toggle(); updateHint(); }
  else go(current + 1);
}

function onHover(e){
  if (drag.active || e.pointerType !== 'mouse' || e.target !== canvas) return;
  canvas.style.cursor = overBooth(e.clientX, e.clientY) ? 'pointer' : '';
}

window.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointermove', onHover);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

// The phone. Permission on iOS is only grantable inside a gesture, so it
// is asked for on the first tap alongside the audio.
const tilt = { yaw: null, pitch: 0, baseYaw: null };
let tiltAsked = false;

function onOrientation(e){
  if (e.alpha === null || e.beta === null) return;
  const yaw = THREE.MathUtils.degToRad(e.alpha);
  if (tilt.baseYaw === null) tilt.baseYaw = yaw;
  tilt.yaw = yaw - tilt.baseYaw;
  tilt.pitch = THREE.MathUtils.degToRad(e.beta - 70);
  lastInput = performance.now() / 1000;
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

// Phones dim and sleep partway through a track otherwise. Released when
// the page is hidden, and taken again when it comes back.
let wakeLock = null;
async function keepAwake(){
  try {
    if (!navigator.wakeLock || wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) { /* refused or unsupported, not fatal */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

function start(){
  enableTilt();
  keepAwake();
  audio.wake();
  if (audio.started) return;
  audio.select(current);
  updateHint();
}
window.addEventListener('pointerdown', start);
window.addEventListener('keydown', start);
window.addEventListener('touchend', start);
window.addEventListener('click', start);

audio.element.addEventListener('ended', () => go(current + 1));
audio.element.addEventListener('play', updateHint);
audio.element.addEventListener('pause', updateHint);

function resize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.render.maxPixelRatio));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  grade.setSize(w, h);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let lastContext = '';

const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

// Capture takes the loop over: the live one is driven by the clock, and a
// clip has to be driven by the frame index instead or it is not repeatable.
let capturing = false;

// Held fixed while recording. A clip driven by live playback comes out
// different on every take.
const STILL_AUDIO = { level: 0.55, bass: 0.6, treble: 0.45, hit: 0 };

function renderFrame(t, shot){
  look.yaw = shot.yaw;
  look.pitch = shot.pitch;
  camera.rotation.set(shot.pitch, shot.yaw, 0, 'YXZ');
  camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
  if (camera.fov !== shot.fov){ camera.fov = shot.fov; camera.updateProjectionMatrix(); }
  world.sky.position.copy(camera.position);
  camera.getWorldDirection(forward);

  const booth = world.update(t, STILL_AUDIO, { vel: 0 }, forward, camera, { ringing: false });

  renderer.setRenderTarget(grade.target);
  renderer.clear();
  renderer.render(world.scene, camera);
  world.renderFigures(renderer, camera, t, STILL_AUDIO);
  grade.render(t, STILL_AUDIO.level, booth.connect * 0.9);
}

const capture = {
  canvas,
  renderer,
  setSize(w, h){
    capturing = true;
    renderer.setPixelRatio(1);          // the size asked for, exactly
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grade.setSize(w, h);
  },
  renderFrame,
  restore(){
    capturing = false;
    resize();
    requestAnimationFrame(frame);
  },
};

// The camera travels the tour in paths.js: round the booth, up close,
// through it, over it, down through it and away. The same named moves a
// grab records, so the live site and a clip of it are one thing. Distance
// along it is accumulated rather than read off the clock, so a track that
// moves faster or slower changes the speed without jumping the camera.
let travelled = 0;
let lastTime = 0;
// How far the gaze has gone back to the tour's since the visitor last
// took it over. Starts fully back: nobody has touched anything yet.
let follow = 1;
{
  const first = paths.tour(0);
  look.yaw = first.yaw;
  look.pitch = first.pitch;
}

function frame(){
  if (capturing) return;
  const time = clock.getElapsedTime();
  const now = performance.now() / 1000;
  const levels = audio.update();
  const v = config.view;

  const dt = Math.min(0.1, Math.max(0, time - lastTime));
  lastTime = time;
  const pan = config.tracks[current].scene.pan || 1;
  travelled += dt * v.travel * (0.5 + pan * 0.5) * (stillPlease ? 0.15 : 1);
  const shot = paths.tour(travelled);

  // Momentum, then damping. A flick keeps going for a moment and then
  // the tour takes the gaze back.
  look.yaw += look.vYaw;
  look.pitch += look.vPitch;
  look.vYaw *= v.damping;
  look.vPitch *= v.damping;
  drag.moved *= 0.9;

  if (tilt.yaw !== null){
    // The phone turns the view about wherever the tour is looking, so it
    // looks round the booth rather than away from it for good.
    look.yaw += wrapAngle(shot.yaw + tilt.yaw - look.yaw) * v.ease;
    look.pitch += (shot.pitch + tilt.pitch - look.pitch) * v.ease;
  } else if (now - lastInput > v.idle){
    // Rates are per frame at 60, scaled to the real frame time, so a phone
    // running at 30 comes back as quickly as a desktop at 120.
    const frames = dt * 60;
    follow += (1 - follow) * (1 - Math.pow(1 - v.settle, frames));
    const k = 1 - Math.pow(1 - v.follow * follow, frames);
    look.yaw += wrapAngle(shot.yaw - look.yaw) * k;
    look.pitch += (shot.pitch - look.pitch) * k;
  } else {
    follow = 0;
  }

  look.pitch = Math.max(-v.pitchLimit, Math.min(v.pitchLimit, look.pitch));
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
  if (Math.abs(camera.fov - shot.fov) > 0.01){
    camera.fov += (shot.fov - camera.fov) * (1 - Math.pow(0.95, dt * 60));
    camera.updateProjectionMatrix();
  }
  world.sky.position.copy(camera.position);

  camera.getWorldDirection(forward);
  const reach = { vel: Math.min(1, drag.moved + levels.hit * 0.35) };
  // It rings until the call is taken, and again whenever it is put down.
  const ringing = !stillPlease && (!audio.started || audio.element.paused);
  const booth = world.update(time, levels, reach, forward, camera, { ringing });

  const el = audio.element;
  if (ui.setPlayed) ui.setPlayed(el.duration ? el.currentTime / el.duration : 0);
  if (audio.contextState !== lastContext){ lastContext = audio.contextState; updateHint(); }

  renderer.setRenderTarget(grade.target);
  renderer.clear();
  renderer.render(world.scene, camera);
  world.renderFigures(renderer, camera, time, levels);
  grade.render(time, levels.level, booth.connect * (stillPlease ? 0.2 : 0.9));

  requestAnimationFrame(frame);
}

// The world is generated from the visitor's own connection: the field is
// offset by it, so nobody is standing where anybody else is. Read once,
// shown, used, and let go. Nothing is stored and nothing is sent anywhere.
readConnection().then((connection) => {
  const seed = seedFrom(connection);
  if (seed) world.setOrigin(seed, seed * 0.61);
  const el = document.getElementById('readout');
  if (el) renderConnection(el, connection);
  // And on the booth's sign, where it used to say what the booth was.
  if (world.booth) world.booth.setSign(connection);
}).catch(() => { /* no readout, no world offset, nothing broken */ });

// Capture is part of the piece rather than a debug hook: every vertical
// clip is a crop of this world, and CLAUDE.md asks for it to be named and
// repeatable. From the console: ARTWORLD.grab('turn', { seconds: 12 }).
window.ARTWORLD = {
  paths: pathNames,
  tracks: config.tracks.map((t) => t.title),
  go: (i) => go(i),
  grab: (name, options) => grab(name, capture, options),
};

resize();
ui.setTrack(current, config.tracks[current]);
world.setShader(config.tracks[current].shader);
world.setScene(config.tracks[current].scene);
audio.preload(current + 1);
updateHint();
ui.reveal();
document.body.classList.add('loaded');
setProgress(1);
loadingEl.classList.add('done');
frame();
