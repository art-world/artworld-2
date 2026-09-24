# ARTWORLD 2

A 3D web release for an EP by ARTWORLD, a solo electronic project. Niche
underground hardcore, retro-digital world-building, scarcity over reach.
Self-released: limited lathe-cut vinyl (~25) plus digital on Bandcamp and
Subvert. No streaming platforms, by choice.

## The concept

Release 1 was a Sony Video Walkman in a 3D room. It never argued that
platforms are extractive, it just was a sovereign player, and the visitor
understood the relation by operating it. The form carried the argument.

Release 2 escalates from playback to transmission. The object is a phone
booth, not a player. You do not press play, you place a call or take one.
On-demand dies without a line of explanatory copy.

Wired into it is a connection readout: the booth shows the visitor their own
IP, location and edge node. The world knew them before they entered it. That
is techno-feudalism enacted rather than illustrated.

**The test for any new idea: strip every label and line of copy out. Does the
structure still make the argument?** If it only works with a caption, it is
illustration and it does not go in.

## Locked decisions

- **The music is 100% human-made.** Never suggest AI for composition,
  production, mixing or mastering. AI for previz, tooling, automation and
  asset work is fine.
- **No versioning.** This is a new world, not "site v2" or a sequel. Platforms
  deprecate and rebuild; an archive that refuses to is the argument. Release 1
  stays live. The booth eventually dials it, because connecting places is what
  the object does. Do not name anything "v2".
- **No build step.** Vanilla ES modules, import map, no bundler, no npm, no
  `node_modules`. The deployed site is the source and view-source works. This
  is the sovereignty argument holding at the level of the file system.
- **Vendor Three.** Release 1 depends on jsDelivr serving `three@0.170.0`
  forever. Copy Three and the loaders into `vendor/` and point the import map
  at local paths. An archive with an external runtime dependency is not one.
- **`net.js` never persists.** No localStorage, no sessionStorage, no cookies,
  no analytics, no beacons, no third-party geolocation. Read Cloudflare's
  `/cdn-cgi/trace` from our own domain, show it, hold it in a local variable,
  let it go. The restraint is the whole point and no platform can make the
  same claim. **Adding any storage or logging to this file breaks the piece.**
- **Track count is derived.** `config.world.tracks` is the only place the
  number lives. The EP is 3 to 6 tracks, currently undecided and possibly
  subject to label input. Never hardcode a count anywhere else.
- **Camera moves are named and repeatable.** Every vertical clip is a crop of
  this world. Paths are data in `paths.js`, capture is deterministic on a fixed
  timestep. Do not add hand-flown one-off camera code.

## Material language

Cheap geometry lit like a luxury product. Nearest-neighbour texture filtering
for crunchy low-fi surfaces, HDR environment maps for expensive reflections,
depth texture for atmosphere, `onBeforeCompile` for injecting custom shader
code into standard materials. The tension between the two is the effect. Treat
it as a rule, not a starting point.

Reference points: Cav Empt, weirdcore.tv, Freeka Tet, CineShader.

## Copy and voice

Direct, concise, understated. No hype, no filler, **no em dashes ever**. When
in doubt, say less. Interface copy names what the visitor controls, in plain
words. Errors state what happened and how to fix it; they do not apologise.

Existing voice reference is the release 1 caption set: flat credit lists, plain
statements of fact, "Out now, link in bio" energy. Match that register.

## Structure

- `src/config.js` — the release as data. Tracks, anchors, dial directory,
  sleeve code. Change the release here, not in the code.
- `src/paths.js` — named camera paths, deterministic replay, `grab(name, ctx)`
  captures a 1080x1920 webm.
- `src/net.js` — connection readout, display only.

To write: `world.js` (scene from config), `interactions.js` (raycast against
`config.parts`), `dial.js`, `main.js`.

## Open items

- Booth model is from Sketchfab. **Check the licence before commercial use.**
- The kiosk scan in the inside world (`assets/models/kiosk.glb`) has no
  recorded origin or licence. See CREDITS.md.
- Compress it: Draco the geometry, KTX2 the textures. `DRACOLoader` is in the
  release 1 import map and never called, so nothing is currently compressed.
  Aggressive downsampling reads as deliberate crunch here.
- `hidden.code` in config is a placeholder. Set it before the vinyl stickers
  go to print, since the sticker and the site must not drift.
- Currently hosted at `art-world.github.io/artworld/`. A custom domain is
  wanted eventually, deferred for now.
