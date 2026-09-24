// The release as data. No room and no observer in this one: the field
// closes around the viewer, the figures are in it with them, and the booth
// stands in the middle of it.

export const config = {
  // Track count is derived from this array. Never hardcode a count.
  // `scene` is what actually separates one track from the next. Six
  // monochrome turbulence fields at the same spatial scale will always feel
  // related however different the maths is, so how much is happening and
  // how fast does more work here than the field alone.
  //
  //   figures  how many of them are in the world at once, 0..1 of the pool
  //   scale    how big they are
  //   detail   extra high frequency laid over the field
  //   pan      how fast the camera travels the tour
  //   spin     how fast they turn on the spot
  //   shake    how many of them judder, and how hard
  //   booth    what state the booth is in, over booth.look below
  tracks: [
    { title: '23', src: '../warehouse/assets/audio/23.m4a', shader: 'warp',
      scene: { figures: 0.5, scale: 1.4, detail: 0.15, pan: 0.6, spin: 0.4, shake: 0.5,
               // Running and pooling, with mercury coming and going over it.
               booth: { chrome: 0.2, warp: 0.6, melt: 0.55, lens: 1.2, swirl: 0.6, size: 1.1 } } },
    { title: '27', src: '../warehouse/assets/audio/27.m4a', shader: 'fracture',
      scene: { figures: 1.0, scale: 0.7, detail: 0.75, pan: 1.6, spin: 1.5, shake: 1.4,
               // Hard and still. The scan with the odd mirrored patch.
               booth: { chrome: 0.1, warp: 0.2, melt: 0, lens: 0.8, swirl: -0.9, size: 0.9 } } },
    { title: '38', src: '../warehouse/assets/audio/38.m4a', shader: 'tunnel',
      scene: { figures: 0.35, scale: 2.1, detail: 0.3, pan: 0.35, spin: 0.2, shake: 0.2,
               // A monolith. Huge, still, and heavy enough to swallow the
               // tunnel's vanishing point.
               booth: { chrome: 0.3, warp: 0.15, melt: 0.1, lens: 1.9, swirl: 1.3, size: 1.6 } } },
    { title: '40', src: '../warehouse/assets/audio/40.m4a', shader: 'bodies',
      scene: { figures: 0.85, scale: 1.0, detail: 0.45, pan: 1.0, spin: 0.8, shake: 0.9,
               // Liquid, like the figures. Smooth and never still.
               booth: { chrome: 0.15, warp: 0.95, melt: 0.35, lens: 1.0, swirl: 0.4, size: 1.0 } } },
    { title: '41', src: '../warehouse/assets/audio/41.m4a', shader: 'strata',
      scene: { figures: 0.6, scale: 1.25, detail: 0.9, pan: 0.8, spin: 0.5, shake: 1.8,
               // Almost all scan.
               booth: { chrome: 0.05, warp: 0.3, melt: 0.1, lens: 0.9, swirl: 0.2, size: 1.2 } } },
    { title: '42', src: '../warehouse/assets/audio/42.m4a', shader: 'swarm',
      scene: { figures: 1.0, scale: 0.85, detail: 0.6, pan: 1.3, spin: 1.1, shake: 0.7,
               // The kiosk as it was found.
               booth: { chrome: 0, warp: 0.45, melt: 0.2, lens: 1.1, swirl: -0.5, size: 0.95 } } },
  ],

  field: {
    // The field is a projector here too, allowed past white so it reads as
    // light rather than as a surface.
    gain: 1.05,
    // How far the audio moves the field. Low: the silent image is the
    // reference, and the music should be felt rather than redraw it.
    react: 0.4,
  },

  // The kiosk. A scan of a real one, run through the same field as
  // everything else. See booth.js.
  booth: {
    model: '../assets/models/kiosk.glb',
    height: 4.2,     // metres; the figures are 2.6
    spin: 0.06,      // radians per second on its own axis
    bob: 0.22,
    lean: 0.07,
    // Where the sign is, in the booth's own space: one unit tall, centred.
    // x0, y0, x1, y1 on the front face. The connection is shown there.
    sign: [-0.176, 0.356, 0.195, 0.423],
    // The ring, on and off in seconds: the British double ring, since this
    // is a British kiosk. Visual only.
    ring: [0.4, 0.2, 0.4, 2.0],
    ghosts: 2,       // multipath copies, late and to one side
    ghost: 0,        // how visible they are with nothing happening: not at
                     // all. They only show as a call goes through.
    // Its state when a track says nothing. Tracks override any of these.
    //   chrome  how much of it is mirror rather than scan
    //   warp    how far it bends and breathes
    //   melt    how far it runs down and pools
    //   glitch  how often slabs of it jump; 0 on every track for now
    //   lens    how hard it bends the field round it
    //   swirl   how far it drags the field round with it
    //   size    against height above
    look: { chrome: 0.1, warp: 0.4, melt: 0.2, glitch: 0, lens: 1.0, swirl: 0.3, size: 1.0 },
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
    near: 4.2,       // clear of the booth
    far: 15.0,
    rise: 3.2,       // how far above and below the eyeline they reach
    height: 2.6,     // metres, each one give or take
    orbit: 0.035,    // radians per second around the viewer
    spin: 0.6,       // radians per second on the spot
    tumble: 0.22,
    treatments: [0.1, 0.5, 0.9, 0.5, 0.1, 0.9, 0.5],
    // How far each figure moves with the flow. The geometry bends on a
    // wave travelling up the body and its shading drifts with the field.
    flux: 0.22,
    // Some of them judder as well, in steps rather than smoothly, the way
    // they did in the warehouse. Every nth slot gets it, so it is a few
    // figures coming apart rather than all of them.
    shake: 0.75,
    shakeEvery: 3,
    // A couple of enormous ones, much further out and moving much more, so
    // they read as structure you are inside rather than as more figures.
    giants: 2,
    giantScale: 4.2,
    giantFlux: 1.4,
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

    // The camera travels the tour in paths.js, round the booth and through
    // it. This is how fast, times each track's own pan.
    travel: 1,
  },

  render: {
    // This is fragment bound: at device ratio 2 it draws four times the
    // pixels of ratio 1 for a very heavy shader, and the grade lays grain
    // and scanlines over everything afterwards, which hides most of what
    // the extra resolution buys. Measured: 35fps at 2, comfortably past 60
    // at 1.5 on the same machine.
    maxPixelRatio: 1.5,
    // The whole piece is motion. Anyone who has asked their system not to
    // move things gets the field and the figures held nearly still.
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
