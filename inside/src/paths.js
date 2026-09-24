// Named camera paths and deterministic capture.
//
// Every vertical clip is a crop of this world, so the paths are data and
// the capture runs on a fixed timestep rather than on the clock. The same
// name gives the same clip every time, on any machine, whatever the frame
// rate happens to be while it records. Screen recording gives none of that.
//
// Audio is held at a fixed level during a grab for the same reason: a clip
// driven by live playback is different on every take.

// --- the tour ------------------------------------------------------------
// The booth stands at the origin and the live camera spends its time on
// it: round it, up close, straight through it, over it, down through its
// roof and out into the field. Each move is a position and a direction
// over its own progress s, 0 to 1, turned by a so it can start from any
// side. The tour plays them in order with a crossfade, and turns the whole
// sequence each time round so no pass goes through the same wall twice
// running.

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const wrap = (a) => a - TAU * Math.round(a / TAU);

// A point on the ground plane turned about the booth's axis. Angle 0 is +z.
function turn(x, z, a){
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

// Progress that slows in the middle, so a pass lingers inside the booth
// rather than flicking through it.
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
  // Round it, facing it, rising and falling.
  around: (s, u, a) => {
    const b = a + u * 0.16;
    const [x, z] = turn(0, 5.4 + Math.sin(u * 0.3), b);
    const y = 0.3 + Math.sin(u * 0.2) * 1.5;
    return aim([x, y, z], [0, y * 0.25, 0], 64);
  },

  // Up close, sliding down and across its face, near enough to read it.
  close: (s, u, a) => {
    const k = ease(s);
    const [x, z] = turn(lerp(-2.4, 2.4, k), 2.4, a);
    const [ax, az] = turn(lerp(-0.6, 0.6, k), 0, a);
    const y = lerp(1.8, -1.0, k);
    return aim([x, y, z], [ax, y * 0.55, az], 72);
  },

  // Straight through it, slowing down inside, then turning to look back
  // at it. Looking ahead is held a little off the line of travel, so the
  // turn always goes the same way round.
  pass: (s, u, a) => {
    const k = linger(s, 0.45);
    const d = lerp(-9, 9, k);
    const y = lerp(0.9, -0.5, k);
    const [x, z] = turn(0, d, a);
    const [lx, lz] = turn(1.5, d + 6, a);
    const ahead = aim([x, y, z], [lx, y - 0.4, lz], 82);
    const back = aim([x, y, z], [0, 0, 0], 70);
    return blend(ahead, back, ease((s - 0.72) / 0.28));
  },

  // Rising up over it, until it is looking straight down into it.
  over: (s, u, a) => {
    const k = ease(s);
    const [x, z] = turn(0, lerp(5.5, 0.9, k), a + s * 1.1);
    return aim([x, lerp(0.6, 6.5, k), z], [0, -2.2, 0], 70);
  },

  // Down through the roof and out through the floor, looking down.
  drop: (s, u, a) => {
    const k = linger(s, 0.2);
    const [x, z] = turn(0.25, 0.3, a);
    const [lx, lz] = turn(0.9, 1.1, a);
    const y = lerp(7.5, -8, k);
    return aim([x, y, z], [lx, y - 6, lz], 84);
  },

  // Out into the field, far enough that the booth sits small in it with
  // the field bent round it, and back in.
  away: (s, u, a) => {
    const [x, z] = turn(0, 4 + Math.sin(Math.PI * s) * 11, a + s * 0.9);
    const y = lerp(-4, 1, s) + Math.sin(Math.PI * s) * 2.5;
    return aim([x, y, z], [0, 0, 0], 68);
  },
};

// The order, how long each move runs, and the side it starts from. The
// sides are set so each move begins about where the last one left off,
// facing about the same way, and the crossfade covers the difference.
const TOUR = [
  { move: 'around', seconds: 22, from: 0 },
  { move: 'close',  seconds: 16, from: 4.31 },
  { move: 'pass',   seconds: 15, from: 1.95 },
  { move: 'over',   seconds: 13, from: 1.95 },
  { move: 'drop',   seconds: 10, from: 5.51 },
  { move: 'away',   seconds: 20, from: 3.05 },
];
const BLEND = 4;     // seconds each move overlaps the next
const ROUND = 3.95;  // radians the whole tour turns each time round, so
                     // the next lap starts where this one's last move ends

const STEP = TOUR.map((m) => m.seconds - BLEND);
const LAP = STEP.reduce((sum, x) => sum + x, 0);

function play(i, lap, u){
  const m = TOUR[i];
  return moves[m.move](u / m.seconds, u, m.from + lap * ROUND);
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

export const paths = {
  // Turning on the spot. The plain one, and the one most things read on.
  turn: (t) => ({
    yaw: t * 0.22,
    pitch: Math.sin(t * 0.13) * 0.28,
    pos: [Math.sin(t * 0.06) * 4.5, Math.sin(t * 0.05) * 1.2, Math.cos(t * 0.06) * 4.5],
    fov: 80,
  }),

  // Travelling through, looking where it is going.
  through: (t) => ({
    yaw: 0.6 + Math.sin(t * 0.08) * 0.5,
    pitch: Math.sin(t * 0.11) * 0.18,
    pos: [Math.sin(t * 0.11) * 9, Math.sin(t * 0.07) * 2.2, -6 + t * 0.9],
    fov: 88,
  }),

  // Looking up while it drifts, for the overhead ones.
  rise: (t) => ({
    yaw: t * 0.1,
    pitch: 0.35 + Math.sin(t * 0.09) * 0.45,
    pos: [Math.sin(t * 0.04) * 3, -1 + t * 0.12, Math.cos(t * 0.04) * 3],
    fov: 92,
  }),

  // Nearly still. Lets the field and the figures do the moving.
  hold: (t) => ({
    yaw: Math.sin(t * 0.05) * 0.3,
    pitch: Math.sin(t * 0.04) * 0.1,
    pos: [Math.sin(t * 0.03) * 1.2, 0.3, Math.cos(t * 0.03) * 1.2],
    fov: 74,
  }),

  // Round the booth, facing it, close enough that it fills a vertical
  // frame and the field bending round it shows. The one for the object.
  call: (t) => {
    const a = 0.4 + t * 0.14;
    const r = 6.4 + Math.sin(t * 0.21) * 1.1;
    const y = 0.4 + Math.sin(t * 0.09) * 1.3;
    return {
      yaw: a + Math.sin(t * 0.17) * 0.12,
      pitch: Math.atan2(-y, r) + 0.08,
      pos: [Math.sin(a) * r, y, Math.cos(a) * r],
      fov: 58,
    };
  },
};

// The tour: every move in turn, round and round. It is what the live camera
// plays with nobody touching it, so a grab of it is the site as a visitor
// sees it. Each move can also be grabbed on its own, by name.
paths.tour = (t) => tourAt(t);
for (const m of TOUR){
  paths[m.move] = (t) => moves[m.move](Math.min(t / m.seconds, 1), t, m.from);
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
