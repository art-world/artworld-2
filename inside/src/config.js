// The release as data. No room and no observer in this one: the field
// closes around the viewer and the figures are in it with them.

export const config = {
  // Track count is derived from this array. Never hardcode a count.
  tracks: [
    { title: '23', src: '../warehouse/assets/audio/23.m4a', shader: 'tunnel'   },
    { title: '27', src: '../warehouse/assets/audio/27.m4a', shader: 'fracture' },
    { title: '38', src: '../warehouse/assets/audio/38.m4a', shader: 'warp'     },
    { title: '40', src: '../warehouse/assets/audio/40.m4a', shader: 'bodies'   },
    { title: '41', src: '../warehouse/assets/audio/41.m4a', shader: 'strata'   },
    { title: '42', src: '../warehouse/assets/audio/42.m4a', shader: 'swarm'    },
  ],

  field: {
    // The field is a projector here too, allowed past white so it reads as
    // light rather than as a surface.
    gain: 1.05,
    // How far the audio moves the field. Low: the silent image is the
    // reference, and the music should be felt rather than redraw it.
    react: 0.4,
  },

  dancers: {
    sources: [
      { model: '../warehouse/assets/models/dancer/scene.gltf',   weight: 2 },
      { model: '../warehouse/assets/models/capoeira/scene.gltf', weight: 1 },
      { model: '../warehouse/assets/models/alexia/scene.gltf',   weight: 3 },
      { model: '../warehouse/assets/models/belly/scene.gltf',    weight: 4 },
      { model: '../warehouse/assets/models/samba/scene.gltf',    weight: 4 },
      { model: '../warehouse/assets/models/twerk/scene.gltf',    weight: 3 },
    ],
    count: 16,
    // They stand around the viewer rather than in front of them, at every
    // height, so there is something to find whichever way you turn.
    near: 3.4,
    far: 15.0,
    rise: 3.2,       // how far above and below the eyeline they reach
    height: 2.6,     // metres, each one give or take
    orbit: 0.035,    // radians per second around the viewer
    spin: 0.6,       // radians per second on the spot
    tumble: 0.22,
    treatments: [0.1, 0.5, 0.9, 0.5, 0.1, 0.9, 0.5],
  },

  view: {
    // Looking around is the interaction. Drag, or tilt the phone.
    drag: 2.6,       // radians per screen width
    ease: 0.12,
    damping: 0.94,   // how long a flick keeps travelling
    pitchLimit: 1.25,
    // Left alone, it keeps moving on its own.
    driftYaw: 0.035,
    driftPitch: 0.16,
    idle: 2.5,       // seconds before the drift takes back over
    fov: 78,
    // The viewer pushes the field where they look.
    reach: 0.55,
  },

  grade: {
    contrast: 1.24,
    lift: -0.015,
    grain: 0.055,
    vignette: 1.2,
    scanline: 0.03,
  },
};
