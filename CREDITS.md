# Credits and licenses

## Booth model

"90's Telephone Booth II" by Quantumverse Dev (Quantumverse Iquadrat)
https://sketchfab.com/3d-models/90s-telephone-booth-ii-b334d67b798c472085cbd46d70a237a9

Base license: CC BY-NC-SA 4.0. The author granted a commercial-use exception
over Sketchfab direct messages on 2026-08-13, on the condition that vinyl or
digital files are not sold directly from the website. Sales happen on
Bandcamp and Subvert, not on this site, so the release stays inside that
condition. Attribution above stands regardless of the exception.

`assets/models/booth.glb` — decimated and texture-compressed via
`gltf-transform optimize` (529.7k tri / 8192px source down to 16.7k tri /
2048px WebP). `assets/models/source/90s_telephone_booth_ii.raw.glb` is the
untouched download, kept for re-baking if a higher-detail pass is ever
needed.

## Kiosk scan

`assets/models/kiosk.glb` is the phone kiosk in the inside world. Its source
is `assets/Phone Booth/3DModel.glb`, uploaded to this repo on 2026-09-24.
Where the scan came from and under what terms is not recorded yet. Fill this
in before release; if it is not the artist's own capture it needs the same
licence check as the booth above.

Baked with the glTF-Transform and meshoptimizer libraries: normals dropped
(the shader derives its own), vertices welded, simplified with borders
unlocked to 29.1k triangles, texture 4096px JPEG down to 1024px WebP,
quantised and meshopt compressed. 11.6MB down to 362K. The borders have to
be unlocked because the scan's vertices are split along every UV seam, and
`gltf-transform optimize --simplify` stalls at 141k triangles otherwise.
The shader samples the texture nearest-neighbour, so the downsampling reads
as crunch.

The upload itself, `assets/Phone Booth/` (about 26MB with the advanced
export), is not loaded by anything.

## Warehouse room

"Warehouse FBX Model Free" by Nicholas-3D (https://sketchfab.com/Nicholas01)
https://sketchfab.com/3d-models/warehouse-fbx-model-free-daa7fd3ff88945298d00045ca40a4c03

License: CC BY 4.0. Commercial use is permitted and attribution is required,
so unlike the booth there is no permission to chase.

"Cyberpunk character" by 4d_Bob (https://sketchfab.com/3d_Bob)
https://sketchfab.com/3d-models/cyberpunk-character-019f4b3fd3c74ed0bc6c8dbe9cd50d51

License: CC BY 4.0. Same terms.

Both models were downsampled for the web: textures to 512px JPEG (the
character shipped seven 4096px PNGs totalling 73MB, now 368K) and the glTF
image references rewritten to match. Geometry is untouched. The character
ships in an A-pose with no other animation, so the arms are posed down at
load from `config.character.pose` rather than by an animation clip.

## Shaders

The six shaders in `warehouse/src/shaders.js` were written for this release.
Nothing is imported from Shadertoy: the default license there is CC BY-NC-SA,
which does not survive contact with a paid release.

## Audio

`warehouse/assets/audio/*.m4a` are 128k AAC transcodes of the session WAVs.
The WAVs are not in the repo.

## Dancer models

"Female Body" by Alexander Antipov (https://sketchfab.com/Dessen)
https://sketchfab.com/3d-models/female-body-e96c6e3f43f44e73aac9e9791babe4fb

License: CC BY 4.0. Commercial use permitted, attribution required.

`warehouse/assets/models/dancer/` is the untouched download. The mesh ships
with no skeleton and no animation, so the movement in the projection is
vertex deformation written into `world.js` rather than skinning: a twist
that increases up the spine, a hip sway the torso leans against, and a wave
travelling upward. Nothing about the figures is traced, filmed or sampled.

"Capoeira Animation!" by WORLD LORD (https://sketchfab.com/kcoolrush)
https://sketchfab.com/3d-models/capoeira-animation-e7a8ce9bbd7442609f045687391c6635

"Alexia Dancing Twerk" by steamy56 (https://sketchfab.com/steamy56)
https://sketchfab.com/3d-models/alexia-dancing-twerk-8fd5ebed045c4541a1f9f095aa366b09

Both CC BY 4.0, commercial use permitted, attribution required. Both ship a
Mixamo clip and a skeleton, so unlike the still figure above they animate
themselves. `warehouse/assets/models/capoeira/` and `.../alexia/` are the
untouched downloads.

The three sources are mixed at random across the figure slots in the
projection. Each slot is a separate draw of its source at a different point
in the clip, which is why no skeleton is ever cloned.

"Woman Belly Dance" by Walter Araujo (https://sketchfab.com/walteraraujo)
https://sketchfab.com/3d-models/woman-belly-dance-nude

"Brazilian Woman - Samba Dancing" by Walter Araujo
https://sketchfab.com/3d-models/brazilian-woman-samba-dancing

"Dancing Twerk" by 0M3GA_SU9 (https://sketchfab.com/prestond23)
https://sketchfab.com/3d-models/dancing-twerk

All three CC BY 4.0, commercial use permitted, attribution required. Each
ships a skeleton and its own clip. Their textures were stripped on copy:
the projection overrides every material with its own, so the maps were
never sampled and shipping them cost 3.3MB for nothing.
