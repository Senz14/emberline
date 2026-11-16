// Thrown grenades: a small mesh with a gravity arc and one bounce, then a
// detonation per kind. Frag hurts through fragDamageAt (the caller applies
// it, so the thrower is never hurt by their own charge); flash blinds through
// the effects module; smoke lays a cloud that blocks sight.

import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FRAG_RADIUS = 9;
const FRAG_MAX_DAMAGE = 110;
const FLASH_RADIUS = 22;
const SMOKE_DURATION = 14;

export function createGrenadeList(scene, hooks) {
  const items = [];
  const geometry = new THREE.SphereGeometry(0.09, 10, 10);
  const materials = {
    frag: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.7 }),
    flash: new THREE.MeshStandardMaterial({ color: 0xf2ede4, roughness: 0.3, metalness: 0.2 }),
    smoke: new THREE.MeshStandardMaterial({ color: PALETTE.sentinel, roughness: 0.5, metalness: 0.3 }),
  };

  function throwGrenade(kind, origin, direction, thrower) {
    const mesh = new THREE.Mesh(geometry, materials[kind]);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    items.push({
      kind,
      mesh,
      thrower,
      velocity: {
        x: direction.x * 13 + (Math.random() - 0.5) * 0.4,
        y: direction.y * 13 + 4.5,
        z: direction.z * 13 + (Math.random() - 0.5) * 0.4,
      },
      fuse: kind === 'frag' ? 1.6 : kind === 'flash' ? 1.1 : 0.9,
      bounced: false,
    });
  }

  function detonate(item, onDamage) {
    const position = item.mesh.position;
    if (item.kind === 'frag') {
      if (hooks.explosion) hooks.explosion(position, item.thrower);
      onDamage(position, FRAG_RADIUS, FRAG_MAX_DAMAGE, item.thrower);
    } else if (item.kind === 'flash') {
      if (hooks.flash) hooks.flash(position, FLASH_RADIUS);
    } else if (item.kind === 'smoke') {
      if (hooks.smoke) hooks.smoke(position, SMOKE_DURATION);
    }
    scene.remove(item.mesh);
  }

  return {
    throwGrenade,
    step(dt, onDamage) {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.fuse -= dt;
        item.velocity.y -= 14 * dt;
        item.mesh.position.x += item.velocity.x * dt;
        item.mesh.position.y += item.velocity.y * dt;
        item.mesh.position.z += item.velocity.z * dt;
        if (item.mesh.position.y <= 0.09) {
          item.mesh.position.y = 0.09;
          if (!item.bounced && Math.abs(item.velocity.y) > 3) {
            item.velocity.y = -item.velocity.y * 0.4;
            item.velocity.x *= 0.7;
            item.velocity.z *= 0.7;
            item.bounced = true;
          } else {
            item.velocity.y = 0;
            item.velocity.x *= 0.8;
            item.velocity.z *= 0.8;
          }
        }
        if (item.fuse <= 0) {
          detonate(item, onDamage);
          items.splice(i, 1);
        }
      }
    },
    clear() {
      for (const item of items) scene.remove(item.mesh);
      items.length = 0;
    },
  };
}

// Damage at a point from a frag blast: full up close, falling off with
// distance, halved when a wall stands between the blast and the victim.
export function fragDamageAt(blast, target, occluders) {
  const dx = target.x - blast.x;
  const dz = target.z - blast.z;
  const dy = (target.y + 0.9) - blast.y;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= FRAG_RADIUS) return 0;
  let damage = FRAG_MAX_DAMAGE * (1 - distance / FRAG_RADIUS);
  const steps = Math.max(1, Math.ceil(distance / 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = blast.x + dx * t;
    const z = blast.z + dz * t;
    const y = blast.y + dy * t;
    for (const obstacle of occluders) {
      if (y < obstacle.minY || y > obstacle.maxY) continue;
      if (x >= obstacle.minX && x <= obstacle.maxX && z >= obstacle.minZ && z <= obstacle.maxZ) {
        damage *= 0.5;
        return Math.round(damage);
      }
    }
  }
  return Math.round(damage);
}

export { FRAG_RADIUS, FRAG_MAX_DAMAGE, FLASH_RADIUS, SMOKE_DURATION };
