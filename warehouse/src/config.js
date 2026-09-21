// The room as data. Change the release here, not in the code.

export const config = {
  // Track count is derived from this array. Never hardcode a count.
  // `title` is what shows on screen. `src` is the file. `shader` names an
  // entry in shaders.js. `move` names a camera path in camera.js.
  tracks: [
    { title: '23', src: 'assets/audio/23.m4a', shader: 'tunnel',     move: 'approach' },
    { title: '27', src: 'assets/audio/27.m4a', shader: 'fracture',   move: 'drift'    },
    { title: '38', src: 'assets/audio/38.m4a', shader: 'warp',       move: 'orbit'    },
    { title: '40', src: 'assets/audio/40.m4a', shader: 'bodies',     move: 'rise'     },
    { title: '41', src: 'assets/audio/41.m4a', shader: 'strata',     move: 'static'   },
    { title: '42', src: 'assets/audio/42.m4a', shader: 'swarm',      move: 'retreat'  },
  ],

  models: {
    warehouse: 'assets/models/warehouse/scene.gltf',
    character: 'assets/models/character/scene.gltf',
  },

  // The projection is the only light in the room.
  projection: {
    // Fraction of the warehouse end wall the projection covers. Over 1 on
    // purpose: the end is an arch and the projection is a rectangle, so it
    // has to run past the walls and up into the curve of the roof or it
    // leaves a gap along the top.
    fill: 1.03,
    // Multiple of room height. Also over 1, same reason: the top edge is
    // hidden inside the roof rather than sitting below it.
    rise: 1.16,
    // Output gain. The plane is a projector, not a texture: it is allowed to
    // run past white so it reads as the brightest thing in the room.
    gain: 1.0,
    // Lights out in the room carrying the projection's throw. An emissive
    // plane lights nothing on its own, so these are the room. The slow
    // decay is deliberate: the room is 46m long and physical falloff loses
    // the far end entirely.
    lights: 3,
    intensity: 7,
    decay: 1.2,
    // How much the audio pushes the light. Each light takes a different
    // band, so the room moves unevenly rather than pumping as one block.
    reactivity: 0.95,
    // Extra thrown on an onset. The floor is what the room should mostly
    // look like, so this is kept to roughly half what it takes to reach the
    // ceiling: transients lift it without washing the room out.
    flash: 0.85,
  },

  // Camera offset the visitor drives with the pointer. It is added on top
  // of the named path, never inside it, so the paths stay deterministic and
  // replay identically with no pointer present.
  mouse: {
    strength: 2.2,   // metres of camera travel at full deflection
    look: 1.1,       // metres the aim point shifts against it
    ease: 0.04,      // how fast it catches up, per frame
  },

  // Figures rendered offscreen with a camera of their own, then handed to
  // every shader as a texture. Real geometry, so they turn, overlap and
  // foreshorten. Each slot picks a source at load, so the mix of stances on
  // the wall changes between the three.
  dancers: {
    sources: [
      // The still one has no skeleton, so its movement is vertex
      // deformation. The other two carry their own animation.
      // `weight` is how often a slot picks this source. Capoeira is 122k
      // vertices, split across two primitives by the 16-bit index limit, so
      // it cannot be halved and it is the one that costs frames. It is
      // weighted down rather than dropped, because its stances are the most
      // dynamic of the three.
      { model: 'assets/models/dancer/scene.gltf',   deform: true,  weight: 2 },
      { model: 'assets/models/capoeira/scene.gltf', deform: false, weight: 1 },
      { model: 'assets/models/alexia/scene.gltf',   deform: false, weight: 3 },
      { model: 'assets/models/belly/scene.gltf',    deform: false, weight: 5 },
      { model: 'assets/models/samba/scene.gltf',    deform: false, weight: 5 },
      { model: 'assets/models/twerk/scene.gltf',    deform: false, weight: 4 },
    ],
    count: 20,
    // Wider than the camera sees at once, on purpose: figures should be
    // entering and leaving frame rather than all standing in the middle.
    spread: 4.8,      // half-width of the ground they stand across
    depth: 3.2,       // how far back the furthest one stands
    // Bigger than life on the wall. The plane is sixteen metres across, so
    // even at this they are well under human scale against the room.
    scale: 1.35,
    // How each figure is treated in the shader. All three are hollow: the
    // field runs through every one of them and none is filled in. 0 reads
    // as polished metal, 0.5 as an open shell, 1 as etched contour. Slots
    // take these in turn.
    // 0.3 is the clear-edged one: same shell treatment, but its outline is
    // left mostly intact. Four slots in twenty get it.
    treatments: [0.1, 0.5, 0.9, 0.3, 0.5, 0.1, 0.9, 0.5, 0.3, 0.9],
    drift: 0.15,      // units per second across frame
    spin: 0.7,        // radians per second, each one turning on the spot
    tumble: 0.22,     // off-axis lean, so they are not all upright
    twist: 0.5,       // spine twist on the deformed one
    sway: 0.1,        // its lateral hip travel
    width: 1024,      // offscreen target width, height follows the plane

    // The camera on them never settles: it orbits, rolls and changes focal
    // length, which is most of where the sense of perspective comes from.
    camera: {
      orbit: 0.22,    // radians per second around the group
      radius: 2.6,
      roll: 0.3,      // radians of horizon tilt
      fov: 34,
      fovSwing: 15,
    },
  },

  character: {
    height: 1.8,       // metres, normalised from the source model
    distance: 7.0,     // metres back from the projection
    offset: 0.18,      // sideways, as a fraction of half the room width
    turn: 0.12,        // radians off dead-on to the projection
    // The source model ships an A-pose and no other animation, so the arms
    // come down here. Radians, applied to the named bones at load.
    pose: {
      'l shoulder': -0.10,
      'r shoulder':  0.10,
      'l arm':      -0.62,
      'r arm':       0.62,
      'l forearm':  -0.20,
      'r forearm':   0.20,
    },
  },

  grade: {
    contrast: 1.28,
    lift: -0.015,
    grain: 0.055,
    vignette: 1.15,
    scanline: 0.035,
  },
};
