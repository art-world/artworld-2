# GaussianSplats3D

`gaussian-splats-3d.module.js` is `build/gaussian-splats-3d.module.js` from
`@mkkellogg/gaussian-splats-3d` 0.4.7 (MIT, see `LICENSE`), copied here so
the underbridge world has no runtime dependency on anyone else's server. It
imports `three` through the page's import map, which points at the vendored
r170.

One change from upstream, marked `ARTWORLD patch` in the file: the reader
for compressed PLY skips the spherical harmonics section when the file has
none, instead of throwing and loading an empty scene.
