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
// The scan is placed with the ground at y = 0 and the bridge running along
// z: the deck ends at the mouth, toward +z, and the corridor under it runs
// back toward -z beside a row of posts. The scan is good from the mouth to
// a few metres in and thins out beyond, so the camera stays in that part.
// Every move is laid out against `place` in config, so a re-placed or
// re-measured scan moves the tour with it. Each move is a position and a
// direction over its own progress s, 0 to 1, and u, its local seconds. The
// tour plays them in order with a crossfade.

const P = config.place;
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const wrap = (a) => a - TAU * Math.round(a / TAU);

// Progress that slows in the middle, so a move lingers where it is best
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
  // In through the mouth at eye height, drifting a little from side to
  // side, looking into the corridor.
  enter: (s, u, lap) => {
    const z = lerp(P.mouth + 3.5, P.mouth - 5, linger(s, -0.2));
    const x = P.lane + Math.sin(u * 0.23 + lap * 1.7) * 0.25;
    return aim([x, P.eye, z], [x + Math.sin(u * 0.11 + lap) * 0.8, P.eye * 0.9, z - 6], 74);
  },

  // Under the deck, turning slowly all the way round: the posts, the
  // underside of the deck, the light at the mouth, the corridor again.
  turn: (s, u, lap) => {
    const pos = [P.lane + 0.3, P.eye * 0.9, lerp(P.mouth - 5, P.mouth - 6.5, ease(s))];
    const a = s * TAU;
    const up = 0.15 + Math.sin(u * 0.21 + lap) * 0.25;
    return aim(pos, [pos[0] - Math.sin(a) * 4, pos[1] + up * 4, pos[2] - Math.cos(a) * 4], 78);
  },

  // Further in, slowly, then turning to look back at the mouth. Looking
  // ahead is held to the posts' side of the line, so the turn back always
  // goes the same way round.
  deeper: (s, u, lap) => {
    const z = lerp(P.mouth - 6.5, P.deep, linger(s, 0.3));
    const pos = [P.lane, P.eye, z];
    const ahead = aim(pos, [P.lane + 1.6, P.eye * 0.9, z - 6], 74);
    const back = aim(pos, [P.lane, P.deck * 0.5, P.mouth + 2], 70);
    return blend(ahead, back, ease((s - 0.6) / 0.4));
  },

  // Back out along the row of posts, close, reading them as they pass.
  posts: (s, u, lap) => {
    const z = lerp(P.deep + 0.5, P.mouth - 1.5, ease(s));
    const x = P.posts - 0.45;
    return aim([x, P.eye * 0.9, z], [P.posts + 0.4, P.eye * 0.75, z + 2.2], 70);
  },

  // Low to the ground at the mouth, looking up at the edge of the deck and
  // the field over it.
  low: (s, u, lap) => {
    const k = ease(s);
    const z = lerp(P.mouth - 1.5, P.mouth + 1.5, k);
    const pos = [lerp(P.posts - 0.45, P.lane, k), lerp(P.eye * 0.9, P.low, k), z];
    return aim(pos, [pos[0] + 0.5, P.deck * 1.6, z + 3], 80);
  },

  // Out into the field, far enough that the bridge sits small in it, then
  // turning to look back at it and coming in to the mouth. Looking ahead
  // is held to one side, so the turn back always goes the same way round.
  away: (s, u, lap) => {
    const out = 0.5 - 0.5 * Math.cos(TAU * s);
    const z = lerp(P.mouth + 1.5, P.mouth + 3.5, s) + out * 14;
    const y = lerp(P.low, P.eye, ease(s)) + out * 2.5;
    const x = P.lane + out * Math.sin(lap * 2.1 + 0.6) * 2;
    const pos = [x, y, z];
    const ahead = aim(pos, [x - 2, y + 0.6, z + 8], 70);
    const back = aim(pos, [P.posts, P.deck * 0.5, P.mouth - 4], 66);
    return blend(ahead, back, ease((s - 0.25) / 0.3));
  },
};

// The order and how long each move runs. Each begins about where the last
// one left off, facing about the same way, and the crossfade covers the
// difference.
const TOUR = [
  { move: 'enter',  seconds: 16 },
  { move: 'turn',   seconds: 24 },
  { move: 'deeper', seconds: 14 },
  { move: 'posts',  seconds: 16 },
  { move: 'low',    seconds: 12 },
  { move: 'away',   seconds: 24 },
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
