// Hitscan combat: one ray per pellet against analytic body shapes — a
// torso box and a head sphere per actor — plus the world's occluders. The
// first thing a ray meets wins; walls stop pellets, bodies take damage.
// Friendly fire is off: a ray ignores teammates of its shooter.

import * as THREE from 'three';
import { hasLineOfSight } from './physics.js';

const HEAD_RADIUS = 0.22;
const HEAD_Y = 1.5;
const TORSO_HALF = 0.34;
const TORSO_TOP = 1.42;
const TORSO_BOTTOM = 0.15;

export function createCombat(world) {
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // The nearest hit along a ray, or null. Actors are tested as a head sphere
  // then a torso box; occluders are tested as boxes at the ray's height.
  function raycast(originVector, directionVector, shooter, actors, maxRange) {
    let best = null;
    for (const actor of actors) {
      if (actor === shooter || !actor.alive) continue;
      if (actor.team === shooter.team) continue;
      const position = actor.body.position;
      // Head sphere.
      const headCenter = { x: position.x, y: position.y + HEAD_Y, z: position.z };
      const toHead = { x: headCenter.x - originVector.x, y: headCenter.y - originVector.y, z: headCenter.z - originVector.z };
      const along = toHead.x * directionVector.x + toHead.y * directionVector.y + toHead.z * directionVector.z;
      if (along > 0 && along <= maxRange) {
        const closestSq = (toHead.x - directionVector.x * along) ** 2 + (toHead.y - directionVector.y * along) ** 2 + (toHead.z - directionVector.z * along) ** 2;
        if (closestSq <= HEAD_RADIUS * HEAD_RADIUS && (!best || along < best.distance)) {
          best = { actor, distance: along, part: 'head' };
        }
      }
      // Torso box.
      const minX = position.x - TORSO_HALF;
      const maxX = position.x + TORSO_HALF;
      const minY = position.y + TORSO_BOTTOM;
      const maxY = position.y + TORSO_TOP;
      const minZ = position.z - TORSO_HALF;
      const maxZ = position.z + TORSO_HALF;
      let tMin = 0;
      let tMax = maxRange;
      const axes = [
        [originVector.x, directionVector.x, minX, maxX],
        [originVector.y, directionVector.y, minY, maxY],
        [originVector.z, directionVector.z, minZ, maxZ],
      ];
      let inside = true;
      for (const [o, d, min, max] of axes) {
        if (Math.abs(d) < 1e-8) {
          if (o < min || o > max) { inside = false; break; }
        } else {
          let t1 = (min - o) / d;
          let t2 = (max - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tMin = Math.max(tMin, t1);
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) { inside = false; break; }
        }
      }
      if (inside && tMin <= maxRange && (!best || tMin < best.distance)) {
        best = { actor, distance: tMin, part: 'body' };
      }
    }
    // Walls: a wall nearer than the best body hit blocks the shot.
    for (const obstacle of world.occluders) {
      const minX = obstacle.minX;
      const maxX = obstacle.maxX;
      const minY = obstacle.minY;
      const maxY = obstacle.maxY;
      const minZ = obstacle.minZ;
      const maxZ = obstacle.maxZ;
      let tMin = 0;
      let tMax = maxRange;
      const axes = [
        [originVector.x, directionVector.x, minX, maxX],
        [originVector.y, directionVector.y, minY, maxY],
        [originVector.z, directionVector.z, minZ, maxZ],
      ];
      let inside = true;
      for (const [o, d, min, max] of axes) {
        if (Math.abs(d) < 1e-8) {
          if (o < min || o > max) { inside = false; break; }
        } else {
          let t1 = (min - o) / d;
          let t2 = (max - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          tMin = Math.max(tMin, t1);
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) { inside = false; break; }
        }
      }
      if (inside && tMin <= maxRange && (!best || tMin < best.distance)) {
        best = { actor: null, distance: tMin, part: 'wall' };
      }
    }
    return best;
  }

  return {
    // Fire one trigger pull. Returns every body hit (a shotgun volley can
    // hit more than one actor), the ray's end point for the tracer, and
    // whether a wall stopped it.
    resolveShot(eye, aim, def, spread, shooter, actors, random) {
      const hits = [];
      const pellets = def.pellets || 1;
      let endPoint = null;
      let blocked = false;
      for (let p = 0; p < pellets; p++) {
        direction.copy(aim);
        const jitter = spread * (p === 0 ? 0.4 : 1);
        direction.x += (random() * 2 - 1) * jitter;
        direction.y += (random() * 2 - 1) * jitter;
        direction.z += (random() * 2 - 1) * jitter;
        direction.normalize();
        origin.copy(eye);
        const hit = raycast(origin, direction, shooter, actors, def.range);
        const end = origin.clone().addScaledVector(direction, hit ? hit.distance : def.range);
        if (p === 0) endPoint = end;
        if (!hit) continue;
        if (hit.actor === null) {
          blocked = true;
          continue;
        }
        // Bot-on-bot damage is scaled down: bot duels last longer, so a
        // round is decided by positioning and the player's contribution
        // rather than the first crossfire. Damage involving the player is
        // unscaled — the player should feel both powerful and threatened.
        const scale = shooter.isBot && hit.actor.isBot ? 0.75 : 1;
        const damage = Math.round(def.damage * (hit.part === 'head' ? def.headshot : 1) * scale);
        const died = hit.actor.damage(damage, hit.part === 'head');
        hits.push({ actor: hit.actor, part: hit.part, damage, killed: died });
      }
      return { hits, endPoint, blocked };
    },
    // Can this shooter see that target at all (walls only; smoke is checked
    // separately, because smoke blocks sight but not bullets)?
    canSee(from, to) {
      return hasLineOfSight(from, to, world.occluders, 1.4);
    },
  };
}
