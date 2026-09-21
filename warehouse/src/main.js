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

const world = await buildWorld(renderer, config);
const grade = createGrade(renderer, config.grade);
const audio = createAudio(config.tracks);

let current = 0;
let trackStart = performance.now() / 1000;

const ui = createUI({
  count: config.tracks.length,
  onPrev: () => go(current - 1),
  onNext: () => go(current + 1),
  onToggle: () => { audio.toggle(); updateHint(); },
});

function updateHint(){
  if (!audio.started) ui.setHint('press any key or click to play');
  else if (audio.element.paused) ui.setHint('paused');
  else ui.setHint('');
}

function go(next){
  const n = config.tracks.length;
  current = ((next % n) + n) % n;
  const track = config.tracks[current];
  world.setShader(track.shader);
  trackStart = performance.now() / 1000;
  ui.setTrack(current, track);
  // Only chase playback once the visitor has started it.
  audio.select(current, { autoplay: audio.started });
  updateHint();
}

// The room runs from load. Sound waits for a gesture, because browsers
// require one. Anything at all counts.
function start(){
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

  camera.position.set(
    shot.pos[0] + pointer.x * m.strength,
    Math.max(0.3, shot.pos[1] - pointer.y * m.strength * 0.45),
    shot.pos[2]
  );
  // The aim point swings against the camera, which turns a slide into a
  // parallax rather than a pan.
  lookAt.set(
    shot.look[0] - pointer.x * m.look,
    shot.look[1] + pointer.y * m.look * 0.5,
    shot.look[2]
  );
  camera.lookAt(lookAt);
  if (Math.abs(camera.fov - shot.fov) > 0.01){
    camera.fov = shot.fov;
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
frame();
