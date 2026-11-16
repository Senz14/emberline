// Relay Kestrel: a derelict solar relay station in a desert canyon, 46 by 40
// metres, flat. Three lanes connect the Vanguard spawn in the south to the
// two bomb sites: Site A (the Antenna Array, west) and Site B (the Coolant
// Yard, east). Mid runs past the relay pylon. Every obstacle is an axis-aligned
// box the physics module can slide against; the nav graph below is built on
// the same coordinates so bots and collision always agree.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

// [minX, minZ, maxX, maxZ, height, kind] — kind picks the material.
export const BOXES = [
  // Perimeter walls.
  [-23, -20, 23, -19.2, 4.5, 'concrete'],
  [-23, 19.2, 23, 20, 4.5, 'concrete'],
  [-23, -20, -22.2, 20, 4.5, 'concrete'],
  [22.2, -20, 23, 20, 4.5, 'concrete'],
  // Site A antenna array (west).
  [-20, -12, -16.5, -10, 2.2, 'rust'],
  [-20, -6, -18, -4, 1.2, 'concrete'],
  [-15.5, -16, -13.5, -14, 3.4, 'panel'],
  [-19, -18.5, -17, -16.5, 1.0, 'concrete'],
  // Site B coolant yard (east).
  [16.5, -12, 20, -10, 2.2, 'rust'],
  [18, -6, 20, -4, 1.2, 'concrete'],
  [13.5, -16, 15.5, -14, 3.4, 'panel'],
  [17, -18.5, 19, -16.5, 1.0, 'concrete'],
  // Mid: relay pylon and its housing.
  [-1.2, -3, 1.2, 3, 6.5, 'pylon'],
  [-4, -1, -2, 1, 1.4, 'concrete'],
  [2, -1, 4, 1, 1.4, 'concrete'],
  [-6, 6, -4, 8, 2.6, 'rust'],
  [4, 6, 6, 8, 2.6, 'rust'],
  // West lane crates.
  [-14, 2, -12, 4, 1.6, 'crate'],
  [-10, -2, -8, 0, 1.1, 'crate'],
  [-18, 8, -16, 10, 1.6, 'crate'],
  // East lane crates.
  [12, 2, 14, 4, 1.6, 'crate'],
  [8, -2, 10, 0, 1.1, 'crate'],
  [16, 8, 18, 10, 1.6, 'crate'],
  // Spawn cover.
  [-6, 12, -4, 14, 1.3, 'concrete'],
  [4, 12, 6, 14, 1.3, 'concrete'],
  [-3, -12, -1, -10, 1.2, 'concrete'],
  [1, -12, 3, -10, 1.2, 'concrete'],
  // Mid connectors.
  [-8, 10, -6, 12, 1.8, 'rust'],
  [6, 10, 8, 12, 1.8, 'rust'],
];

// [x, z, radius, height, kind] — cylinders are turned into square footprints
// for collision so the physics stays axis-aligned.
export const CYLINDERS = [
  [-17.5, -8, 1.4, 2.8, 'tank'],
  [17.5, -8, 1.4, 2.8, 'tank'],
  [0, -14, 1.8, 3.2, 'pylon'],
  [-12, 14, 1.2, 2.2, 'tank'],
  [12, 14, 1.2, 2.2, 'tank'],
];

export const SITES = {
  A: { x: -17.5, z: -13, radius: 4.2, label: 'A' },
  B: { x: 17.5, z: -13, radius: 4.2, label: 'B' },
};

export const SPAWNS = {
  vanguard: [
    [-14, 16.5], [-10, 17.5], [-6, 16.5], [-2, 17.5], [2, 16.5],
  ],
  sentinel: [
    [-14, -16.5], [-8, -17.5], [0, -16.5], [8, -17.5], [14, -16.5],
  ],
};

export const BOUNDS = { minX: -22, maxX: 22, minZ: -19, maxZ: 19 };

// Waypoint graph over the open lanes. Nodes sit in clear space; edges only
// join nodes whose straight line stays clear of boxes.
export const NODES = [
  [-20, 16], [-14, 16], [-8, 16], [-2, 16], [4, 16], [10, 16], [16, 16], [20, 16],
  [-20, 10], [-14, 10], [-8, 10], [-2, 10], [4, 10], [10, 10], [16, 10], [20, 10],
  [-20, 4], [-14, 4], [-8, 4], [-2, 4], [4, 4], [10, 4], [16, 4], [20, 4],
  [-20, -2], [-14, -2], [-8, -2], [-2, -2], [4, -2], [10, -2], [16, -2], [20, -2],
  [-20, -8], [-14, -8], [-8, -8], [-2, -8], [4, -8], [10, -8], [16, -8], [20, -8],
  [-20, -14], [-14, -14], [-8, -14], [-2, -14], [4, -14], [10, -14], [16, -14], [20, -14],
  [-17.5, -13], [17.5, -13],
];

export const EDGES = [];
(function buildEdges() {
  const index = new Map(NODES.map((node, i) => [node[0] + ',' + node[1], i]));
  const deltas = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  // Grid adjacency: nodes are 6 apart horizontally and vertically.
  for (let i = 0; i < NODES.length; i++) {
    for (const [dx, dz] of deltas) {
      const key = (NODES[i][0] + dx * 6) + ',' + (NODES[i][1] + dz * 6);
      const j = index.get(key);
      if (j !== undefined && j > i) EDGES.push([i, j]);
    }
  }
  // Site nodes connect to their nearest row.
  const a = NODES.length - 2;
  const b = NODES.length - 1;
  EDGES.push([a, index.get('-20,-14')], [a, index.get('-14,-14')], [b, index.get('16,-14')], [b, index.get('20,-14')]);
})();

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function sandTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#c98d4e';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const shade = Math.random();
      ctx.fillStyle = shade < 0.5 ? 'rgba(138,90,48,0.25)' : 'rgba(232,180,110,0.22)';
      const r = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,60,30,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      const y = Math.random() * size;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + 8, size * 0.7, y - 8, size, y);
      ctx.stroke();
    }
  });
}

function concreteTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#6e6a63';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(40,36,32,0.2)' : 'rgba(160,155,145,0.16)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 4, 2 + Math.random() * 4);
    }
    ctx.strokeStyle = 'rgba(30,28,26,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  });
}

function letterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,16,12,0.55)';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 2.4, 1);
  return sprite;
}

// Build the whole scene and return the colliders plus the animated bits the
// main loop drives (beacon light, site rings, the two site sprites).
export function createWorld(scene) {
  const sand = sandTexture();
  sand.repeat.set(12, 11);
  const concrete = concreteTexture();
  concrete.repeat.set(2, 2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 40),
    new THREE.MeshStandardMaterial({ map: sand, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const materials = {
    concrete: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: PALETTE.concreteDark, roughness: 0.92 }),
    rust: new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.85, metalness: 0.25 }),
    panel: new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 0.35, metalness: 0.6, emissive: 0x0a2530, emissiveIntensity: 0.5 }),
    pylon: new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 0.55, metalness: 0.4 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x5a6a72, roughness: 0.45, metalness: 0.7 }),
    rock: new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1 }),
  };

  const colliders = [];
  const occluders = [];
  const addBox = (minX, minZ, maxX, maxZ, height, kind) => {
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[kind] || materials.concrete);
    mesh.position.set((minX + maxX) / 2, height / 2, (minZ + maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const collider = { minX, maxX, minZ, maxZ, minY: 0, maxY: height };
    colliders.push(collider);
    if (height >= 1.4) occluders.push(collider);
    return collider;
  };
  for (const [minX, minZ, maxX, maxZ, height, kind] of BOXES) addBox(minX, minZ, maxX, maxZ, height, kind);
  for (const [x, z, radius, height, kind] of CYLINDERS) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 18), materials[kind] || materials.tank);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const collider = { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, minY: 0, maxY: height };
    colliders.push(collider);
    occluders.push(collider);
  }

  // Canyon walls beyond the fence, purely decorative.
  const rockGeometry = new THREE.BoxGeometry(1, 1, 1);
  const rockPositions = [
    [-27, 4, 0, 10, 26, 4], [27, 4, 0, 10, 26, 4],
    [0, 5, -25, 34, 10, 4], [0, 6, 25, 34, 12, 4],
    [-26, 3, -24, 8, 6, 6], [26, 3, 24, 8, 6, 6],
  ];
  for (const [x, y, z, w, h, d] of rockPositions) {
    const rock = new THREE.Mesh(rockGeometry, materials.rock);
    rock.position.set(x, y, z);
    rock.scale.set(w, h, d);
    rock.rotation.y = (x + z) * 0.02;
    scene.add(rock);
  }

  // Site rings and floating letters.
  const siteRings = {};
  for (const [key, site] of Object.entries(SITES)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.18, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? PALETTE.vanguard : PALETTE.sentinel, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.05, site.z);
    scene.add(ring);
    siteRings[key] = ring;
    const sprite = letterSprite(site.label, key === 'A' ? '#e8a33d' : '#3da5a0');
    sprite.position.set(site.x, 4.0, site.z);
    scene.add(sprite);
  }

  // The relay pylon's beacon.
  const beaconLight = new THREE.PointLight(0xff6a3d, 30, 26, 1.6);
  beaconLight.position.set(0, 7, 0);
  scene.add(beaconLight);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6a3d }),
  );
  beacon.position.set(0, 6.7, 0);
  scene.add(beacon);

  // Site point lights so the plant areas read at dusk.
  for (const site of Object.values(SITES)) {
    const light = new THREE.PointLight(0xffc27a, 12, 14, 1.8);
    light.position.set(site.x, 3.4, site.z);
    scene.add(light);
  }

  return { colliders, occluders, siteRings, beaconLight, beacon };
}
