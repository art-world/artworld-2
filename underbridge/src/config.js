// The release as data. The field closes around the viewer, and the scan of
// the underside of a bridge stands in the middle of it.

export const config = {
  // Track count is derived from this array. Never hardcode a count.
  // `scene` is what separates one track from the next, besides the field:
  //
  //   detail   extra high frequency laid over the field
  //   pan      how fast the camera travels the tour
  //
  // `palette` is the light the track is seen in: a shadow, five colours
  // for the middle, and a light. The five are a line, each blending into
  // the next, and several of them are on screen at once in large soft
  // regions (see grade.js). The middle one of the five is the most common
  // and the two ends are accents; the first leans to the top of the frame.
  // Shadows stay near black and the five stay muted, so the scan stays
  // legible and nothing reads as a filter.
  tracks: [
    { title: '23', src: '../warehouse/assets/audio/23.m4a', shader: 'warp',
      scene: { detail: 0.08, pan: 0.6 },
      // Sunset. Rose and tangerine, gold low down, violet and the blue
      // above it.
      palette: { shadow: '#0c0814', light: '#fbe6cf',
                 inks: ['#2f4c86', '#6c4a8e', '#c2566c', '#df7a48', '#e8b25e'] } },
    { title: '27', src: '../warehouse/assets/audio/27.m4a', shader: 'fracture',
      scene: { detail: 0.35, pan: 1.6 },
      // A basement rave under red bulbs. Red and crimson, wine, a little
      // ember, and the smoke going violet where the light runs out.
      palette: { shadow: '#060203', light: '#f0c4b4',
                 inks: ['#3a2050', '#7a1a3a', '#a8221f', '#c2452a', '#cc6a3c'] } },
    { title: '38', src: '../warehouse/assets/audio/38.m4a', shader: 'tunnel',
      scene: { detail: 0.15, pan: 0.35 },
      // London's skyline on the river at night. Petrol water, the cold
      // white of the towers above, plum, and sodium amber on the surface.
      palette: { shadow: '#03060b', light: '#f2ead8',
                 inks: ['#9cc9d2', '#2f7c8a', '#1d4a66', '#5a2f5c', '#e0a24a'] } },
    { title: '40', src: '../warehouse/assets/audio/40.m4a', shader: 'bodies',
      scene: { detail: 0.22, pan: 1.0 },
      // Blue hour. The last peach on the horizon, lilac, periwinkle, cobalt
      // and the teal of the shadows.
      palette: { shadow: '#060912', light: '#eef0f6',
                 inks: ['#d9a28a', '#9b86b6', '#6c7ec0', '#2e4f98', '#3f7f92'] } },
    { title: '41', src: '../warehouse/assets/audio/41.m4a', shader: 'strata',
      scene: { detail: 0.45, pan: 0.8 },
      // An estuary under cloud. Rust, ochre, sage, moss and slate water.
      palette: { shadow: '#090b0a', light: '#efebe0',
                 inks: ['#9c5c40', '#b89a5c', '#8a9c84', '#4f6448', '#5a6f86'] } },
    { title: '42', src: '../warehouse/assets/audio/42.m4a', shader: 'swarm',
      scene: { detail: 0.3, pan: 1.3 },
      // The last train home. Platform amber, rose, mauve, violet and the teal
      // of the carriage glass.
      palette: { shadow: '#07060c', light: '#f1e6ee',
                 inks: ['#d9a056', '#c8798a', '#9c6698', '#6a4aa0', '#3c7d86'] } },
  ],

  field: {
    // Held down to half: here the field is the weather round the bridge,
    // not the subject, and at full it shouted the scan down. It lands in
    // the palette's shadows and middle rather than its lights.
    gain: 0.5,
    // How far the audio moves the field. Low: the silent image is the
    // reference, and the music should be felt rather than redraw it.
    react: 0.3,
  },

  // The scan. A Gaussian splat of the underside of a low bridge, baked by
  // splat-transform from the upload (see CREDITS.md): upright, ground at
  // y = 0, the bridge along z with its mouth toward +z, compressed. Placed
  // as baked, so the transform here is left at nothing.
  scan: {
    model: '../assets/splats/underbridge.compressed.ply',
    position: [0, 0, 0],
    rotation: [0, 0, 0],   // degrees about x, y and z, in that order
    scale: 1,
    // Splats fainter than this, out of 255, are dropped as it loads. Phone
    // scans carry a haze of near-invisible ones that only cost time.
    alphaCut: 5,
  },

  // The bridge, measured in the baked scan. The tour is laid out against
  // these, so the camera stays where the scan holds up.
  place: {
    lane: -1.2,      // x of the clear line under the deck
    posts: -0.6,     // x of the row of posts beside it
    mouth: 7.5,      // z where the deck ends and the open ground begins
    deep: -2.5,      // z past which the scan is too thin to go
    deck: 1.15,      // height of the underside of the deck
    eye: 0.65,
    low: 0.2,
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
    flow: 0.08,
    flowHit: 0.12,
    flowReach: 0.3,

    // The camera travels the tour in paths.js, in under the bridge and out
    // again. This is how fast, scaled by each track's own pan.
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
    // Seconds for one palette to give way to the next.
    paletteFade: 0.7,
    contrast: 1.24,
    lift: -0.015,
    grain: 0.055,
    vignette: 1.2,
    scanline: 0.03,
  },
};
