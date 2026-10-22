// The release as data. The field closes around the viewer, and the scan of
// the underside of a bridge stands in the middle of it.

export const config = {
  // Track count is derived from this array. Never hardcode a count.
  // `scene` is what separates one track from the next, besides the field:
  //
  //   detail   extra high frequency laid over the field
  //   pan      how fast the camera travels the tour
  tracks: [
    { title: '23', src: '../warehouse/assets/audio/23.m4a', shader: 'warp',
      scene: { detail: 0.15, pan: 0.6 } },
    { title: '27', src: '../warehouse/assets/audio/27.m4a', shader: 'fracture',
      scene: { detail: 0.75, pan: 1.6 } },
    { title: '38', src: '../warehouse/assets/audio/38.m4a', shader: 'tunnel',
      scene: { detail: 0.3, pan: 0.35 } },
    { title: '40', src: '../warehouse/assets/audio/40.m4a', shader: 'bodies',
      scene: { detail: 0.45, pan: 1.0 } },
    { title: '41', src: '../warehouse/assets/audio/41.m4a', shader: 'strata',
      scene: { detail: 0.9, pan: 0.8 } },
    { title: '42', src: '../warehouse/assets/audio/42.m4a', shader: 'swarm',
      scene: { detail: 0.6, pan: 1.3 } },
  ],

  field: {
    // The field is a projector here too, allowed past white so it reads as
    // light rather than as a surface.
    gain: 1.05,
    // How far the audio moves the field. Low: the silent image is the
    // reference, and the music should be felt rather than redraw it.
    react: 0.4,
  },

  // The scan. A Gaussian splat, exported from SuperSplat as a compressed
  // PLY. It is placed so the ground is at y = 0 and the underpass runs
  // along z through the origin; the tour in paths.js is laid out in those
  // terms, against `place` below.
  scan: {
    model: '../assets/splats/underbridge.compressed.ply',
    position: [0, 0, 0],
    rotation: [0, 0, 0],   // degrees about x, y and z, in that order
    scale: 1,
    // Splats fainter than this, out of 255, are dropped as it loads. Phone
    // scans carry a haze of near-invisible ones that only cost time.
    alphaCut: 5,
  },

  // The underpass, in world units once the scan is placed.
  place: {
    length: 10,      // along z, under the deck
    width: 8,        // between the walls
    deck: 4,         // height of the underside of the deck
    eye: 1.6,
  },

  view: {
    // Looking around is the interaction. Drag, or tilt the phone.
    drag: 2.6,       // radians per screen width
    ease: 0.12,
    damping: 0.94,   // how long a flick keeps travelling
    pitchLimit: 1.35,
    // Left alone, the gaze goes back to wherever the tour is looking:
    // slowly at first, then holding it. A drag takes it over again.
    idle: 2.5,       // seconds before it starts going back
    follow: 0.08,    // per frame, once it is back
    settle: 0.012,   // how fast it gets back
    fov: 72,         // to start with; the tour sets its own
    // The viewer pushes the field where they look.
    reach: 1.1,
    // How hard the field itself moves. Low: the field reads better close
    // to its own shape, and pushing it far turns the fields into something
    // else rather than animating them.
    flow: 0.12,
    flowHit: 0.22,
    flowReach: 0.4,

    // The camera travels the tour in paths.js, through the underpass and
    // round it. This is how fast, scaled by each track's own pan.
    travel: 1,
  },

  render: {
    // This is fragment bound: at device ratio 2 it draws four times the
    // pixels of ratio 1 for a very heavy shader, and the grade lays grain
    // and scanlines over everything afterwards, which hides most of what
    // the extra resolution buys.
    maxPixelRatio: 1.5,
    // The whole piece is motion. Anyone who has asked their system not to
    // move things gets the camera held nearly still.
    respectReducedMotion: true,
  },

  grade: {
    contrast: 1.24,
    lift: -0.015,
    grain: 0.055,
    vignette: 1.2,
    scanline: 0.03,
  },
};
