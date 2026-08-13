// The release as data. Change the release here, not in the code.

export const config = {
  release: {
    artist: 'ARTWORLD',
    // No versioning: this is a new world, not a sequel. Never name it "v2".
    title: 'ARTWORLD',
    label: null,
    bandcamp: null,
    subvert: null,
  },

  world: {
    // The EP is 3 to 6 tracks, currently undecided. This array is the only
    // place the track count lives — never hardcode a count anywhere else.
    tracks: [],
  },

  booth: {
    model: 'assets/models/booth.glb',
    env: 'assets/env/booth.hdr',
  },

  // Named interactive hotspots on the booth mesh. interactions.js raycasts
  // against these by name; world.js resolves them once the model is loaded.
  // No door: the current booth model is an open alcove with no door leaf.
  parts: {
    handset: { object: 'Handset', cursor: 'pointer' },
    keypad: { object: 'Keypad', cursor: 'pointer' },
  },

  // Numbers the visitor can dial on the keypad.
  dial: {
    directory: [
      // { number: '1', label: 'release 1', target: 'release-1' },
    ],
  },

  sleeve: {
    code: null,
  },

  hidden: {
    // Placeholder. Set before the vinyl stickers go to print — the sticker
    // and the site must not drift.
    code: 'PLACEHOLDER',
  },
};
