// Named camera paths and deterministic capture.
//
// Every vertical clip is a crop of this world, so the paths are data and
// the capture runs on a fixed timestep rather than on the clock. The same
// name gives the same clip every time, on any machine, whatever the frame
// rate happens to be while it records. Screen recording gives none of that.
//
// Audio is held at a fixed level during a grab for the same reason: a clip
// driven by live playback is different on every take.

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
};

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
