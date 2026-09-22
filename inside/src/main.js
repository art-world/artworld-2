import * as THREE from 'three';
import { config } from './config.js';
import { buildWorld } from './world.js';
import { createAudio } from './audio.js';
import { createGrade } from './grade.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('view');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
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
  ui.setTrack(current, track);
  audio.select(current, { autoplay: audio.started });
  updateHint();
}

// ---------------------------------------------------------------- looking
// Yaw and pitch, driven by drag, by the phone, or by nothing at all. A
// flick keeps travelling and slows down, so the world has some weight to
// it rather than stopping dead with the finger.
const look = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 };
const drag = { active: false, x: 0, y: 0, moved: 0 };
let lastInput = -99;

function onDown(e){
  drag.active = true;
  drag.x = e.clientX;
  drag.y = e.clientY;
  look.vYaw = 0;
  look.vPitch = 0;
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

function onUp(){ drag.active = false; }

window.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
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

function start(){
  enableTilt();
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  grade.setSize(w, h);
}
window.addEventListener('resize', resize);

const clock = new THREE.Clock();
let lastContext = '';

function frame(){
  const time = clock.getElapsedTime();
  const now = performance.now() / 1000;
  const levels = audio.update();
  const v = config.view;

  // Momentum, then damping. Left alone for a moment the drift takes over,
  // so it is never a still image even with nobody touching it.
  look.yaw += look.vYaw;
  look.pitch += look.vPitch;
  look.vYaw *= v.damping;
  look.vPitch *= v.damping;
  drag.moved *= 0.9;

  const idle = now - lastInput > v.idle;
  if (idle && tilt.yaw === null){
    look.yaw += v.driftYaw * 0.016;
    look.pitch += Math.sin(time * 0.07) * v.driftPitch * 0.016;
  }

  if (tilt.yaw !== null){
    look.yaw += (tilt.yaw - look.yaw) * v.ease;
    look.pitch += (tilt.pitch - look.pitch) * v.ease;
  }

  look.pitch = Math.max(-v.pitchLimit, Math.min(v.pitchLimit, look.pitch));
  camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');

  // Automatic pan. Two rates on each axis so the path never repeats and
  // never sits still, and wide enough that figures pass each other rather
  // than only turning on the spot.
  const pan = v.pan;
  camera.position.set(
    Math.sin(time * pan.rate) * pan.radius + Math.sin(time * pan.rate * 2.7 + 1.3) * pan.radius * 0.28,
    Math.sin(time * pan.rate * 0.71 + 1.1) * pan.rise,
    Math.cos(time * pan.rate * 0.83) * pan.radius + Math.cos(time * pan.rate * 1.9) * pan.radius * 0.22
  );
  world.sky.position.copy(camera.position);

  camera.getWorldDirection(forward);
  const reach = { vel: Math.min(1, drag.moved + levels.hit * 0.35) };
  world.update(time, levels, reach, forward);

  const el = audio.element;
  if (ui.setPlayed) ui.setPlayed(el.duration ? el.currentTime / el.duration : 0);
  if (audio.contextState !== lastContext){ lastContext = audio.contextState; updateHint(); }

  renderer.setRenderTarget(grade.target);
  renderer.clear();
  renderer.render(world.scene, camera);
  world.renderFigures(renderer, camera, time, levels);
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
