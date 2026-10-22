// Named camera paths and deterministic capture.
//
// Every vertical clip is a crop of this world, so the paths are data and
// the capture runs on a fixed timestep rather than on the clock. The same
// name gives the same clip every time, on any machine, whatever the frame
// rate happens to be while it records. Screen recording gives none of that.
//
// Audio is held at a fixed level during a grab for the same reason: a clip
// driven by live playback is different on every take.

import { config } from './config.js';

// --- the tour ------------------------------------------------------------
// The scan is placed so the ground is at y = 0 and the underpass runs along
// z through the origin, under a deck `length` long, between walls `width`
// apart, with its underside `deck` high. Every move is laid out against
// those numbers, so a re-placed or re-measured scan moves the tour with it.
// Each move is a position and a direction over its own progress s, 0 to 1,
// and u, its local seconds. The tour plays them in order with a crossfade.

const P = config.place;
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const wrap = (a) => a - TAU * Math.round(a / TAU);

// Progress that slows in the middle, so a walk lingers under the deck
// rather than hurrying through.
function linger(s, amount){ return s + amount * Math.sin(TAU * s) / TAU; }

// Standing at pos, looking at a point: the shot the camera takes.
function aim(pos, at, fov){
  const dx = at[0] - pos[0], dy = at[1] - pos[1], dz = at[2] - pos[2];
  return { pos, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), fov };
}

// Between two shots. The direction is blended as angles, the short way
// round, never as a point to look at: two such points blended can pass
// straight through the camera and flip the view.
function blend(a, b, w){
  return {
    pos: a.pos.map((v, i) => lerp(v, b.pos[i], w)),
    yaw: a.yaw + wrap(b.yaw - a.yaw) * w,
    pitch: lerp(a.pitch, b.pitch, w),
    fov: lerp(a.fov, b.fov, w),
  };
}

const moves = {
  // Through the underpass at eye height, from well outside one mouth to
  // well outside the other, drifting from side to side. Near the end it
  // turns to look back under the deck, always the same way round.
  walk: (s, u, lap) => {
    const k = linger(s, 0.35);
    const z = lerp(-1.5, 1.5, k) * P.length;
    const x = Math.sin(u * 0.2 + lap * 1.7) * P.width * 0.12;
    const pos = [x, P.eye, z];
    // Held to one side of the line all the way, never across it, or the
    // turn back could go either way round and flip mid-turn.
    const ahead = aim(pos, [x + 2 + Math.sin(u * 0.13 + lap) * 0.8, P.eye - 0.1, z + 6], 76);
    const back = aim(pos, [0, P.deck * 0.45, 0], 68);
    return blend(ahead, back, ease((s - 0.78) / 0.22));
  },

  // From outside the far mouth, up past the edge of the deck until it is
  // looking down on top of it.
  rise: (s, u, lap) => {
    const k = ease(s);
    const pos = [Math.sin(lap * 2.3) * P.width * 0.15, lerp(P.eye, P.deck + 5, k), lerp(P.length * 0.5 + 2.5, P.length * 0.5 + 1, k)];
    return aim(pos, [0, lerp(P.deck * 0.6, P.deck, k), lerp(0, P.length * 0.1, k)], 70);
  },

  // Out along the road and back, far enough that the bridge sits small in
  // the field, landing just inside the mouth.
  away: (s, u, lap) => {
    // Out and back, easing at both ends rather than arriving at speed.
    const out = 0.5 - 0.5 * Math.cos(TAU * s);
    const z = lerp(P.length * 0.6, P.length * 0.35, s) + out * P.length * 1.6;
    const y = lerp(P.deck + 4, P.eye, ease(s)) + out * P.deck * 0.4;
    const x = Math.sin(u * 0.1 + lap) * P.width * 0.4;
    return aim([x, y, z], [0, P.deck * 0.5, 0], 66);
  },

  // Standing under the middle of it, turning slowly all the way round:
  // the walls, the underside of the deck, out of each mouth.
  turn: (s, u, lap) => {
    const pos = [Math.sin(u * 0.05) * P.width * 0.1, P.eye, lerp(P.length * 0.25, -P.length * 0.1, ease(s))];
    // Starting from where the walk back in left it looking, under the deck.
    const a = s * TAU * 0.85;
    const up = 0.15 + Math.sin(u * 0.21) * 0.35;
    return aim(pos, [pos[0] - Math.sin(a) * 5, P.eye + up * 5, pos[2] - Math.cos(a) * 5], 80);
  },

  // Close along one wall, reading it at an angle as it passes.
  wall: (s, u, lap) => {
    const side = lap % 2 ? -1 : 1;
    const z = lerp(-P.length * 0.5, P.length * 0.5, ease(s));
    const x = side * (P.width * 0.5 - 1.3);
    return aim([x, P.eye * 0.9, z], [side * P.width * 0.5, P.eye * 0.85, z + 2.2], 70);
  },

  // Low down near the ground, looking up at the underside of the deck,
  // drifting back toward the mouth the walk starts from.
  low: (s, u, lap) => {
    const k = ease(s);
    const pos = [lerp(-0.3, 0.3, k) * P.width, 0.35, lerp(P.length * 0.3, -P.length * 0.9, k)];
    return aim(pos, [pos[0] * 0.5, P.deck, pos[2] + 3], 84);
  },
};

// The order and how long each move runs. Each begins about where the last
// one left off, facing about the same way, and the crossfade covers the
// difference.
const TOUR = [
  { move: 'walk',  seconds: 26 },
  { move: 'rise',  seconds: 14 },
  { move: 'away',  seconds: 20 },
  { move: 'turn',  seconds: 22 },
  { move: 'wall',  seconds: 16 },
  { move: 'low',   seconds: 14 },
];
const BLEND = 4;     // seconds each move overlaps the next

const STEP = TOUR.map((m) => m.seconds - BLEND);
const LAP = STEP.reduce((sum, x) => sum + x, 0);

function play(i, lap, u){
  const m = TOUR[i];
  return moves[m.move](u / m.seconds, u, lap);
}

function tourAt(t){
  const lap = Math.floor(t / LAP);
  let u = t - lap * LAP;
  let i = 0;
  while (i < TOUR.length - 1 && u >= STEP[i]){ u -= STEP[i]; i++; }
  const now = play(i, lap, u);
  if (u >= BLEND) return now;
  // Still inside the last move's tail. Before the first lap, that is the
  // end of a lap that never ran, which makes an approach to open on.
  const before = i > 0 ? play(i - 1, lap, STEP[i - 1] + u)
                       : play(TOUR.length - 1, lap - 1, STEP[TOUR.length - 1] + u);
  return blend(before, now, ease(u / BLEND));
}

// The tour: every move in turn, round and round. It is what the live camera
// plays with nobody touching it, so a grab of it is the site as a visitor
// sees it. Each move can also be grabbed on its own, by name.
export const paths = { tour: (t) => tourAt(t) };
for (const m of TOUR){
  paths[m.move] = (t) => moves[m.move](Math.min(t / m.seconds, 1), t, 0);
}

export const pathNames = Object.keys(paths);

// ctx: { canvas, renderer, setSize, renderFrame(t, shot), restore() }
export async function grab(name, ctx, options = {}){
  const path = paths[name];
  if (!path) throw new Error(`no path named "${name}"`);

  const { seconds = 12, fps = 30, width = 1080, height = 1920 } = options;
  const total = Math.round(seconds * fps);

  if (!window.MediaRecorder || !ctx.canvas.captureStream){
    throw new Error('this browser cannot record the canvas');
  }

  ctx.setSize(width, height);

  // Zero, so frames are only ever pushed by hand. A stream left to its own
  // rate samples whatever the page happens to be doing and the timestep
  // stops being fixed.
  const stream = ctx.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];

  const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });

  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const finished = new Promise((resolve) => { recorder.onstop = resolve; });
  // A timeslice, so data is handed over as it goes rather than only at the
  // end. Without it a short grab can finish before anything is emitted.
  recorder.start(100);

  try {
    for (let i = 0; i < total; i++){
      // Time comes from the frame index, never from the clock.
      const t = i / fps;
      ctx.renderFrame(t, path(t));

      // The frame has to reach the compositor before it can be grabbed, so
      // this waits on an actual animation frame. setTimeout is not enough:
      // the loop finishes in milliseconds, nothing is ever composited, and
      // the recording comes out empty.
      await new Promise((r) => requestAnimationFrame(r));
      track.requestFrame();
    }
  } finally {
    // One more composited frame in hand before stopping, or the tail of the
    // clip can be dropped.
    await new Promise((r) => requestAnimationFrame(r));
    recorder.stop();
    await finished;
    ctx.restore();
  }

  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `artworld-${name}-${width}x${height}.webm`;
  a.click();
  URL.revokeObjectURL(url);

  return { name, frames: total, seconds, width, height, bytes: blob.size };
}
