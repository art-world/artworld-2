// Raycasts against config.parts. Resolves named hotspots on the booth once
// it's loaded, and reports hover/select against those names only.

import * as THREE from 'three';

export function createInteractions(camera, booth, config, { onHover, onSelect } = {}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const partNames = new Set(Object.values(config.parts).map((p) => p.object));
  const targets = [];
  booth.traverse((node) => {
    if (node.isMesh && partNames.has(node.name)) targets.push(node);
  });

  let hovered = null;

  function partKeyFor(objectName) {
    return Object.entries(config.parts).find(([, p]) => p.object === objectName)?.[0] ?? null;
  }

  function pick(clientX, clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(targets, false);
    return hits[0]?.object ?? null;
  }

  function onPointerMove(e) {
    const hit = pick(e.clientX, e.clientY, e.target);
    const key = hit ? partKeyFor(hit.name) : null;
    if (key !== hovered) {
      hovered = key;
      onHover?.(key);
      e.target.style.cursor = key ? (config.parts[key].cursor ?? 'pointer') : 'default';
    }
  }

  function onClick(e) {
    const hit = pick(e.clientX, e.clientY, e.target);
    const key = hit ? partKeyFor(hit.name) : null;
    if (key) onSelect?.(key);
  }

  function attach(canvas) {
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
    };
  }

  return { attach };
}
